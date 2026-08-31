// Shared OTA calendar importer for Pages Functions and the scheduled Worker.
// Feed URLs are bearer secrets: D1 receives authenticated ciphertext only and
// the browser receives connection metadata, never the URL.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);
const PROVIDERS = new Set(['booking', 'airbnb']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FEED_BYTES = 1024 * 1024;
const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);

function bytesToB64(bytes) {
  let s = ''; const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(value) {
  const s = atob(String(value || '')), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function feedKey(secret) {
  if (!secret || String(secret).length < 24) throw new Error('hotel-sync-key-missing');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('kiwi-hotel-ical-v1\0' + String(secret)));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function encryptFeed(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await feedKey(secret), enc.encode(String(value)));
  return `v1.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(body))}`;
}
export async function decryptFeed(value, secret) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('hotel-feed-format');
  const body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(parts[1]) }, await feedKey(secret), b64ToBytes(parts[2]));
  return dec.decode(body);
}

export function normalizeFeedUrl(value, provider) {
  let raw = str(value, 2000);
  if (/^webcal:\/\//i.test(raw)) raw = 'https://' + raw.slice(9);
  let url; try { url = new URL(raw); } catch (_) { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
  const host = url.hostname.toLowerCase();
  const allowed = provider === 'airbnb'
    ? (host === 'airbnb.com' || host.endsWith('.airbnb.com'))
    : provider === 'booking'
      ? (host === 'booking.com' || host.endsWith('.booking.com'))
      : false;
  if (!allowed) return '';
  url.hash = '';
  return url.toString();
}

function unescapeIcal(v) {
  return String(v || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}
function dateValue(v) {
  const m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
export function parseIcal(text) {
  const source = String(text || '').replace(/\r?\n[ \t]/g, '').replace(/\r\n/g, '\n');
  const chunks = source.split(/BEGIN:VEVENT\s*\n/i).slice(1), out = [];
  for (const chunk of chunks.slice(0, 1000)) {
    const block = chunk.split(/END:VEVENT/i)[0] || '', fields = Object.create(null);
    for (const line of block.split('\n')) {
      const at = line.indexOf(':'); if (at < 1) continue;
      const key = line.slice(0, at).split(';')[0].trim().toUpperCase();
      if (!fields[key]) fields[key] = unescapeIcal(line.slice(at + 1));
    }
    const uid = str(fields.UID, 500), checkIn = dateValue(fields.DTSTART), checkOut = dateValue(fields.DTEND);
    if (!uid || !DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn || String(fields.STATUS || '').toUpperCase() === 'CANCELLED') continue;
    out.push({ uid, checkIn, checkOut });
  }
  return out;
}

async function sha(value) {
  const body = await crypto.subtle.digest('SHA-256', enc.encode(String(value)));
  return [...new Uint8Array(body)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function parseJson(v, fallback) { try { const x = JSON.parse(v); return x && typeof x === 'object' ? x : fallback; } catch (_) { return fallback; } }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
function dateParts(epoch) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Casablanca', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(epoch));
  const out = {}; parts.forEach((p) => { if (p.type !== 'literal') out[p.type] = p.value; }); return out;
}
function at(date, time) {
  const target = Date.parse(`${date}T${time}:00Z`); let guess = target;
  for (let i=0;i<3;i++) { const p=dateParts(guess), seen=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); guess += target-seen; }
  return guess;
}
function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }

async function fetchFeed(env, rawUrl, provider) {
  const run = env?.HOTEL_FEED_FETCH || fetch;
  let url = normalizeFeedUrl(rawUrl, provider);
  if (!url) throw new Error('invalid-feed-url');
  for (let hop = 0; hop < 3; hop++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    let res;
    try { res = await run(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/calendar, text/plain;q=0.9' } }); }
    finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const next = normalizeFeedUrl(new URL(res.headers.get('Location') || '', url).toString(), provider);
      if (!next) throw new Error('unsafe-feed-redirect');
      url = next; continue;
    }
    if (!res.ok) throw new Error('feed-http-' + res.status);
    const declared = Number(res.headers.get('Content-Length') || 0);
    if (declared > MAX_FEED_BYTES) throw new Error('feed-too-large');
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > MAX_FEED_BYTES) throw new Error('feed-too-large');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('feed-not-calendar');
    return parseIcal(text);
  }
  throw new Error('feed-redirect-loop');
}

async function loadDocs(env, merchant) {
  const rows = await env.DB.batch([
    env.DB.prepare("SELECT data,rev FROM store_docs WHERE merchant=? AND feature='reservations'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant),
  ]);
  const first = (x) => x?.results?.[0] || null;
  return { reservations: first(rows[0]), rooms: first(rows[1]) };
}
async function writeDoc(env, merchant, doc, rev, now) {
  const text = JSON.stringify(doc), next = rev + 1;
  const result = rev
    ? await env.DB.prepare("UPDATE store_docs SET data=?,rev=?,updated_ts=? WHERE merchant=? AND feature='reservations' AND rev=?").bind(text, next, now, merchant, rev).run()
    : await env.DB.prepare("INSERT OR IGNORE INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'reservations',?,1,?)").bind(merchant, text, now).run();
  return (result?.meta?.changes || 0) > 0;
}

export async function syncHotelChannel(env, row) {
  const merchant = str(row?.merchant, 64), provider = str(row?.channel, 20), feedId = str(row?.id, 64);
  if (!merchant || !feedId || !PROVIDERS.has(provider) || !env?.DB || !env?.AUTH_SECRET) throw new Error('invalid-channel');
  const cfg = parseJson(row.config, {}), feed = await decryptFeed(cfg.feedEnc, env.AUTH_SECRET);
  const events = await fetchFeed(env, feed, provider), now = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await loadDocs(env, merchant), roomsDoc = parseJson(rows.rooms?.data, {}), doc = parseJson(rows.reservations?.data, { v:1, settings:{}, services:[], resources:[], blocked:[], bookings:[] });
    doc.bookings = Array.isArray(doc.bookings) ? doc.bookings : [];
    const roomList = Array.isArray(roomsDoc.rooms) ? roomsDoc.rooms : [], typeList = Array.isArray(roomsDoc.roomTypes) ? roomsDoc.roomTypes : [];
    const room = roomList.find((x) => x && !x.deletedAt && String(x.id) === String(cfg.roomId));
    const type = room && typeList.find((x) => x && !x.deletedAt && String(x.id) === String(room.typeId));
    if (!room || !type) throw new Error('mapped-room-missing');
    const seen = new Set(), imported = [], conflicts = [];
    for (const event of events) {
      const nights = daysBetween(event.checkIn, event.checkOut); if (nights < 1 || nights > 730) continue;
      const digest = (await sha(feedId + '\0' + event.uid)).slice(0, 32), externalRef = 'ical-' + digest;
      seen.add(externalRef);
      const startAt = at(event.checkIn, '15:00'), endAt = at(event.checkOut, '11:00');
      let rec = doc.bookings.find((x) => x?.hotel?.feedId === feedId && x?.hotel?.externalRef === externalRef);
      const conflict = doc.bookings.some((x) => x !== rec && ACTIVE.has(x?.status) && x?.resourceId === room.id && overlaps(startAt, endAt, +x.startAt || 0, +x.endAt || 0));
      if (conflict) conflicts.push(externalRef);
      const rate = Number(type.rate ?? roomsDoc.baseRate) || 0;
      const next = {
        id: rec?.id || 'bk-' + crypto.randomUUID(), code: rec?.code || 'OTA-' + digest.slice(0, 8).toUpperCase(),
        customer: { name: (provider === 'airbnb' ? 'Airbnb' : 'Booking.com') + ' · Réservation', phone:'', email:'' },
        serviceId: String(type.id), resourceId: String(room.id), startAt, endAt, partySize:1, status:'confirmed', source:'import', note:'', manageToken:'',
        publicRef: 'feed-' + digest, hotel: { roomTypeName:str(type.name,100), checkIn:event.checkIn, checkOut:event.checkOut, nights, rate, total:Math.round(rate*nights), channel:provider, externalRef, feedId, syncedAt:now, conflict },
        createdAt:+rec?.createdAt || now, updatedAt:now,
      };
      if (rec) Object.assign(rec, next); else doc.bookings.push(next);
      imported.push(externalRef);
    }
    let cancelled = 0;
    for (const rec of doc.bookings) {
      if (rec?.hotel?.feedId === feedId && ACTIVE.has(rec.status) && rec.endAt >= now - 86400000 && !seen.has(rec.hotel.externalRef)) {
        rec.status = 'cancelled'; rec.updatedAt = now; rec.hotel.syncedAt = now; cancelled++;
      }
    }
    if (doc.bookings.length > 4000) doc.bookings = doc.bookings.slice(-4000);
    if (await writeDoc(env, merchant, doc, +rows.reservations?.rev || 0, now)) {
      await env.DB.prepare("UPDATE channel_links SET last_ts=?,last_err='' WHERE id=? AND merchant=?").bind(now, feedId, merchant).run();
      return { ok:true, merchant, id:feedId, provider, imported:imported.length, cancelled, conflicts:conflicts.length };
    }
  }
  throw new Error('write-conflict');
}

export async function syncHotelChannels(env, options = {}) {
  const merchant = str(options.merchant, 64), limit = Math.max(1, Math.min(100, +options.limit || 25));
  let sql = "SELECT id,merchant,channel,config FROM channel_links WHERE status='active' AND channel IN ('booking','airbnb')";
  const statement = merchant ? env.DB.prepare(sql + ' AND merchant=? ORDER BY created_ts LIMIT ?').bind(merchant, limit) : env.DB.prepare(sql + ' ORDER BY COALESCE(last_ts,0),created_ts LIMIT ?').bind(limit);
  const rows = await statement.all(), results = [];
  for (const row of rows.results || []) {
    try { results.push(await syncHotelChannel(env, row)); }
    catch (error) {
      const message = str(error?.message || error, 180);
      await env.DB.prepare('UPDATE channel_links SET last_err=? WHERE id=?').bind(message, row.id).run().catch(() => {});
      results.push({ ok:false, merchant:row.merchant, id:row.id, provider:row.channel, error:message });
    }
  }
  return { ok:true, processed:results.length, failed:results.filter((x) => !x.ok).length, results };
}

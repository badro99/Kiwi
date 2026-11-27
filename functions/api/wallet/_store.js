// Wallet card storage (tables in schema.sql, migration 0040). Every function
// takes the D1 binding first and never throws on "not found": it returns null,
// false or an empty list, so routes stay fail-soft.

const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomId(len) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[b[i] % 36];
  return s;
}

export async function issueCard(db, { merchant, clientId, platform, now = Date.now() }) {
  const had = await db.prepare('SELECT serial, auth_token FROM wallet_cards WHERE merchant = ? AND client_id = ? AND platform = ? AND revoked = 0 LIMIT 1')
    .bind(merchant, clientId, platform).first();
  if (had) return { serial: had.serial, authToken: had.auth_token, created: false };
  const serial = randomId(24), authToken = randomId(32);
  await db.prepare('INSERT INTO wallet_cards (serial, merchant, client_id, auth_token, platform, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?)')
    .bind(serial, merchant, clientId, authToken, platform, now, now).run();
  return { serial, authToken, created: true };
}

/* « Member since »: the first card this client was given at this shop (ms), or 0. */
export async function memberSince(db, merchant, clientId) {
  const r = await db.prepare('SELECT MIN(created_ts) AS t FROM wallet_cards WHERE merchant = ? AND client_id = ?').bind(merchant, clientId).first();
  return Number(r && r.t) || 0;
}

export const cardBySerial = (db, serial) =>
  db.prepare('SELECT * FROM wallet_cards WHERE serial = ?').bind(String(serial || '')).first();

export async function cardsForClient(db, merchant, clientId) {
  const r = await db.prepare('SELECT * FROM wallet_cards WHERE merchant = ? AND client_id = ? AND revoked = 0').bind(merchant, clientId).all();
  return r.results || [];
}

/* Moves only the cards whose shown balance changed; returns them. A sync that
   replays an unchanged client row therefore pushes nothing. */
export async function touchCards(db, merchant, clientId, balanceKey, now = Date.now()) {
  const r = await db.prepare('UPDATE wallet_cards SET last_balance = ?, updated_ts = ? WHERE merchant = ? AND client_id = ? AND revoked = 0 AND last_balance <> ? RETURNING serial, platform, auth_token')
    .bind(balanceKey, now, merchant, clientId, balanceKey).all();
  return r.results || [];
}

export const markCardUnsent = (db, serial) =>
  db.prepare("UPDATE wallet_cards SET last_balance = '' WHERE serial = ?").bind(serial).run();

export async function revokeClientCards(db, merchant, clientId, now = Date.now()) {
  const r = await db.prepare('UPDATE wallet_cards SET revoked = 1, updated_ts = ? WHERE merchant = ? AND client_id = ? AND revoked = 0')
    .bind(now, merchant, clientId).run();
  return (r.meta && r.meta.changes) || 0;
}

export async function registerDevice(db, { deviceId, serial, pushToken, now = Date.now() }) {
  const had = await db.prepare('SELECT 1 AS x FROM wallet_devices WHERE device_id = ? AND serial = ?').bind(deviceId, serial).first();
  if (had) {
    await db.prepare('UPDATE wallet_devices SET push_token = ? WHERE device_id = ? AND serial = ?').bind(pushToken, deviceId, serial).run();
    return 'exists';
  }
  await db.prepare('INSERT INTO wallet_devices (device_id, serial, push_token, created_ts) VALUES (?,?,?,?)').bind(deviceId, serial, pushToken, now).run();
  return 'created';
}

export const unregisterDevice = (db, deviceId, serial) =>
  db.prepare('DELETE FROM wallet_devices WHERE device_id = ? AND serial = ?').bind(deviceId, serial).run();

export async function devicesForSerial(db, serial) {
  const r = await db.prepare('SELECT device_id, push_token FROM wallet_devices WHERE serial = ?').bind(serial).all();
  return r.results || [];
}

export const dropPushToken = (db, pushToken) =>
  db.prepare('DELETE FROM wallet_devices WHERE push_token = ?').bind(pushToken).run();

export async function serialsUpdatedSince(db, deviceId, since) {
  const r = await db.prepare('SELECT c.serial, c.updated_ts FROM wallet_devices d JOIN wallet_cards c ON c.serial = d.serial WHERE d.device_id = ? AND c.updated_ts > ? ORDER BY c.updated_ts')
    .bind(deviceId, Number(since) || 0).all();
  const rows = r.results || [];
  return { serials: rows.map((x) => x.serial), lastUpdated: rows.length ? String(rows[rows.length - 1].updated_ts) : '' };
}

/* One statement: the receipt is claimed only while this client has fewer than
   `perDay` claims in the last 24 h, so two scans at the same instant cannot
   both pass the cap. 'claimed', 'taken' (the receipt already has an owner) or
   'limit'. */
export async function claimSale(db, merchant, saleId, clientId, now = Date.now(), perDay = Infinity) {
  const cap = Number.isFinite(perDay) ? perDay : 1e9;
  const r = await db.prepare(`INSERT OR IGNORE INTO wallet_claims (merchant, sale_id, client_id, claimed_ts)
    SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM wallet_claims WHERE merchant = ? AND client_id = ? AND claimed_ts > ?) < ?`)
    .bind(merchant, saleId, clientId, now, merchant, clientId, now - 86400_000, cap).run();
  if (r.meta && r.meta.changes) return 'claimed';
  const owned = await db.prepare('SELECT 1 AS x FROM wallet_claims WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).first();
  return owned ? 'taken' : 'limit';
}

export const releaseClaim = (db, merchant, saleId) =>
  db.prepare('DELETE FROM wallet_claims WHERE merchant = ? AND sale_id = ?').bind(merchant, saleId).run();

const TILL_TTL = 10 * 60_000;
export async function mintTillToken(db, merchant, clientId, now = Date.now()) {
  const token = randomId(28);
  await db.prepare('DELETE FROM wallet_tokens WHERE expires_ts < ?').bind(now).run();
  await db.prepare('INSERT INTO wallet_tokens (token, merchant, client_id, expires_ts) VALUES (?,?,?,?)').bind(token, merchant, clientId, now + TILL_TTL).run();
  return token;
}

export async function useTillToken(db, token, now = Date.now()) {
  const r = await db.prepare('DELETE FROM wallet_tokens WHERE token = ? RETURNING merchant, client_id, expires_ts').bind(String(token || '')).all();
  const row = (r.results || [])[0];
  return row && row.expires_ts >= now ? { merchant: row.merchant, clientId: row.client_id } : null;
}

/* What the owner sees in the dashboard: live cards by phone type, and how many
   Apple cards are really in a Wallet (a device registered for push). Google
   and the web card do not tell us when they are saved, so those are cards
   handed out. Revoked cards (client deleted) do not count. */
const WEEK = 7 * 86400_000;
/* The last seven days, to show the owner the card earns its place: new card
   holders (first card issued this week), receipts claimed, rewards used by card
   holders, and how many of the week's live sales carried a card holder. */
async function walletWeek(db, merchant, now) {
  const since = now - WEEK;
  const holders = 'SELECT client_id FROM wallet_cards WHERE merchant = ? AND revoked = 0';
  const one = async (sqlText, ...args) => Number(((await db.prepare(sqlText).bind(...args).first()) || {}).n || 0);
  return {
    newHolders: await one(`SELECT COUNT(*) AS n FROM (SELECT client_id FROM wallet_cards WHERE merchant = ? AND revoked = 0 GROUP BY client_id HAVING MIN(created_ts) > ?)`, merchant, since),
    receipts: await one('SELECT COUNT(*) AS n FROM wallet_claims WHERE merchant = ? AND claimed_ts > ?', merchant, since),
    rewards: await one(`SELECT COUNT(*) AS n FROM client_reward_events WHERE merchant = ? AND created_ts > ? AND (points_delta < 0 OR stamps_delta < 0) AND client_id IN (${holders})`, merchant, since, merchant),
    sales: await one('SELECT COUNT(*) AS n FROM sales WHERE merchant = ? AND ts > ? AND void_ts IS NULL', merchant, since),
    salesWithCard: await one(`SELECT COUNT(*) AS n FROM client_purchase_events WHERE merchant = ? AND created_ts > ? AND visits > 0 AND client_id IN (${holders})`, merchant, since, merchant),
  };
}

export async function walletStats(db, merchant, now = Date.now()) {
  const rows = (await db.prepare(`SELECT platform, COUNT(*) AS n, COUNT(DISTINCT client_id) AS c FROM wallet_cards
    WHERE merchant = ? AND revoked = 0 GROUP BY platform`).bind(merchant).all()).results || [];
  const clients = await db.prepare('SELECT COUNT(DISTINCT client_id) AS n FROM wallet_cards WHERE merchant = ? AND revoked = 0').bind(merchant).first();
  const inWallet = await db.prepare(`SELECT COUNT(DISTINCT c.serial) AS n FROM wallet_cards c JOIN wallet_devices d ON d.serial = c.serial
    WHERE c.merchant = ? AND c.revoked = 0 AND c.platform = 'apple'`).bind(merchant).first();
  const by = (p) => Number((rows.find((r) => r.platform === p) || {}).n || 0);
  const week = await walletWeek(db, merchant, now);
  return { clients: Number((clients && clients.n) || 0), apple: by('apple'), appleInWallet: Number((inWallet && inWallet.n) || 0), google: by('google'), web: by('web'), week };
}

// Just enough DER (ASN.1) to write a CMS signature and read the two fields we
// need out of an X.509 certificate. Writing is tag + length + bytes; reading
// walks the same triplets.

export function cat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function len(n) {
  if (n < 0x80) return Uint8Array.of(n);
  const b = [];
  while (n > 0) { b.unshift(n & 0xFF); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | b.length, ...b);
}

export const tlv = (tag, ...body) => { const b = cat(...body); return cat(Uint8Array.of(tag), len(b.length), b); };
export const seq = (...b) => tlv(0x30, ...b);
export const set = (...b) => tlv(0x31, ...b);
export const octets = (b) => tlv(0x04, b);
export const nul = () => Uint8Array.of(0x05, 0x00);
export const ctx = (n, ...b) => tlv(0xA0 | n, ...b);       /* [n] constructed */

export function int(n) {
  const b = [];
  do { b.unshift(n & 0xFF); n = Math.floor(n / 256); } while (n > 0);
  if (b[0] & 0x80) b.unshift(0);
  return tlv(0x02, Uint8Array.from(b));
}

export function oid(dotted) {
  const p = dotted.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const s = [v & 0x7F];
    let x = Math.floor(v / 128);
    while (x > 0) { s.unshift(0x80 | (x & 0x7F)); x = Math.floor(x / 128); }
    out.push(...s);
  }
  return tlv(0x06, Uint8Array.from(out));
}

export function utcTime(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  const s = p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  return tlv(0x17, new TextEncoder().encode(s));
}

/* DER orders the members of a SET OF by their encodings. */
export function setOf(items) {
  const sorted = items.slice().sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return set(...sorted);
}

/* One element at `at`: { tag, start (of value), end, full (whole TLV) }. */
export function read(buf, at = 0) {
  const tag = buf[at];
  let l = buf[at + 1], p = at + 2;
  if (l & 0x80) {
    const n = l & 0x7F;
    l = 0;
    for (let i = 0; i < n; i++) l = l * 256 + buf[p + i];
    p += n;
  }
  return { tag, start: p, end: p + l, full: buf.subarray(at, p + l) };
}

export function children(buf, el) {
  const out = [];
  for (let p = el.start; p < el.end;) { const c = read(buf, p); out.push(c); p = c.end; }
  return out;
}

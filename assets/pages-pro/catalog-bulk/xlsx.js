/* Kiwi · a small .xlsx reader and writer (globalThis.KiwiXlsx)
 *
 * An .xlsx file is a zip of XML parts. Reading one needs three things the
 * browser already has: the zip directory (read here by hand), the deflate
 * decoder (DecompressionStream('deflate-raw')) and a little XML. Writing needs
 * even less: the zip is written with STORED entries (no compression), which
 * Excel, Numbers, LibreOffice and Google Sheets all open. No dependency, no
 * runtime cost, nothing sent anywhere: the file never leaves the browser.
 *
 * read(bytes)  → Promise<{ sheet, rows: (string|number)[][] }>, first sheet
 *                only; shared strings, inline strings, formula strings,
 *                numbers and booleans.
 * write(rows, { sheet, widths }) → Uint8Array, first row in bold and frozen.
 *
 * Node 18+ has the same streams, so tools/catalog-bulk-test.mjs round-trips
 * through this exact code.
 */
(function (root) {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  /* ── zip: reading ─────────────────────────────────────────────────────── */
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  function directory(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-a-zip');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const out = new Map();
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('bad-zip');
      const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28);
      const extraLen = u16(b, p + 30), commentLen = u16(b, p + 32), local = u32(b, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      out.set(name.replace(/^\/+/, ''), { method, size, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('no-deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function entry(b, dir, name) {
    const e = dir.get(name);
    if (!e) return null;
    if (u32(b, e.local) !== 0x04034b50) throw new Error('bad-zip');
    const start = e.local + 30 + u16(b, e.local + 26) + u16(b, e.local + 28);
    const raw = b.subarray(start, start + e.size);
    if (e.method === 0) return dec.decode(raw);
    if (e.method === 8) return dec.decode(await inflate(raw));
    throw new Error('zip-method');
  }

  /* ── XML, just enough ─────────────────────────────────────────────────── */
  function unxml(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>';
      if (k === 'quot') return '"'; if (k === 'apos') return "'";
      const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    });
  }
  const attr = (tag, name) => {
    const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
    return m ? unxml(m[1]) : null;
  };
  /* Text runs of a string item (<si>, <is>): every <t>, phonetic runs out. */
  function runs(xml) {
    const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
    let out = '';
    body.replace(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g, (_, t) => { out += unxml(t); return ''; });
    return out;
  }
  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(String(ref || ''));
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  async function read(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dir = directory(b);
    const wb = await entry(b, dir, 'xl/workbook.xml');
    if (!wb) throw new Error('not-xlsx');
    const first = /<(?:\w+:)?sheet\b[^>]*>/.exec(wb);
    const sheetName = first ? attr(first[0], 'name') || '' : '';
    const rid = first ? (attr(first[0], 'r:id') || attr(first[0], 'id')) : null;
    let path = 'xl/worksheets/sheet1.xml';
    const rels = await entry(b, dir, 'xl/_rels/workbook.xml.rels');
    if (rels && rid) {
      const rel = (rels.match(/<(?:\w+:)?Relationship\b[^>]*>/g) || []).find((t) => attr(t, 'Id') === rid);
      const target = rel && attr(rel, 'Target');
      if (target) path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    }
    const sst = await entry(b, dir, 'xl/sharedStrings.xml');
    const strings = sst ? (sst.match(/<(?:\w+:)?si\b[\s\S]*?<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g) || []).map(runs) : [];
    const xml = await entry(b, dir, path);
    if (xml == null) throw new Error('no-sheet');
    const rows = [];
    const rowRe = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>|<(?:\w+:)?row\b([^>]*)\/>/g;
    let rm, next = 0;
    while ((rm = rowRe.exec(xml))) {
      const rAttr = rm[1] != null ? rm[1] : rm[3];
      const rn = parseInt(attr(' ' + rAttr, 'r') || '', 10);
      const ri = Number.isFinite(rn) ? rn - 1 : next;
      next = ri + 1;
      const row = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let cm, col = 0;
      while ((cm = cellRe.exec(rm[2] || ''))) {
        const a = ' ' + cm[1];
        const ref = attr(a, 'r');
        const ci = ref ? colIndex(ref) : col;
        col = ci + 1;
        const t = attr(a, 't') || 'n';
        const inner = cm[2] || '';
        const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        let value = '';
        if (t === 's') value = v ? (strings[parseInt(v[1], 10)] ?? '') : '';
        else if (t === 'inlineStr') value = runs(inner);
        else if (t === 'str' || t === 'e') value = v ? unxml(v[1]) : '';
        else if (t === 'b') value = v ? (v[1].trim() === '1') : '';
        else if (v) { const n = Number(v[1]); value = Number.isFinite(n) ? n : unxml(v[1]); }
        row[ci] = value;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      rows[ri] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return { sheet: sheetName, rows };
  }

  /* ── zip: writing (STORED entries) ────────────────────────────────────── */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01, a fixed stamp: same rows, same bytes
    files.forEach(({ name, data }) => {
      const nb = enc.encode(name), crc = crc32(data);
      const h = new Uint8Array(30 + nb.length); const dv = new DataView(h.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true); dv.setUint16(12, DOS_DATE, true); dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nb.length, true); dv.setUint16(28, 0, true);
      h.set(nb, 30);
      const c = new Uint8Array(46 + nb.length); const cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, DOS_DATE, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nb.length, true);
      cv.setUint32(42, offset, true); c.set(nb, 46);
      parts.push(h, data); central.push(c);
      offset += h.length + data.length;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const all = parts.concat(central, [end]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; all.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  /* Characters XML 1.0 refuses are dropped, never escaped: Excel would call
     the whole file corrupt for one stray control code in a product name. */
  const xmlText = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function colName(i) {
    let s = '', n = i + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function write(rows, opts) {
    const o = opts || {};
    const sheet = xmlText(String(o.sheet || 'Catalogue').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Catalogue');
    const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
    const cols = width ? '<cols>' + Array.from({ length: width }, (_, i) => {
      const w = (o.widths && o.widths[i]) || Math.min(48, Math.max(10, ...rows.slice(0, 200).map((r) => String((r && r[i]) == null ? '' : r[i]).length + 2)));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    }).join('') + '</cols>' : '';
    const body = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + (r || []).map((v, ci) => {
      const ref = colName(ci) + (ri + 1), style = ri === 0 ? ' s="1"' : '';
      if (v == null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}"${style} t="b"><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const files = [
      ['[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>'],
      ['_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', head + `<workbook xmlns="${NS}" xmlns:r="${R}"><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="' + R + '/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', head + `<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        + '</styleSheet>'],
      ['xl/worksheets/sheet1.xml', head + `<worksheet xmlns="${NS}" xmlns:r="${R}">`
        + (rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '')
        + cols + '<sheetData>' + body + '</sheetData></worksheet>'],
    ];
    return zip(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
  }

  root.KiwiXlsx = { read, write, _zip: zip, _crc32: crc32, _colName: colName };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* Pressing till · software Code 39 reader for the camera scan.
 * Phones whose browser has no BarcodeDetector (iOS Safari, Firefox) still read
 * the garment tags: Kiwi prints them in Code 39 (assets/pressing/custody.js
 * barcode()). Each frame is drawn small on a canvas, a dozen rows are turned
 * into bar/space widths and matched against the Code 39 table, in both reading
 * directions. Two rows must agree before a value is accepted, so a smudge that
 * decodes once by chance is not taken for a ticket. No network, no library. */

const PATTERNS = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  A:'wnnnnwnnw',B:'nnwnnwnnw',C:'wnwnnwnnn',D:'nnnnwwnnw',E:'wnnnwwnnn',F:'nnwnwwnnn',
  G:'nnnnnwwnw',H:'wnnnnwwnn',I:'nnwnnwwnn',J:'nnnnwwwnn',K:'wnnnnnnww',L:'nnwnnnnww',
  M:'wnwnnnnwn',N:'nnnnwnnww',O:'wnnnwnnwn',P:'nnwnwnnwn',Q:'nnnnnnwww',R:'wnnnnnwwn',
  S:'nnwnnnwwn',T:'nnnnwnwwn',U:'wwnnnnnnw',V:'nwwnnnnnw',W:'wwwnnnnnn',X:'nwnnwnnnw',
  Y:'wwnnwnnnn',Z:'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','*':'nwnnwnwnn',
  '$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn',
};
const BY_PATTERN = new Map(Object.entries(PATTERNS).map(([ch, p]) => [p, ch]));

/* Nine widths (bar, space, bar, …) to a character, or null. Code 39 has
 * exactly three wide elements, clearly wider than the six narrow ones. */
function readChar(widths) {
  const sorted = [...widths].sort((a, b) => b - a);
  const wideMin = sorted[2], narrowMax = sorted[3];
  if (!(wideMin >= narrowMax * 1.6)) return null;
  const narrowMin = sorted[8];
  if (sorted[0] > narrowMin * 5) return null;
  const threshold = (wideMin + narrowMax) / 2;
  return BY_PATTERN.get(widths.map((w) => (w > threshold ? 'w' : 'n')).join('')) || null;
}

/* Run lengths of one row, starting with a dark run. Returns the decoded text
 * (without the * guards) or null. */
export function decodeRuns(runs) {
  for (let start = 0; start + 9 <= runs.length; start += 2) {
    if (readChar(runs.slice(start, start + 9)) !== '*') continue;
    let text = '', at = start + 10;
    while (at + 9 <= runs.length) {
      const ch = readChar(runs.slice(at, at + 9));
      if (ch === null) break;
      if (ch === '*') {
        if (text) return text;
        break;
      }
      text += ch;
      at += 10;
    }
  }
  return null;
}

/* One row of grey levels (0 dark … 255 light) to run lengths starting dark. */
export function rowRuns(row) {
  let min = 255, max = 0;
  for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 40) return [];
  const cut = (min + max) / 2;
  const runs = [];
  let dark = null, len = 0;
  for (const v of row) {
    const d = v < cut;
    if (dark === null) { if (!d) continue; dark = true; len = 1; continue; }
    if (d === dark) len++;
    else { runs.push(len); dark = d; len = 1; }
  }
  if (dark) runs.push(len);
  return runs;
}

/* A light [1 2 1] filter: camera noise must not split a bar in two. */
function smooth(row) {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = row[i > 0 ? i - 1 : i], b = row[i], c = row[i < row.length - 1 ? i + 1 : i];
    out[i] = (a + 2 * b + c) >> 2;
  }
  return out;
}

/* A grey image (Uint8 array, width × height) to the text two rows agree on. */
export function decodeGray(gray, width, height, rows = 13) {
  const seen = new Map();
  for (let i = 0; i < rows; i++) {
    const y = Math.round(height * (0.2 + 0.6 * (i / Math.max(1, rows - 1))));
    const row = smooth(gray.subarray(y * width, y * width + width));
    /* Each row counts once, whichever way round it reads. */
    const text = decodeRuns(rowRuns(row)) || decodeRuns(rowRuns(Uint8Array.from(row).reverse()));
    if (!text) continue;
    const n = (seen.get(text) || 0) + 1;
    if (n >= 2) return text;
    seen.set(text, n);
  }
  return null;
}

export function grayFromRgba(data, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return gray;
}

/* A reader bound to one video element: call read() once per frame. */
export function videoReader(video, maxWidth = 640) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    read() {
      const w = video.videoWidth, h = video.videoHeight;
      if (!ctx || !w || !h) return null;
      const scale = Math.min(1, maxWidth / w);
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return decodeGray(grayFromRgba(data, canvas.width, canvas.height), canvas.width, canvas.height);
    },
  };
}

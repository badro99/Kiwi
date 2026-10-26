// Refresh both split proofs after an intentional edit of the core formatters.
import fs from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const core = fs.readFileSync('assets/stock.js', 'utf8');
const bounds = source => [source.indexOf('  const localeFor'), source.indexOf('  const unitApi')];
const [a, b] = bounds(core);
if (a < 0 || b < a) throw new Error('Formatter boundaries missing');
const replacement = core.slice(a, b);
for (const dir of ['stock', 'stock-strings']) {
  const base = `tools/fixtures/${dir}/`;
  const map = JSON.parse(fs.readFileSync(base + 'split.json', 'utf8'));
  const original = gunzipSync(fs.readFileSync(base + 'original.js.gz')).toString();
  if (hash(original) !== map.sha256) throw new Error('Fixture hash mismatch: ' + dir);
  const [start, end] = bounds(original);
  if (start < 0 || end < start) throw new Error('Fixture boundaries missing');
  const delta = replacement.length - (end - start);
  const lines = replacement.split('\n').length - original.slice(start, end).split('\n').length;
  const shift = position => {
    if (position > start && position < end) throw new Error('Split crosses formatter block');
    return position >= end ? position + delta : position;
  };
  for (const moved of map.moved || []) {
    if (moved.start >= end) moved.line += lines;
    moved.start = shift(moved.start); moved.end = shift(moved.end);
  }
  for (const segment of map.segments || []) {
    segment.start = shift(segment.start); segment.end = shift(segment.end);
  }
  const updated = original.slice(0, start) + replacement + original.slice(end);
  map.sha256 = hash(updated);
  // Only the edited core gets a new fingerprint; other split bodies stay pinned.
  if (map.splitFiles) map.splitFiles['assets/stock.js'] = hash(core);
  fs.writeFileSync(base + 'original.js.gz', gzipSync(updated, { mtime: 0 }));
  const compact = !fs.readFileSync(base + 'split.json', 'utf8').includes('\n  ');
  fs.writeFileSync(base + 'split.json', JSON.stringify(map, null, compact ? undefined : 2) + '\n');
  console.log('✓ refreshed ' + dir + ' formatter proof');
}

// Rebuild the historical lexical layout from LIVE module bodies, never the archive.
import fs from 'node:fs';
import splitFunctions from './split-functions.cjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const bookingSplit = JSON.parse(read('tools/fixtures/booking/split.json'));
export function bookingReadableSource() {
  const map = bookingSplit;
  let source = read('assets/booking.js').replace(/(booking-[a-z]+\.js)\?v=\d+/g, '$1').replace('(async function()', '(function()');
  if (!source.includes(map.bootstrap)) throw new Error('Booking bootstrap changed');
  source = source.replace(map.bootstrap, '');
  source = source.replace('  /* booking counters are private to search owners */', map.counter);
  for (const part of map.parts) {
    const live = read(part.file);
    if (!live.startsWith(part.prefix) || !live.endsWith(part.suffix)) throw new Error('Booking interface changed: ' + part.file);
    for (const fragment of part.fragments) {
      if (source.split(fragment.replacement).length !== 2) throw new Error('Booking forwarding changed');
      source = source.replace(fragment.replacement, () => part.file === 'assets/booking-manage.js' ? splitFunctions.fragment(live, fragment) : live.slice(fragment.offset, fragment.offset + fragment.length));
    }
  }
  return source;
}
export function bookingTestSource() {
  let source = bookingReadableSource();
  const part = bookingSplit.parts.find(p => p.file.endsWith('booking-manage.js'));
  const live = read(part.file);
  /* The format edits are positioned in the assembled source, not in the shipped file: place each
     fragment where the assembly put it (start/end here are in the assembled basis, and the span an
     unchanged fragment had is its recorded length). */
  const changed = part.fragments.map(f => {
    const text = splitFunctions.fragment(live, f), at = source.indexOf(text);
    return { ...f, size: text.length, start: at, end: at + f.length };
  });
  /* A fragment sliced by offset whose body a reviewed fix lengthened records its
     historical span in `was`: the format edits stay in the historical basis. */
  for (const other of bookingSplit.parts) {
    if (other === part) continue;
    const text = read(other.file);
    for (const f of other.fragments) if (f.was !== undefined) {
      const body = text.slice(f.offset, f.offset + f.length), at = source.indexOf(body);
      changed.push({ ...f, size: body.length, length: f.was, start: at, end: at + f.was });
    }
  }
  /* Put every span in the historical basis the edits were recorded in: a live
     position includes what the changed fragments before it added or removed. */
  changed.sort((x, y) => x.start - y.start);
  let shifted = 0;
  for (const f of changed) { f.start -= shifted; f.end = f.start + f.length; shifted += f.size - f.length; }
  const edits = JSON.parse(read('tools/fixtures/booking/format.json'));
  for (const edit of [...edits].reverse()) {
    const inside = changed.find(f => edit.start >= f.start && edit.start < f.end);
    // Changed declarations keep their live formatting. Reformat only the
    // untouched spans, translating their old coordinates past changed bodies.
    if (inside && inside.size !== inside.length) continue;
    const delta = changed.filter(f => f.end <= edit.start).reduce((n,f) => n + f.size - f.length, 0);
    const start = edit.start + delta;
    source = source.slice(0, start) + edit.text + source.slice(start + edit.length);
  }
  return source;
}
// VM harness: replace only module transport, execute the production factories and entry.
export function bookingRuntimeSource() {
  let entry = read('assets/booking.js');
  const factories = bookingSplit.parts.map(part => {
    const name = part.file.match(/booking-(.*)\.js/)[1];
    entry = entry.replace(new RegExp("import\\('/assets/booking-" + name + "\\.js(?:\\?v=\\d+)?'\\)"), 'Promise.resolve(__bookingFactories.' + name + ')');
    const factory = 'createBooking' + name.replace(/^./, c => c.toUpperCase());
    return name + ': (() => {\n' + read(part.file).replace('export function ', 'function ') + '\nreturn { ' + factory + ' }; })()';
  });
  return 'const __bookingFactories = {\n' + factories.join(',\n') + '\n};\n' + entry;
}

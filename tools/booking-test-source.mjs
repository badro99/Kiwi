// Rebuild the historical lexical layout from LIVE module bodies, never the archive.
import fs from 'node:fs';
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
      source = source.replace(fragment.replacement, () => live.slice(fragment.offset, fragment.offset + fragment.length));
    }
  }
  return source;
}
export function bookingTestSource() {
  let source = bookingReadableSource();
  const edits = JSON.parse(read('tools/fixtures/booking/format.json'));
  for (const edit of [...edits].reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.start + edit.length);
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

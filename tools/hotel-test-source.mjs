/* Les anciens tests extraient des fonctions dans leur portée lexicale d'origine.
 * Toujours lire les corps de production, jamais l'archive de référence. */
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const hotelParts = JSON.parse(read('tools/fixtures/hotel/split-2.json'));
export const hotelSections = JSON.parse(read('tools/fixtures/hotel/split-3.json'));
export const hotelFiles = ['assets/hotel-language.js', ...hotelParts.parts.map(p => p.file), ...hotelSections.parts.map(p => p.file), 'assets/hotel.js'];
export function hotelCoreSource() {
  let core = read('assets/hotel.js');
  if (!core.includes(hotelSections.bind)) throw new Error('Hotel section binding changed');
  core = core.replace(hotelSections.bind, '');
  for (const part of hotelSections.parts) {
    const source = read(part.file);
    if (!source.startsWith(part.prefix) || !source.endsWith(part.suffix)) throw new Error('Hotel section wrapper changed: ' + part.file);
    for (const f of part.fragments) {
      let body = source.slice(f.offset, f.offset + f.length);
      let delta = 0;
      const inverse = [...f.mutations].sort((a,b) => a.start - b.start).map(m => { const start = m.start + delta; delta += m.replacement.length - m.original.length; return { ...m, start }; });
      for (const m of inverse.reverse()) {
        if (body.slice(m.start, m.start + m.replacement.length) !== m.replacement) throw new Error('Hotel live state accessor changed');
        body = body.slice(0,m.start) + m.original + body.slice(m.start + m.replacement.length);
      }
      if (!core.includes(f.replacement)) throw new Error('Hotel section forwarding changed');
      core = core.replace(f.replacement, body);
    }
  }
  return core;
}
export function hotelTestSource() {
  if (process.env.KIWI_HOTEL_TEST_RUNTIME === '1') return hotelFiles.map(read).join('\n');
  const map = JSON.parse(read('tools/fixtures/hotel/split.json'));
  const language = read('assets/hotel-language.js');
  if (!language.startsWith(map.prefix) || !language.endsWith(map.suffix)) throw new Error('Hotel language wrapper changed');
  let core = hotelCoreSource();
  if (!core.includes(hotelParts.bind)) throw new Error('Hotel namespace binding changed');
  core = core.replace(hotelParts.bind, '');
  for (const part of hotelParts.parts) {
    const source = read(part.file);
    if (!source.startsWith(part.prefix) || !source.endsWith(part.suffix)) throw new Error('Hotel part wrapper changed: ' + part.file);
    for (const f of part.fragments) {
      if (!core.includes(f.replacement)) throw new Error('Hotel forwarding function changed: ' + f.name);
      core = core.replace(f.replacement, source.slice(f.offset, f.offset + f.length));
    }
  }
  if (!core.includes(map.replacement)) throw new Error('Hotel language binding changed');
  return core.replace(map.replacement, language.slice(map.prefix.length, -map.suffix.length));
}

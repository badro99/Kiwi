/* Les anciens tests extraient des fonctions dans leur portée lexicale d'origine.
 * Toujours lire les corps de production, jamais l'archive de référence. */
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const hotelParts = JSON.parse(read('tools/fixtures/hotel/split-2.json'));
export const hotelFiles = ['assets/hotel-language.js', ...hotelParts.parts.map(p => p.file), 'assets/hotel.js'];
export function hotelTestSource() {
  if (process.env.KIWI_HOTEL_TEST_RUNTIME === '1') return hotelFiles.map(read).join('\n');
  const map = JSON.parse(read('tools/fixtures/hotel/split.json'));
  const language = read('assets/hotel-language.js');
  if (!language.startsWith(map.prefix) || !language.endsWith(map.suffix)) throw new Error('Hotel language wrapper changed');
  let core = read('assets/hotel.js');
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

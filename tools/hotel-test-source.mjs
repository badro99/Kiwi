/* Les anciens tests extraient des fonctions dans leur portée lexicale d'origine.
 * Toujours lire les corps de production, jamais l'archive de référence. */
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export function hotelTestSource() {
  const map = JSON.parse(read('tools/fixtures/hotel/split.json'));
  const language = read('assets/hotel-language.js');
  if (!language.startsWith(map.prefix) || !language.endsWith(map.suffix)) throw new Error('Hotel language wrapper changed');
  const core = read('assets/hotel.js');
  if (!core.includes(map.replacement)) throw new Error('Hotel language binding changed');
  return core.replace(map.replacement, language.slice(map.prefix.length, -map.suffix.length));
}

import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
export function reconstructEconomat() {
  const map = JSON.parse(read('tools/fixtures/economat/split.json'));
  let source = read('functions/api/inventory/internal-requests.js').slice(map.prefix.length).replace(map.insertion, '');
  for (const part of map.segments) {
    const module = read(part.file);
    const body = module.slice(part.header.length, -part.footer.length);
    // Empty markers locate whole functions removed from the route.
    if (part.marker) source = source.replace(part.marker, () => body);
  }
  for (const part of map.segments.filter(part => !part.marker).sort((a, b) => a.start - b.start)) {
    const module = read(part.file);
    const body = module.slice(part.header.length, -part.footer.length);
    source = source.slice(0, part.start) + body + source.slice(part.start);
  }
  return source;
}

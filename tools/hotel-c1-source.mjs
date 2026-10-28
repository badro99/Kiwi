/* Inverse of the C1 move, always reading production files. */
import fs from 'node:fs';
import splitFunctions from './split-functions.cjs';
export const hotelC1 = JSON.parse(fs.readFileSync(new URL('./fixtures/hotel/split-4.json', import.meta.url), 'utf8'));
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export function hotelC1Source(file) {
  if (file === 'assets/hotel/model.js') return read(file).slice(0, hotelC1.parts.at(-1).base.length);
  if (file !== 'assets/hotel.js') return read(file);
  let core = read(file), delta = 0;
  const edits = [...hotelC1.edits].sort((a,b) => a.start-b.start).map(e => {
    const start = e.start + delta;
    delta += e.replacement.length - e.original.length;
    return { ...e, liveStart: start };
  });
  for (const e of edits.reverse()) {
    if (core.slice(e.liveStart,e.liveStart+e.replacement.length) !== e.replacement) throw new Error('Hotel C1 wiring changed at ' + e.start);
    const fragment = hotelC1.parts.flatMap(p => p.fragments.map(f => ({...f,file:p.file}))).find(f => f.start === e.start && f.end === e.end);
    const body = fragment ? fragment.file === 'assets/hotel/room-board.js' ? splitFunctions.declaration(read(fragment.file), fragment.name) : read(fragment.file).slice(fragment.offset,fragment.offset+fragment.length) : e.original;
    core = core.slice(0,e.liveStart) + body + core.slice(e.liveStart+e.replacement.length);
  }
  return core;
}
export function hotelC1Normalize(source) {
  for (const e of hotelC1.edits) if (e.replacement && e.original) source = source.split(e.replacement).join(e.original);
  return source;
}

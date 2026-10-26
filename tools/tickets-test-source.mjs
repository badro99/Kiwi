/* Historical source assertions rebuild only live production code. The archive
 * is used exclusively by tickets-split-test as the independent move proof. */
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const ticketsMap = JSON.parse(read('tools/fixtures/tickets/split.json'));
export const ticketsFiles = ['assets/tickets.js', ...ticketsMap.parts.map(p => p.file)];
export function ticketsRuntimeSource() {
  return ticketsMap.parts.map(p => read(p.file).replace(/^export /gm, '')).join('\n') + '\n' +
    read('assets/tickets.js').replace(/^import .*;\n/gm, '');
}
export function ticketsTestSource() {
  let core = read('assets/tickets.js').replace(/^import .*;\n/gm, '');
  const fragments = new Map(ticketsMap.parts.flatMap(p => p.fragments.map(f => [f.start, read(p.file).slice(f.offset, f.offset + f.length)])));
  // Coordinates refer to the original; invert replacement lengths in live order.
  let delta = 0;
  const inverse = [...ticketsMap.edits].sort((a,b) => a.start-b.start).map(e => {
    const at = e.start + delta; delta += e.replacement.length - (e.end-e.start); return {...e, at};
  });
  for (const e of inverse.reverse()) {
    if (core.slice(e.at, e.at+e.replacement.length) !== e.replacement) throw new Error('Tickets wiring changed at ' + e.start);
    let body = fragments.get(e.start);
    if (body === undefined) {
      if (e.replacement.includes('ticketState')) {
        const data = read('assets/tickets-data.js');
        body = data.slice(data.indexOf('  const state = {'), data.indexOf('\n  return Object.freeze({\n    read:'));
      } else if (!e.replacement) body = e.end-e.start === '  let previewUrls = [];\n'.length
        ? '  let previewUrls = [];\n' : '  let followupPreviewUrls = [];\n';
      else body = '';
    }
    core = core.slice(0,e.at) + body + core.slice(e.at+e.replacement.length);
  }
  return core;
}

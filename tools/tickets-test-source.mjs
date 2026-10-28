/* Historical source assertions rebuild only live production code. The archive
 * is used exclusively by tickets-split-test as the independent move proof. */
import fs from 'node:fs';
import splitFunctions from './split-functions.cjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export const ticketsMap = JSON.parse(read('tools/fixtures/tickets/split.json'));
export const ticketsFiles = ['assets/tickets.js', ...ticketsMap.parts.map(p => p.file)];
export function ticketsRuntimeSource() {
  return ticketsMap.parts.map(p => read(p.file).replace(/^export /gm, '')).join('\n') + '\n' +
    read('assets/tickets.js').replace(/^import .*;\n/gm, '');
}
export function ticketsTestSource() {
  let core = read('assets/tickets.js').replace(/^import .*;\n/gm, '');
  // Rebuild by forwarding declaration text, so translations and body edits do
  // not invalidate every later character coordinate.
  for (const p of ticketsMap.parts) for (const f of p.fragments) {
    if (!core.includes(f.replacement)) throw new Error('Tickets forwarding changed: ' + f.name);
    core = core.replace(f.replacement, () => splitFunctions.fragment(read(p.file), f));
  }
  for (const e of ticketsMap.edits) {
    if (e.start === e.end) { core = core.replace(e.replacement, ''); continue; }
    if (e.replacement.includes('ticketState')) {
      const data = read('assets/tickets-data.js');
      const body = data.slice(data.indexOf('  const state = {'), data.indexOf('\n  return Object.freeze({\n    read:'));
      core = core.replace(e.replacement, () => body);
    }
  }
  // Preview URL arrays used to live alongside the composer bodies.
  return core.replace("  'use strict';", "  'use strict';\n  let previewUrls = [], followupPreviewUrls = [];");
}

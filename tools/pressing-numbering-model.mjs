/* The one numbering model (assets/pressing-numbering.js), loaded the way the
   shell hands it to the till: through KiwiPressingOps.numbering(). Test
   harnesses that lift custody.js functions into a vm pass `window` from here. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
export function numberingWindow(root = process.env.KIWI_ROOT || path.resolve(import.meta.dirname, '..')) {
  let model;
  const window = { KiwiPressingOps: { configureNumbering(m) { model = m; }, numbering: () => model } };
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/pressing-numbering.js'), 'utf8'), vm.createContext({ window }));
  return window;
}

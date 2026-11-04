import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
import { DOMParser } from '../app/node_modules/@xmldom/xmldom/lib/index.js';
export const read = file => fs.readFileSync(file, 'utf8');
export function run(file, names, context) {
  const code = names.map(name => split.declaration(read(file), name)).join('\n');
  return vm.runInNewContext(code + '\n({' + names.join(',') + '})', context);
}
export const html = text => new DOMParser({ onError: () => {} }).parseFromString('<main>' + text + '</main>', 'text/html');
export const elements = (doc, tag) => Array.from(doc.getElementsByTagName(tag));
export const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');

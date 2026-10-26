/* Generate into the existing dashboard script: no extra shell request or handwritten twin. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
export function generatedFormula() {
  const source = fs.readFileSync(new URL('functions/api/_menu-formula.js', root), 'utf8');
  return '  /* GENERATED MENU FORMULA BEGIN */\n  const cleanFormula = (() => {\n' +
    source.replace(/^export /m, '').split('\n').map(line => line ? '    ' + line : '').join('\n') +
    '\n    return (formula, items) => sanitizeFormula(formula, new Set((items || []).filter(i => i && !i.archived).map(i => str(i.id, 40)).filter(Boolean)));\n  })();\n  /* GENERATED MENU FORMULA END */\n';
}
export function build(check = false) {
  const target = new URL('assets/menu-catalog.js', root), source = fs.readFileSync(target, 'utf8');
  const pattern = /  \/\* GENERATED MENU FORMULA BEGIN \*\/[\s\S]*?  \/\* GENERATED MENU FORMULA END \*\/\n|  function cleanFormula\([\s\S]*?(?=\n  function kitchenIdOf)/;
  const next = source.replace(pattern, generatedFormula());
  if (next === source) return;
  if (check) throw new Error('Stale browser formula: node tools/build-menu-formula.mjs');
  fs.writeFileSync(target, next);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) build(process.argv.includes('--check'));

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = f => fs.readFileSync((process.env.KIWI_TEST_ROOT || '.') + '/' + f, 'utf8');
const source = read('assets/invoice.js');
const ast = ts.createSourceFile('invoice.js', source, ts.ScriptTarget.Latest, true);
const functions = {};
function visit(n) { if (ts.isFunctionDeclaration(n)) functions[n.name.text] = n.getText(ast); ts.forEachChild(n, visit); }
visit(ast);
const window = {};
vm.runInNewContext(read('assets/i18n.js'), { window, document: { readyState: 'loading', addEventListener() {} } });
const T = window.KiwiI18n.T;
// Replay the old refusal expressions too, so reverting the fix fails on leaked copy.
if (!functions.invoiceErrorText) {
  const ice = source.match(/toast\((L\('iceInvalid'.*), TOAST.error\);/)[1];
  const generic = source.match(/toast\((L\(key,.*), TOAST.error\);/)[1];
  functions.invoiceErrorText = `function invoiceErrorText(err) { if (err.error === 'invalid-ice') return ${ice}; const key = 'serverRefusal'; return ${generic}; }`;
}
const codes = [...new Set([...read('functions/api/invoices/_lifecycle.js').matchAll(/fail\(\d+, '([^']+)'/g)].map(m => m[1]))];
const details = ["L'ICE ne contient que des chiffres.", "L'ICE doit comporter exactement 15 chiffres.", 'Cet ICE ne passe pas le contrôle de ses deux derniers chiffres. Vérifiez chaque chiffre.'];
for (const lang of ['en', 'ar']) {
  window.KiwiI18n.getLang = () => lang;
  const format = vm.runInNewContext(functions.L + '\n' + functions.invoiceErrorText + '\ninvoiceErrorText', { window });
  const generic = T[lang]['invoice.serverRefusal'];
  for (const code of [...codes, 'missing-sale-id', 'bad-json', 'forbidden-merchant', 'unknown-code']) {
    const text = format({ error: code, detail: 'Texte serveur français inconnu' });
    assert.ok(Object.entries(T[lang]).some(([k, v]) => k.startsWith('invoice.') && v === text), lang + ': translated ' + code);
    assert.ok(!text.includes('français'));
  }
  for (const detail of details) {
    const text = format({ error: 'invalid-ice', detail });
    assert.ok(!text.includes(detail));
    assert.notEqual(text, generic, 'known ICE details have useful guidance');
  }
  assert.equal(format({ code: 'unknown', detail: 'secret arbitrary text' }), generic);
}
assert.ok(!/\+\s*err\??\.detail/.test(source), 'toast never appends raw server detail');
assert.equal((source.match(/toast\(invoiceErrorText\(err\), TOAST.error\)/g) || []).length, 2, 'both refusal branches use formatter');
console.log('✓ invoice preview errors: EN/AR server codes, ICE details, unknown fallback and both toast sites');

#!/usr/bin/env node
/* Une facture saisie dans Facturation s'imprime, avec des prix HT.
 *
 * « Imprimer / PDF » passait la facture au gabarit des ventes de comptoir
 * (KiwiInvoice.html) en appelant round2, qui n'existe pas dans ce module :
 * l'impression levait une ReferenceError. Et même corrigé, ce gabarit-là dit
 * « Payée », « Vente acquittée » et range les prix HT sous « Prix unit. TTC ».
 * Ce banc exécute le vrai printable() de assets/invoicing.js, avec un
 * KiwiInvoice.html présent, et lit le document produit. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/invoicing.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

/* Une fonction de niveau module : de sa déclaration à la suivante. */
function block(startMarker) {
  const at = src.indexOf(startMarker);
  if (at < 0) throw new Error('introuvable : ' + startMarker);
  const next = src.indexOf('\n  function ', at + startMarker.length);
  return src.slice(at, next < 0 ? src.length : next);
}
const helpers = src.slice(src.indexOf('  const COPY = {'), src.indexOf('  function venueId()'));
const code = [
  helpers,
  block('  function businessName()'),
  block('  function invoiceTotal(inv)'),
  block('  function getSeller()'),
  block('  function renderSellerLogo(seller'),
  block('  function printable(inv)'),
  'globalThis.__printable = printable;',
].join('\n');

let sharedTemplateCalls = 0;
const window = {
  KiwiI18n: { getLang: () => 'fr' },
  KiwiMe: { business: 'Atelier Test' },
  KiwiInvoice: {
    html() { sharedTemplateCalls++; return '<html>Statut : Payée · Vente acquittée</html>'; },
    getSellerBusiness: () => ({ name: 'Atelier Test', city: 'Casablanca', ice: '001234567000089', fiscal: '1234567', rc: '98765' }),
  },
};
const ctx = vm.createContext({
  window, document: { documentElement: { lang: 'fr' }, baseURI: 'https://kiwi-os.com/dashboard' },
  localStorage: { getItem: () => null }, Intl, Date, Math, Number, String, JSON, Set,
});
vm.runInContext(code, ctx);

const inv = {
  id: 1050, customer: 'Riad Test', contact: 'compta@riad.test', issueDate: '2026-10-13', dueDate: '2026-10-20',
  terms: 7, taxRate: 20, status: 'sent', note: '',
  items: [{ description: 'Privatisation', qty: 2, price: 1000 }],
};

console.log('■ Facturation · impression d’une facture saisie');
let html = '';
try { html = ctx.__printable(inv); ok('l’impression ne lève plus d’erreur', typeof html === 'string' && html.length > 500); }
catch (err) { ok('l’impression ne lève plus d’erreur', false, String(err)); }
ok('elle n’emprunte pas le gabarit des ventes de comptoir', sharedTemplateCalls === 0);
ok('elle ne se dit pas payée ni acquittée', !/Payée|acquittée/.test(html));
ok('les prix unitaires sont annoncés HT', /Prix HT/.test(html) && !/Prix unit\. TTC/.test(html));
const flat = html.replace(/ | /g, ' ');
ok('les lignes et les totaux se tiennent : 2 000 HT, 400 TVA, 2 400 TTC',
  /2[ .]000,00 MAD/.test(flat) && /[^\d.]400,00 MAD/.test(flat) && /2[ .]400,00 MAD/.test(flat), flat.match(/[\d .]+,\d\d MAD/g)?.join(' | '));
ok('l’échéance figure sur la facture', /Échéance/.test(html));
ok('les mentions légales du vendeur figurent', /ICE :<\/strong> 001234567000089/.test(html) && /IF :/.test(html) && /RC :/.test(html));

console.log(failed ? `\n✗ ${failed} échec(s) sur ${passed + failed}` : `\n✓ ${passed} contrôles`);
process.exit(failed ? 1 : 0);

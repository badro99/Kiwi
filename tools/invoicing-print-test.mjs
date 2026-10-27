import invoicingSourceHelper from './invoicing-test-source.cjs';
/* Un document de Facturation s'imprime sur son propre gabarit A4, en HT.
 *
 * « Imprimer / PDF » passait la facture au gabarit des ventes de comptoir
 * (KiwiInvoice.html) en appelant round2, qui n'existe pas dans ce module :
 * l'impression levait une ReferenceError. Et même corrigé, ce gabarit-là dit
 * « Payée », « Vente acquittée » et range les prix HT sous « Prix unit. TTC ».
 *
 * Facturation v2 : le gabarit suit le contrat. Ce banc exécute le vrai
 * printable() de assets/invoicing.js (extrait de la source, avec le vrai
 * KiwiInvoice.html présent pour prouver qu'il n'est jamais appelé) et lit le
 * document produit : FACTURE / AVOIR / DEVIS, colonnes HT, une ligne de TVA par
 * taux, mentions du vendeur gelées à l'émission, renvoi de l'avoir à sa
 * facture, filigrane BROUILLON sans numéro, arabe de droite à gauche. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = invoicingSourceHelper.invoicingTestSource(ROOT);

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

/* Trois régions de la source : les utilitaires et les montants, l'identité du
 * vendeur, puis le gabarit lui-même (entre ses deux repères). */
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error('repère introuvable : ' + from + ' … ' + to);
  return src.slice(a, b);
};
const code = [
  slice('  const VAT_RATES', '  /* ── erreurs d\'API'),
  slice('  function getSeller()', '  /* ── libellés de documents'),
  slice('  /* print:start */', '  /* print:end */'),
  'globalThis.__printable = printable;',
].join('\n');

let lang = 'fr';
let sharedTemplateCalls = 0;
// Le montant en lettres vit dans assets/invoice.js (KiwiInvoice.amountWords) : le vrai module, pas une copie.
const invoiceSource = fs.readFileSync(path.join(ROOT, 'assets/invoice.js'), 'utf8');
const amountWords = new Function('window', 'document', 'localStorage', `${invoiceSource}; return window.KiwiInvoice.amountWords;`)(
  { KiwiReceipt: { business: () => ({}), config: () => ({}) }, document: {}, localStorage: { getItem: () => null, setItem() {} } }, {}, { getItem: () => null, setItem() {} });
const window = {
  KiwiI18n: { getLang: () => lang },
  KiwiMe: { business: 'Atelier Test' },
  KiwiInvoice: {
    amountWords,
    html() { sharedTemplateCalls++; return '<html>Statut : Payée · Vente acquittée</html>'; },
    getSellerBusiness: () => ({ name: 'Atelier Test', city: 'Casablanca', ice: '001234567000089', fiscal: '1234567', rc: '98765', patente: '4455', address: '12 rue des Tests', phone: '0522000000' }),
  },
};
const ctx = vm.createContext({
  window, document: { documentElement: { lang: 'fr' }, baseURI: 'https://kiwi-os.com/dashboard' },
  localStorage: { getItem: () => null }, Intl, Date, Math, Number, String, JSON, Set, Map, URLSearchParams, isFinite,
});
vm.runInContext(code, ctx);

const flat = (s) => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const lines = [
  { description: 'Privatisation', qty: 2, unitHT: 100000, discountPct: 0, vatRate: 20 },
  { description: 'Pause café', qty: 10, unitHT: 5000, discountPct: 10, vatRate: 10 },
  { description: 'Location de matériel', qty: 1, unitHT: 30000, discountPct: 0, vatRate: 0 },
];
const seller = { name: 'Atelier Test', legalName: 'Atelier Test SARL', ice: '001234567000089', if: '1234567', rc: '98765', patente: '4455', address: '12 rue des Tests', city: 'Casablanca', phone: '0522000000' };
const invoice = {
  type: 'invoice', status: 'issued', number: 'F-2026-0042', issueDate: '2026-10-13', dueDate: '2026-11-12', termsDays: 30, seller,
  customer: { name: 'Riad Test', address: '5 derb Test', ice: '001561191000066', if: '7654321', email: 'compta@riad.test' },
  lines, paymentMethod: 'transfer', note: 'Merci.', exemptionMention: 'Exonération de TVA, article 91 du CGI',
};

console.log('■ Facturation · gabarit A4 d’une facture émise');
let html = '';
try { html = ctx.__printable(invoice, { paidCents: 100000, balanceCents: 300000 }); ok('l’impression ne lève pas d’erreur', typeof html === 'string' && html.length > 800); }
catch (err) { ok('l’impression ne lève pas d’erreur', false, String(err)); }
let f = flat(html);
ok('elle n’emprunte pas le gabarit des ventes de comptoir', sharedTemplateCalls === 0);
ok('elle ne se dit pas payée ni acquittée', !/Payée|acquittée/.test(html));
ok('titre FACTURE et numéro', /<h1>FACTURE<\/h1>/.test(html) && />F-2026-0042</.test(html));
ok('dates d’émission et d’échéance au format jj/mm/aaaa', /13\/10\/2026/.test(html) && /12\/11\/2026/.test(html));
ok('colonnes : Désignation, Qté, P.U. HT, Remise, TVA %, Total HT', ['Désignation', 'Qté', 'P.U. HT', 'Remise', 'TVA %', 'Total HT'].every((h) => new RegExp('<th>' + h.replace('.', '\\.') + '</th>').test(html)));
ok('plus aucune colonne TTC pour les prix unitaires', !/Prix unit\. TTC/.test(html));
ok('totaux : Total HT 2 750,00 (2 000 + 450 + 300)', /Total HT<\/span><b>2 750,00 MAD/.test(f), f.match(/Total HT[^<]*<\/span><b>[^<]*/g)?.join(' | '));
ok('une ligne de TVA par taux : 20 % sur 2 000,00, 10 % sur 450,00, 0 % sur 300,00',
  /TVA 20 % sur 2 000,00/.test(f) && /TVA 10 % sur 450,00/.test(f) && /TVA 0 % sur 300,00/.test(f));
ok('montants de TVA : 400,00 et 45,00', /<b>400,00 MAD/.test(f) && /<b>45,00 MAD/.test(f));
ok('Total TTC 3 195,00', /Total TTC<\/span><span>3 195,00 MAD/.test(f));
ok('montant déjà réglé et reste à payer', /Déjà réglé<\/span><b>1 000,00 MAD/.test(f) && /Reste à payer<\/span><b>3 000,00 MAD/.test(f));
ok('mentions du vendeur figées : raison sociale, ICE, IF, RC, patente, téléphone',
  /Atelier Test SARL/.test(html) && /<b>ICE :<\/b> 001234567000089/.test(html) && /<b>IF :<\/b> 1234567/.test(html) && /<b>RC :<\/b> 98765/.test(html) && /<b>Patente :<\/b> 4455/.test(html) && /0522000000/.test(html));
ok('client : nom, adresse, ICE et IF', /Riad Test/.test(html) && /5 derb Test/.test(html) && /<b>ICE :<\/b> 001561191000066/.test(html) && /<b>IF :<\/b> 7654321/.test(html));
ok('mention d’exonération', /Mention d’exonération : Exonération de TVA, article 91 du CGI/.test(html));
ok('conditions et mode de paiement', /Conditions de paiement : Sous 30 jours/.test(html) && /Mode de paiement : Virement/.test(html));
ok('ni filigrane ni italique', !/BROUILLON/.test(html) && !/font-style\s*:\s*italic/i.test(html));
ok('la fenêtre se lance elle-même à l’impression', /print\(\)/.test(html));
ok('sans paiement, ni « réglé » ni « reste »', !/Déjà réglé|Reste à payer/.test(ctx.__printable(invoice, { paidCents: 0, balanceCents: 319500 })));

console.log('■ Avoir');
const credit = { ...invoice, type: 'credit_note', number: 'AV-2026-0003', originalNumber: 'F-2026-0042', reason: 'Remise accordée', lines: [lines[0]], dueDate: '', termsDays: null };
html = ctx.__printable(credit, { originalDate: '2026-10-12' }); f = flat(html);
ok('titre AVOIR', /<h1>AVOIR<\/h1>/.test(html) && />AV-2026-0003</.test(html));
ok('renvoi à la facture : « Avoir sur facture F-2026-0042 du 12/10/2026 »', /Avoir sur facture F-2026-0042 du 12\/10\/2026/.test(f));
ok('motif de l’avoir', /Motif : Remise accordée/.test(f));
ok('un avoir n’a pas d’échéance', !/Échéance/.test(html));

console.log('■ Devis');
const quote = { ...invoice, type: 'quote', status: 'sent', number: 'D-2026-0007', validUntil: '2026-11-12', dueDate: '' };
html = ctx.__printable(quote); f = flat(html);
ok('titre DEVIS, validité et pas d’échéance', /<h1>DEVIS<\/h1>/.test(html) && />D-2026-0007</.test(html) && /Valable jusqu’au : 12\/11\/2026/.test(f) && !/Échéance/.test(html));

console.log('■ Brouillon');
const draft = { ...invoice, status: 'draft', number: '', seller: null };
html = ctx.__printable(draft); f = flat(html);
ok('grand filigrane « BROUILLON · sans valeur fiscale »', /class="watermark">BROUILLON · sans valeur fiscale</.test(html));
ok('aucun numéro de facture', !/F-\d{4}-\d{4}/.test(html) && !/class="num"/.test(html));
ok('le vendeur vient de l’identité courante (rien n’est encore gelé)', /<b>ICE :<\/b> 001234567000089/.test(html));

console.log('■ Anglais et arabe');
lang = 'en';
html = ctx.__printable(invoice); f = flat(html);
ok('anglais : INVOICE, Total excl. VAT, VAT 20% on 2,000.00', /<h1>INVOICE<\/h1>/.test(html) && /Total excl\. VAT/.test(html) && /VAT 20% on 2,000\.00/.test(f) && /<html lang="en" dir="ltr">/.test(html));
lang = 'ar';
html = ctx.__printable(invoice); f = flat(html);
ok('arabe : document de droite à gauche', /<html lang="ar" dir="rtl">/.test(html));
ok('arabe : titre et colonnes en arabe', /<h1>فاتورة<\/h1>/.test(html) && /<th>البيان<\/th>/.test(html) && /المجموع مع الضريبة/.test(html));
ok('arabe : les chiffres restent latins (2 000,00)', /2 000,00/.test(f));
ok('arabe : le filigrane aussi', /مسودة · دون قيمة جبائية/.test(ctx.__printable(draft)));
lang = 'fr';

console.log('■ Montant en lettres');
f = flat(ctx.__printable(invoice));
ok('facture : « Arrêtée la présente facture à la somme de : … » sous les totaux, du TTC en centimes',
  /Total TTC<\/span><span>3 195,00 MAD.*<div class="words" lang="fr" dir="ltr">Arrêtée la présente facture à la somme de : trois mille cent quatre-vingt-quinze dirhams\.<\/div>/.test(f));
ok('avoir : « Arrêté le présent avoir … » (2 400,00 TTC, cents avec s en fin de nombre)',
  /Arrêté le présent avoir à la somme de : deux mille quatre cents dirhams\./.test(flat(ctx.__printable(credit))));
ok('devis : « Arrêté le présent devis … »', /Arrêté le présent devis à la somme de : trois mille cent quatre-vingt-quinze dirhams\./.test(flat(ctx.__printable(quote))));
ok('centimes : 12,34 HT + 20 % = 14,81 TTC', /à la somme de : quatorze dirhams et quatre-vingt-un centimes\./.test(flat(ctx.__printable({ ...invoice, lines: [{ description: 'Pièce', qty: 1, unitHT: 1234, discountPct: 0, vatRate: 20 }], exemptionMention: '' }))));
ok('arabe : la formule légale reste en français, de gauche à droite', (lang = 'ar', /<div class="words" lang="fr" dir="ltr">Arrêtée la présente facture/.test(ctx.__printable(invoice))));
lang = 'fr';
window.KiwiInvoice.amountWords = undefined;
ok('sans le module, la ligne est omise et rien ne casse', !/class="words"/.test(ctx.__printable(invoice)) && /Total TTC/.test(ctx.__printable(invoice)));
window.KiwiInvoice.amountWords = amountWords;

console.log('■ ICE du vendeur manquant');
const banner = (doc) => vm.runInContext('sellerIceBanner', ctx)(doc, vm.runInContext('T()', ctx));
const noIce = { ...invoice, seller: { ...seller, ice: '' } };
ok('une facture émise sans ICE vendeur affiche un bandeau d’alerte avec le lien vers la fiche', /role="alert" data-inv-seller-ice/.test(banner(noIce)) && /data-inv-act="set-ice"/.test(banner(noIce)) && /ICE du vendeur manquant/.test(banner(noIce)));
ok('avec l’ICE, pas de bandeau', banner(invoice) === '');
ok('un brouillon n’en affiche pas (rien n’est encore numéroté)', banner({ ...noIce, status: 'draft', number: '' }) === '');
ok('un ancien document sans identité figée n’en affiche pas', banner({ ...invoice, seller: null }) === '');
lang = 'en'; ok('anglais : bandeau en anglais', /Seller ICE missing/.test(banner(noIce))); lang = 'ar'; ok('arabe : bandeau en arabe', /ICE البائع مفقود/.test(banner(noIce))); lang = 'fr';
const warned = vm.runInContext('sellerIceMissing', ctx);
ok('l’avertissement du serveur est lu dans la réponse d’émission', warned({ ok: true, warnings: ['seller-ice-missing'] }) === true && warned({ ok: true, warnings: [] }) === false && warned(null) === false && warned({ ok: true }) === false);

ok('les deux chemins d’émission (formulaire, détail) lisent l’avertissement et le disent dans le message',
  (src.match(/tpl\(sellerIceMissing\((?:issuedRes|res)\) \? t\.issuedNoIce : t\.issuedOk/g) || []).length === 2);
ok('le lien du bandeau ouvre la fiche de l’établissement', /case 'set-ice': return openSellerIce\(\)/.test(src) && /handlers\['account-edit-business'\]/.test(src));

console.log('■ Textes');
const keys = JSON.parse(vm.runInContext('JSON.stringify({fr:Object.keys(COPY.fr),en:Object.keys(COPY.en),ar:Object.keys(COPY.ar)})', ctx));
const missing = (from, to) => from.filter((k) => !to.includes(k));
ok('chaque texte existe en français, en anglais et en arabe',
  !missing(keys.fr, keys.en).length && !missing(keys.fr, keys.ar).length && !missing(keys.en, keys.fr).length && !missing(keys.ar, keys.fr).length,
  `manque en EN : ${missing(keys.fr, keys.en)} · manque en AR : ${missing(keys.fr, keys.ar)} · en trop : ${missing(keys.en, keys.fr)} ${missing(keys.ar, keys.fr)}`);
const all = vm.runInContext('JSON.stringify(COPY)', ctx);
ok('aucun tiret cadratin dans les textes visibles', !/\u2014/.test(all));
ok('aucun texte vide', !Object.values(JSON.parse(all)).some((dict) => Object.values(dict).some((v) => !String(v).trim())));

console.log(failed ? `\n✗ ${failed} échec(s) sur ${passed + failed}` : `\n✓ ${passed} contrôles`);
process.exit(failed ? 1 : 0);

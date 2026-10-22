#!/usr/bin/env node
/* Promotions dashboard UX contracts. These checks keep the empty state compact,
 * the creation flow guided, and the business engine wired while the page evolves. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/boutique-promos-dashboard.js'), 'utf8');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

ok('empty state explains automatic caisse pricing', source.includes('La caisse applique le bon prix automatiquement'));
ok('empty state explains receipt synchronization', source.includes('Tickets & reçus'));
ok('empty state explains label synchronization', source.includes('Prêtes à imprimer'));
ok('starter templates remain drafts until confirmation', source.includes('rien ne change avant votre validation'));
ok('three starter templates remain available', ['destock', 'finserie', 'weekend'].every((x) => source.includes(`${x}:`)));
ok('composer exposes three numbered steps', ['Définir l’offre', 'Choisir les articles', 'Programmer la durée'].every((x) => source.includes(x)));
ok('choice buttons expose pressed state', source.includes('aria-pressed="'));
ok('composer keeps a live impact preview', source.includes('Aperçu en direct'));
ok('composer validates before launch', source.includes("valid(d)") && source.includes('Lancer la promotion'));
ok('promotion engine still saves edits', source.includes('PRM().save(d)'));
ok('existing promotions can still pause', source.includes('PRM().setPaused'));
ok('existing promotions can still be deleted', source.includes("H['bpd-delete']"));
ok('labels still print through the barcode bridge', source.includes('window.KiwiBarcode.printLabels'));
ok('guided steps resist global section padding', source.includes('.bpd-step{flex:none;overflow:hidden;padding:0!important'));
ok('composer scrolls internally on desktop', source.includes('.bpd-form{min-height:0;gap:10px;overflow-y:auto'));
ok('mobile layout returns to document scrolling', source.includes('@media(max-width:900px)') && source.includes('.bpd-form{overflow:visible'));
ok('keyboard focus remains visible', source.includes(':focus-visible'));
ok('reduced-motion preference is respected', source.includes('prefers-reduced-motion:reduce'));

/* Le toast d'une promotion attend la réponse du serveur, et ne dit « la caisse
 * est à jour » que si elle est vraie. saveVerdict() est la vraie fonction. */
{
  const at = source.indexOf('function saveVerdict(');
  ok('save toast is decided by saveVerdict()', at >= 0);
  if (at >= 0) {
    let d = 0, end = -1;
    for (let k = source.indexOf('{', at); k < source.length; k++) {
      if (source[k] === '{') d++; else if (source[k] === '}' && --d === 0) { end = k + 1; break; }
    }
    const saveVerdict = new Function(source.slice(at, end) + '\nreturn saveVerdict;')();
    ok('local + server accepted → full success', saveVerdict(true, { ok: true, status: 200 }) === 'ok');
    ok('local, demo without cloud copy → full success', saveVerdict(true, null) === 'ok' && saveVerdict(true, { ok: false, error: 'disabled' }) === 'ok');
    ok('local, server offline → pending, never « la caisse est à jour »', saveVerdict(true, { ok: false, status: 0, offline: true }) === 'pending');
    ok('storage full, server accepted → sent', saveVerdict(false, { ok: true, status: 200 }) === 'sent');
    ok('storage full and offline → lost', saveVerdict(false, { ok: false, status: 0 }) === 'lost' && saveVerdict(false, null) === 'lost');
  }
  ok('save, pause and delete toasts wait for the commit verdict',
    source.includes('PRM().save(d);promoModal.close();announce(') && source.includes('announce(said,said,') && source.includes('announce(gone,gone,'));
  ok('announce() reads lastCommit() and awaits its server promise', /lastCommit\(\)[\s\S]{0,200}Promise\.resolve\(c\.server\)/.test(source));
  ok('unsaved warning is translated in FR / EN / AR', source.includes("L('Non enregistrée sur cet appareil', 'Not saved on this device', 'لم يُحفظ على هذا الجهاز')"));
}

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} promotions dashboard UX checks green`);

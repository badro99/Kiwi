#!/usr/bin/env node
/* Promotions dashboard · style contracts and the save verdict. The behaviour of the
 * page (empty state, starters, composer steps, launch, pause, delete, labels, the
 * toast that waits for the server) runs in tools/promotions-dashboard-run-test.mjs,
 * against the real engine. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/boutique-promos-dashboard.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'assets/boutique-promos-dashboard.css'), 'utf8');
const translations = fs.readFileSync(path.join(ROOT, 'assets/i18n.js'), 'utf8');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

ok('guided steps resist global section padding', styles.includes('.bpd-step{flex:none;overflow:hidden;padding:0!important'));
ok('composer scrolls internally on desktop', styles.includes('.bpd-form{min-height:0;gap:10px;overflow-y:auto'));
ok('mobile layout returns to document scrolling', styles.includes('@media(max-width:900px)') && styles.includes('.bpd-form{overflow:visible'));
ok('keyboard focus remains visible', styles.includes(':focus-visible'));
ok('reduced-motion preference is respected', styles.includes('prefers-reduced-motion:reduce'));

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
  ok('unsaved warning is translated in FR / EN / AR', ['Non enregistrée sur cet appareil', 'Not saved on this device', 'لم يُحفظ على هذا الجهاز'].every(text => translations.includes(text)));
}

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} promotions dashboard UX checks green`);

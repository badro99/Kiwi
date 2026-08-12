import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
function ok(label, value) {
  if (!value) throw new Error('FAIL: ' + label);
  n += 1;
  console.log('  ✓ ' + label);
}

const pairing = read('assets/caisse-pairing.js');
const onboarding = read('assets/onboarding.js');
const caisse = read('kiwi-caisse.html');
const boutique = read('assets/pos-boutique.js');
const ranges = read('assets/dateRange.js');
const vertical = read('assets/vertical-state.js');
const sw = read('kiwi-sw.js');
const dashPwa = read('assets/dashboard-pwa.js');
const caissePwa = read('assets/caisse-pwa.js');
const dashboard = read('dashboard.html');
const merchantConfig = read('assets/merchant-config.js');

ok('PIN roster network errors fail closed', pairing.includes("showPinLoadError(venue)") && !pairing.includes(".catch(function () { return []; })"));
ok('pairing redemption is single-flight', pairing.includes('if (pairSubmitting) return;') && pairing.includes('pairSubmitting = true;'));
ok('manager authorization uses a manager-level paired roster role', pairing.includes('authorizeManager: function (code)') && caisse.includes('managerCodeValid(mgrBuffer)'));
ok('cashier PIN can close the register without widening manager-only actions',
  pairing.includes('authorizeTill: function (code)')
  && pairing.includes("roles.opensTill((p && p.role) || '')")
  && caisse.includes("requireTillOperator('Fermeture de caisse', closeRegister)")
  && caisse.includes("requireManager('Remboursement'"));
ok('owner dashboard PIN spans all stores while manager PIN stays store-scoped',
  merchantConfig.includes('accountPinsReady: false')
  && merchantConfig.includes("if (!ownerRole(x && x.role)")
  && merchantConfig.includes("document.dispatchEvent(new CustomEvent('kiwi-account-pins-ready'))")
  && dashboard.includes("window.KiwiConfig.accountPinsReady === false")
  && dashboard.includes("accessTier(x && x.role) === 'owner'"));
ok('specialist PINs wait for their dispatcher', caisse.includes('verticalDemoPins') && caisse.includes('tryVertical(30)'));
ok('card and cash commit before the success modal closes', caisse.includes('finalizeTender(cardTenderMethod)') && caisse.includes("finalizeTender('cash')"));
ok('KDS action buttons keep a theme-stable, high-contrast label',
  caisse.includes('.kit-act-accept { background: var(--brand-deep); color: var(--inverse-ink); }')
  && caisse.includes('.kit-act-ready { background: var(--atlas); color: var(--inverse-ink); }')
  && caisse.includes('.kit-station.on { background: var(--brand-deep); border-color: var(--brand-deep); color: var(--inverse-ink); }')
  && caisse.includes('.kit-history-toggle.on { background: var(--brand-deep); border-color: var(--brand-deep); color: var(--inverse-ink); }')
  && !caisse.includes('.kit-act-accept { background: var(--ink)'));
ok('team composer uses a real transport or labels copy-only behavior honestly',
  (caisse.includes("fetch('/api/team/live'") && caisse.includes("if (!response.ok) throw"))
  || (caisse.includes('Copier le message') && !caisse.includes('Message envoyé à ${target}')));

ok('onboarding draft never persists PIN codes', onboarding.includes("name: String((p && p.name) || '').slice(0, 20), code: ''"));
ok('onboarding rejects missing owner and malformed goals', onboarding.includes("S.step === 1 || S.step === 7") && onboarding.includes('function parsedDailyGoal()'));
ok('onboarding success has no confetti', !onboarding.includes('Kiwi.confetti'));
ok('zero-sale payment mix always has a finite center total', ranges.includes('return { rows: [], total: 0') && ranges.includes('Number.isFinite(Number(rawCenterMad))'));
ok('boutique delivery receivables are excluded from money received', boutique.includes("x.m !== 'avoir' && x.m !== 'livraison'") && boutique.includes("if (p.m !== 'livraison') took += p.amount"));
ok('specialist state reads and writes with an explicit tenant', vertical.includes('store.get(activeVenue)') && vertical.includes('}, activeVenue);'));

const cache = /var CACHE = '([^']+)'/.exec(sw)?.[1];
ok('dashboard and caisse request the active service-worker generation', cache
  && dashPwa.includes('/kiwi-sw.js?v=' + cache.replace(/^kiwi-app-v/, ''))
  && caissePwa.includes('/kiwi-sw.js?v=' + cache.replace(/^kiwi-app-v/, '')));

console.log(`\n✓ critical flows (${n} controls)`);

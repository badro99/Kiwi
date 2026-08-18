#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'production-action-guard.js'), 'utf8');
let calls = 0;
const toasts = [];
const handlers = {
  'ret-refund-original': () => { calls += 1; return 'refunded'; },
  'spa-cli-wa-send': () => { calls += 1; return 'sent'; },
  'appt-filter': () => { calls += 1; return 'filtered'; }
};
let real = true;
const window = {
  KiwiEnv: { isReal: () => real },
  KiwiVenue: { isCustom: () => false },
  KiwiI18n: { getLang: () => 'en' },
  Kiwi: { handlers, toast: (title, opts) => toasts.push({ title, opts }) },
  addEventListener: () => {}
};
vm.runInNewContext(source, { window, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1 }, { filename: 'production-action-guard.js' });

function check(ok, label) {
  if (!ok) { console.error(`  ✗ ${label}`); process.exitCode = 1; return; }
  console.log(`  ✓ ${label}`);
}

const refund = handlers['ret-refund-original']();
check(refund && refund.ok === false && refund.reason === 'not-connected', 'real refund is blocked');
check(calls === 0, 'blocked action never reaches demo implementation');
check(toasts.length === 1 && /No payment/.test(toasts[0].opts.desc), 'warning states that nothing happened');
handlers['spa-cli-wa-send']();
check(calls === 0 && toasts.length === 2, 'real WhatsApp claim is blocked');
check(handlers['appt-filter']() === 'filtered' && calls === 1, 'non-effect filter remains usable');
real = false;
check(handlers['ret-refund-original']() === 'refunded' && calls === 2, 'local demo action remains available');

/* Une clé mal orthographiée protège le vide en silence : le garde s'installe
 * sans erreur, le bouton continue de mentir. Chaque clé gardée doit donc être
 * enregistrée quelque part dans assets/. */
const guarded = [...window.KiwiProductionActions.guarded];
const assetsDir = path.join(__dirname, '..', 'assets');
const bundle = fs.readdirSync(assetsDir)
  /* sans le garde lui-même : sa propre liste ferait correspondre n'importe
   * quelle faute de frappe à elle-même, et le contrôle ne dirait plus rien. */
  .filter((f) => f.endsWith('.js') && f !== 'production-action-guard.js')
  .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
  .join('\n');
const orphans = guarded.filter((k) => !bundle.includes(`'${k}'`) && !bundle.includes(`"${k}"`));
check(orphans.length === 0, `aucune clé gardée orpheline${orphans.length ? ' — ' + orphans.join(', ') : ''}`);

/* Les promesses vers l'extérieur relevées en production le 2026-07-27 : envoi
 * WhatsApp, bulletin « envoyé au gérant », registres exportés. Elles doivent
 * rester gardées. Les exports qui fabriquent un vrai Blob n'y sont pas. */
const OUTWARD = [
  'eq-publish-plan', 'eq-gap-whatsapp', 'eq-export-payroll', 'pay-export',
  'export-payroll', 'stock-send-suggested',
  'stock-program-shortfall', 'audit-export', 'cal-export', 'cf-hyg-export',
  'hx-taxe-export', 'mi-export', 'resv-sms'
];
const ungarded = OUTWARD.filter((k) => !guarded.includes(k));
check(ungarded.length === 0, `promesses extérieures gardées${ungarded.length ? ' — manque ' + ungarded.join(', ') : ''}`);

/* Ceux-là produisent vraiment un fichier : les garder serait casser une
 * fonction qui marche. */
const REAL_DOWNLOADS = ['export', 'bqx-export', 'margin-export'];
const overGuarded = REAL_DOWNLOADS.filter((k) => guarded.includes(k));
check(overGuarded.length === 0, `les vrais téléchargements restent libres${overGuarded.length ? ' — ' + overGuarded.join(', ') : ''}`);

if (!process.exitCode) console.log(`\n✓ 9 production action honesty checks passed (${guarded.length} actions gardées).`);

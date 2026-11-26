// Traduction automatique de la carte : un plat que le modèle laisse tel quel ne relance pas l'IA en boucle (audit du 26 nov. 2026).
//
// « Espresso » rendu inchangé en arabe est refusé (aucune lettre arabe), donc
// toujours « à traduire ». Le dépôt dans le store notifiait quand même, la
// notification réarmait la traduction 2,5 s plus tard : un tableau de bord
// ouvert appelait /api/ai/menu-translate jusqu'au plafond du jour. Rejoué sur
// le vrai ensureTranslations de assets/restaurant-menu-workspace.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ws = fs.readFileSync(path.join(ROOT, 'assets/restaurant-menu-workspace.js'), 'utf8');
const start = ws.indexOf('  async function ensureTranslations(o){');
const end = ws.indexOf('  function i18nPanel(){', start);
assert.ok(start > 0 && end > start, 'ensureTranslations and scheduleAutoTranslate found');
let checks = 0;
const ok = (v, m, d) => { assert.ok(v, m + (d ? ' · ' + d : '')); checks += 1; };

function harness() {
  const env = { calls: 0, notifies: 0, timers: [], now: 1_000_000 };
  const menu = { cats: [], items: [{ id: 'esp', name: 'Espresso' }] };
  const M = {
    asLang: (l) => l, LANGS: ['ar'], langs: () => ['ar'],
    needs: () => ({ ar: { count: 1 } }),   // le plat reste « à traduire » : le modèle l'a rendu en latin
  };
  const store = { setI18n: () => { env.notifies += 1; sched(); return 0; } };
  const deps = {
    window: { KiwiMenuI18n: M }, D: () => menu, S: () => store, realSession: () => true, menuLangFeature: () => false,
    venue: () => 'shop', ui: (k) => k, toast: () => {}, i18nRefreshPanel: () => {}, isRestaurant: () => true, render: () => {},
    i18nChunks: (n) => [{ cats: [], items: [{ id: 'esp' }], opts: [] }],
    document: { body: { classList: { contains: () => false } } },
    fetch: async () => { env.calls += 1; return { status: 200, ok: true, json: async () => ({ ok: true, items: [{ id: 'esp', name: 'Espresso' }] }) }; },
    setTimeout: (fn) => { env.timers.push(fn); return env.timers.length; }, clearTimeout: () => {},
    Date: { now: () => env.now },
  };
  const names = Object.keys(deps);
  const make = new Function(...names, `let i18nBusy=false,i18nTimer=0,i18nCooldown=0,i18nProgress='';\n${ws.slice(start, end)}\nreturn { ensureTranslations, scheduleAutoTranslate };`);
  const api = make(...names.map((n) => deps[n]));
  function sched() { api.scheduleAutoTranslate(); }
  return { api, env, flush: async (rounds) => { for (let i = 0; i < rounds && env.timers.length; i++) { env.now += 2600; const fn = env.timers.shift(); fn(); await new Promise((r) => setTimeout(r, 0)); } } };
}

{
  const h = harness();
  await h.api.ensureTranslations({ silent: true });
  await h.flush(20);
  ok(h.env.calls === 1, 'a silent run that translates nothing calls the model once, not in a loop', `${h.env.calls} calls`);
}
{
  const h = harness();
  await h.api.ensureTranslations({ silent: true });
  h.env.now += 11 * 3600e3;
  await h.api.ensureTranslations({ silent: true });
  ok(h.env.calls === 2, 'it tries again on a later day', `${h.env.calls} calls`);
}
{
  const h = harness();
  await h.api.ensureTranslations({ silent: true });
  await h.api.ensureTranslations({ silent: false });
  ok(h.env.calls === 2, 'the owner\'s own « Traduire ce qui manque » still runs at once', `${h.env.calls} calls`);
}
console.log(`✓ menu-translate-loop-test : ${checks} contrôles (un plat que le modèle laisse en latin ne relance pas la traduction en boucle)`);

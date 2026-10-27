/* Le centre de notifications du serveur garde ses 100 dernières notices et
 * n'en perd plus aucune au-delà : l'excédent passe dans l'archive de
 * l'appareil (même cloison marchand + employé, 500 au plus) et « Voir plus »
 * la relit 50 par 50. Le test exécute les vraies fonctions de
 * assets/serveur/service-runtime.js et assets/serveur-app.js dans un bac à
 * sable ; sur l'ancien code, la 101e notice effaçait la plus ancienne. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');

function pick(file, names) {
  const text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out = {};
  for (const n of ast.statements) if (ts.isFunctionDeclaration(n) && names.includes(n.name.text)) out[n.name.text] = text.slice(n.getStart(ast), n.end);
  for (const name of names) assert.ok(out[name], name + ' introuvable dans ' + file);
  return names.map((name) => out[name]).join('\n');
}
const code = pick('assets/serveur/service-runtime.js', ['saveServiceHistory', 'serviceNotify'])
  + '\n' + pick('assets/serveur-app.js', ['renderNotifications', 'employeePick']);

function sandbox(key = 'kiwi-service-notifications:amira-cafe:sara') {
  const store = new Map();
  const list = {
    dataset: {}, innerHTML: '', more: null,
    querySelectorAll: () => [],
    querySelector(sel) {
      if (sel !== '[data-notification-more]' || !this.innerHTML.includes('data-notification-more')) return null;
      const self = this;
      return { addEventListener(_, fn) { self.more = fn; } };
    },
  };
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
    },
    window: {}, document: { visibilityState: 'visible' }, employeeLanguage: 'fr',
    serviceNotifications: [], serviceEventSeen: new Set(), serviceHistoryKey: key,
    currentTab: 'tables', serviceUnread: 0, tables: {},
    loadServiceHistory() {}, updateNotificationBadge() {}, toast() {},
    $: (sel) => (sel === '#notification-list' ? list : null),
    esc: (s) => String(s), notificationIcon: () => 'bell', notificationOrigin: () => 'Salle',
    notificationRelativeTime: () => 'maintenant', serviceTableId: (v) => v, setTab() {}, openTableDetail() {},
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.api = { serviceNotify, saveServiceHistory, renderNotifications };', ctx);
  ctx.renderNotifications = ctx.api.renderNotifications;
  const archive = () => JSON.parse(store.get(ctx.serviceHistoryKey + ':archive') || '[]');
  const cards = () => (list.innerHTML.match(/class="notification-card/g) || []).length;
  return { ctx, store, list, archive, cards, notify: (i) => ctx.api.serviceNotify('Table ' + i, 'Appel', { id: 'n' + i, ts: 1000 + i }) };
}

// 1. 130 notices : 100 vivantes, 30 archivées, les plus récentes de l'excédent d'abord.
{
  const s = sandbox();
  for (let i = 1; i <= 130; i++) s.notify(i);
  assert.equal(s.ctx.serviceNotifications.length, 100, '100 notices vivantes');
  assert.equal(JSON.parse(s.store.get(s.ctx.serviceHistoryKey)).length, 100, '100 notices écrites');
  const arch = s.archive();
  assert.equal(arch.length, 30, "l'excédent n'est pas perdu");
  assert.deepEqual(arch.slice(0, 3).map((n) => n.id), ['n30', 'n29', 'n28'], 'plus récentes d\'abord');
  assert.equal(arch.at(-1).id, 'n1', 'la toute première notice reste lisible');
  assert.ok(arch.every((n) => n.unread === false), 'une notice archivée ne compte pas comme non lue');
  // Un nouvel enregistrement ne double rien.
  s.ctx.api.saveServiceHistory();
  assert.equal(s.archive().length, 30, 'pas de doublon dans l\'archive');
  // 2. « Voir plus » : 100 cartes et un bouton, puis 130 et plus de bouton.
  s.ctx.api.renderNotifications();
  assert.equal(s.cards(), 100);
  assert.match(s.list.innerHTML, /Voir plus · 30 plus anciennes/);
  s.ctx.employeeLanguage = 'en';
  s.ctx.api.renderNotifications();
  assert.match(s.list.innerHTML, /Show more · 30 older/, 'le bouton est traduit à la source');
  s.ctx.employeeLanguage = 'fr';
  s.list.more();
  assert.equal(s.cards(), 130, 'les 30 archivées s\'affichent');
  assert.ok(!s.list.innerHTML.includes('data-notification-more'), 'plus rien à relire');
}

// 3. L'archive garde 500 notices au plus, 50 de plus par « Voir plus ».
{
  const s = sandbox();
  for (let i = 1; i <= 700; i++) s.notify(i);
  const arch = s.archive();
  assert.equal(arch.length, 500, 'archive bornée à 500');
  assert.equal(arch[0].id, 'n600', 'la plus récente de l\'archive suit la liste vivante');
  s.ctx.api.renderNotifications();
  s.list.more();
  assert.equal(s.cards(), 150);
  assert.match(s.list.innerHTML, /Voir plus · 450 plus anciennes/);
  // 4. Un autre employé sur l'appareil repart de zéro, sur sa propre archive.
  s.ctx.serviceHistoryKey = 'kiwi-service-notifications:amira-cafe:karim';
  s.ctx.serviceNotifications.length = 0;
  s.ctx.api.renderNotifications();
  assert.equal(s.list.dataset.archiveShown, '0', 'le compte affiché repart de zéro');
  assert.match(s.list.innerHTML, /Aucune notification/, "l'archive de Sara n'apparaît pas chez Karim");
}

// 5. Sans historique chargé, la liste reste bornée à 100 comme avant.
{
  const s = sandbox('');
  for (let i = 1; i <= 120; i++) s.notify(i);
  assert.equal(s.ctx.serviceNotifications.length, 100, 'garde-fou sans clé');
}

console.log('✓ serveur-notice-archive-test : 100 notices vivantes, excédent archivé sans perte ni doublon, « Voir plus » 50 par 50, cloison par employé');

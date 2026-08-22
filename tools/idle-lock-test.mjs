#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · verrouillage par inactivité — assets/idle-lock.js
 *
 *   node tools/idle-lock-test.mjs
 *
 * Le module livré est EXÉCUTÉ, pas relu : il tourne dans un vm avec un faux
 * document, une fausse horloge et un location.reload() espionné. Une assertion
 * portant sur une expression régulière dirait seulement que le fichier contient
 * le bon texte ; ici on vérifie qu'il verrouille, et surtout qu'il verrouille
 * DANS LE CAS QUI COMPTE — le retour d'un onglet gelé en arrière-plan, où aucun
 * minuteur ne s'est exécuté.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/idle-lock.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log('■ Idle lock (tools/idle-lock-test.mjs)');

/* ── Un DOM juste assez réel ──────────────────────────────────────────────── */
function boot({ search = '', gateAttached = false, gateHidden = true, wizardOpen = false } = {}) {
  let now = 1_000_000;
  const handlers = { window: {}, document: {} };
  const reloads = [];
  const intervals = [];

  const node = () => {
    const n = {
      style: { cssText: '', display: '' },
      children: [],
      isConnected: true,
      setAttribute() {}, appendChild(c) { this.children.push(c); return c; },
      addEventListener() {},
      textContent: '',
    };
    return n;
  };

  const gate = gateAttached
    ? Object.assign(node(), { isConnected: true, style: { display: gateHidden ? 'none' : '' } })
    : null;
  const wizard = wizardOpen ? node() : null;

  const doc = {
    hidden: false,
    readyState: 'complete',
    body: node(),
    addEventListener(ev, fn) { (handlers.document[ev] ||= []).push(fn); },
    querySelector(sel) {
      if (sel.indexOf('data-kiwi-lock') >= 0) return gate;
      if (sel.indexOf('kob-root') >= 0) return wizard;
      return null;
    },
    createElement() { return node(); },
    createTextNode(t) { return { textContent: t }; },
  };

  const sandbox = {
    document: doc,
    URLSearchParams,
    console,
    Date: new Proxy(Date, { get: (t, k) => (k === 'now' ? () => now : t[k]) }),
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: () => {},
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    location: { search, href: 'https://kiwi-os.com/dashboard.html' + search, reload() { reloads.push(now); } },
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = (ev, fn) => { (handlers.window[ev] ||= []).push(fn); };

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  return {
    sandbox, reloads, handlers,
    advance: (ms) => { now += ms; },
    at: () => now,
    tick: () => intervals.forEach((fn) => fn()),
    fire: (target, ev, arg) => (handlers[target][ev] || []).forEach((fn) => fn(arg)),
    hide() { doc.hidden = true; this.fire('document', 'visibilitychange'); },
    show() { doc.hidden = false; this.fire('document', 'visibilitychange'); },
    doc,
  };
}

/* ── 1. Le cas client : l'onglet gelé derrière l'application de caisse ─────── */
{
  const t = boot();
  t.hide();
  t.advance(4 * 60 * 1000);          /* 4 min d'arrière-plan, aucun minuteur n'a tourné */
  t.tick();                          /* même si un tic passait, l'onglet est caché */
  ok(t.reloads.length === 0, 'un onglet caché ne se recharge pas pendant qu\'il est caché');
  t.show();
  ok(t.reloads.length === 1, 'au retour après 4 min d\'absence, la page se recharge — donc la porte à code rejoue');
}

/* ── 2. Une absence courte ne dérange personne ─────────────────────────────── */
{
  const t = boot();
  t.hide();
  t.advance(60 * 1000);              /* 1 min : on regarde un message et on revient */
  t.show();
  ok(t.reloads.length === 0, 'une absence d\'une minute ne verrouille pas');
}

/* ── 3. Le seuil « caché » est bien celui, plus court, du scénario client ──── */
{
  const away = boot().sandbox.window.KiwiIdleLock.AWAY_MS;
  const idle = boot().sandbox.window.KiwiIdleLock.IDLE_MS;
  ok(away < idle, 'le seuil d\'onglet caché est plus court que celui d\'inactivité au premier plan');
  ok(away <= 5 * 60 * 1000 && idle <= 15 * 60 * 1000, 'les deux seuils restent dans des durées défendables (≤ 5 min / ≤ 15 min)');
}

/* ── 4. Inactivité au premier plan : préavis, puis verrouillage ────────────── */
{
  const t = boot();
  const { IDLE_MS, WARN_MS } = t.sandbox.window.KiwiIdleLock;
  t.advance(IDLE_MS - WARN_MS - 1000);
  t.tick();
  ok(t.reloads.length === 0, 'avant le préavis, rien ne se passe');
  ok(t.doc.body.children.length === 0, 'et aucune barre d\'avertissement n\'est encore posée');
  t.advance(2000);                   /* on entre dans la fenêtre de préavis */
  t.tick();
  ok(t.doc.body.children.length === 1, 'la barre de préavis apparaît avant de verrouiller');
  ok(t.reloads.length === 0, 'le préavis ne verrouille pas encore');
  t.advance(WARN_MS);
  t.tick();
  ok(t.reloads.length === 1, 'passé le délai complet, la page se recharge');
}

/* ── 5. Un geste repousse l'échéance ──────────────────────────────────────── */
{
  const t = boot();
  const { IDLE_MS } = t.sandbox.window.KiwiIdleLock;
  t.advance(IDLE_MS - 5000);
  t.fire('window', 'pointerdown');
  t.advance(IDLE_MS - 5000);
  t.tick();
  ok(t.reloads.length === 0, 'un geste remet le compteur à zéro');
  t.advance(10000);
  t.tick();
  ok(t.reloads.length === 1, '…et le compteur repart bien du geste, pas du chargement');
}

/* ── 6. La vue support n'est jamais verrouillée ────────────────────────────── */
for (const search of ['?op=1&merchant=browse', '?merchant=browse']) {
  const t = boot({ search });
  t.hide();
  t.advance(60 * 60 * 1000);
  t.show();
  t.tick();
  ok(t.reloads.length === 0, `vue portée (${search}) : jamais de verrouillage automatique — l'opérateur n'a pas le code du commerçant`);
}

/* ── 7. On ne recharge pas par-dessus la porte à code déjà ouverte ─────────── */
{
  const t = boot({ gateAttached: true, gateHidden: false });
  const { IDLE_MS } = t.sandbox.window.KiwiIdleLock;
  t.advance(IDLE_MS + 60000);
  t.tick();
  ok(t.reloads.length === 0, 'quand la porte à code est déjà à l\'écran, on ne recharge pas sous les doigts de la personne');
}

/* ── 7 bis. L'assistant d'installation garde la main ───────────────────────
   Il ouvre son écran en appelant __kiwiLock.hide(), donc la porte à code paraît
   fermée pendant qu'une personne est en train de saisir sa configuration.
   Recharger là lui ferait perdre sa saisie. */
{
  const t = boot({ wizardOpen: true });
  const { IDLE_MS } = t.sandbox.window.KiwiIdleLock;
  t.advance(IDLE_MS + 60000);
  t.tick();
  ok(t.reloads.length === 0, 'pendant l\'assistant d\'installation, aucun rechargement');
  t.hide();
  t.advance(30 * 60 * 1000);
  t.show();
  ok(t.reloads.length === 0, '…y compris au retour d\'une longue absence');
}

/* ── 8. Reprise du cache arrière/avant ─────────────────────────────────────── */
{
  const t = boot();
  t.hide();
  t.advance(10 * 60 * 1000);
  t.doc.hidden = false;              /* iOS ressort la page sans visibilitychange */
  t.fire('window', 'pageshow', { persisted: true });
  ok(t.reloads.length === 1, 'une page ressortie du cache arrière/avant après une longue absence se recharge aussi');
}

/* ── 9. Invariants de câblage — un module non chargé ne protège rien ───────── */
{
  const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
  const tag = html.match(/<script[^>]*src="assets\/idle-lock\.js\?v=(\d+)"/);
  ok(!!tag, 'dashboard.html charge assets/idle-lock.js');
  const shell = sw.match(/'\/assets\/idle-lock\.js\?v=(\d+)'/);
  ok(!!shell, 'kiwi-sw.js précharge assets/idle-lock.js');
  ok(!!tag && !!shell && tag[1] === shell[1],
    `l'estampille est la même des deux côtés (shell ${tag && tag[1]} / sw ${shell && shell[1]})`);

  /* Le piège que ce module existe pour éviter : __kiwiLock.show() sur un nœud
     que dashboard.html a retiré du DOM. S'il réapparaît ici, le verrouillage
     redevient silencieusement inopérant. */
  /* Sur le CODE, pas sur les commentaires : l'en-tête du module explique
     justement pourquoi __kiwiLock.show() ne peut pas servir, et cette phrase
     doit pouvoir rester. */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/__kiwiLock\s*\.\s*show/.test(code),
    'le module ne passe pas par __kiwiLock.show() — l\'écran de code est retiré du DOM après l\'intro');
  ok(/location\.reload\(\)/.test(SRC), 'il recharge la page, ce qui rejoue la porte à code');
  ok(/visibilitychange/.test(SRC) && /pageshow/.test(SRC),
    'il écoute les deux reprises d\'un onglet gelé, pas seulement un minuteur');
}

console.log('');
if (failures.length) {
  console.log(`[31m✗ ${failures.length} échec(s), ${passed} contrôle(s) passés.[0m`);
  process.exit(1);
}
console.log(`[32m✓ ${passed} contrôles passés.[0m`);

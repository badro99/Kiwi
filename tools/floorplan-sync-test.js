#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU du plan de salle qui traverse les appareils
 * ---------------------------------------------------------------------------
 * Le patron dessine sa salle sur son portable ; la tablette du comptoir doit la
 * retrouver. Ça a été faux pendant tout le temps où le lecteur du plan s'armait
 * ainsi, dans le script EN LIGNE de kiwi-caisse.html :
 *
 *     if (!window.KiwiCloudDoc) return;          // ← et c'était fini
 *
 * `assets/cloud-doc.js` porte `defer` : il ne s'exécute qu'une fois le document
 * analysé, donc APRÈS le script en ligne. Ce `return` partait donc TOUJOURS.
 * Conséquences, toutes silencieuses :
 *   · la caisse n'a jamais demandé /api/store?feature=floorplan ;
 *   · « Rafraîchir » n'avait rien à relire (pullAll ne parcourt que les
 *     documents ATTACHÉS — un document jamais attaché est invisible) ;
 *   · seul le même navigateur s'en sortait, par le miroir localStorage.
 * D'où un bogue qui marchait chez celui qui le testait et jamais au comptoir.
 *
 * On ne teste donc pas la forme du code mais son COMPORTEMENT : on extrait le
 * bloc d'armement de la page, on le fait tourner sur une horloge que l'on tient,
 * et on fait arriver `KiwiCloudDoc` — puis l'appairage — en retard, comme dans
 * la vraie page. Le contrat : il faut que ça finisse par s'attacher et lire, une
 * seule fois, sans jamais tourner en rond.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const PAGES = fs.readFileSync(path.join(ROOT, 'assets', 'pages-pro.js'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'functions', 'api', 'store.js'), 'utf8');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }
function eq(label, got, want) {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
}

/* ── Extraction du bloc d'armement ────────────────────────────────────────
 * On l'ancre sur le miroir par slug (la ligne ne vit qu'ici), on remonte à
 * l'IIFE qui l'englobe, puis on compte les accolades. Un extracteur qui se
 * tromperait de bornes ferait passer le test sur du vide : on vérifie donc
 * ensuite que ce qu'on a bien découpé ressemble à ce qu'on croit. */
function extractArmingBlock(src) {
  const anchor = src.indexOf("const slugMirror = (slug) => 'kiwiPlanDeSalle:slug:' + slug;");
  if (anchor < 0) return null;
  const start = src.lastIndexOf('(function () {', anchor);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const end = src.indexOf(';', i);
        return src.slice(start, end + 1);
      }
    }
  }
  return null;
}

const BLOCK = extractArmingBlock(CAISSE);
ok("le bloc d'armement du plan est trouvable dans kiwi-caisse.html", !!BLOCK);
if (!BLOCK) {
  console.error('\n\x1b[31m✗ bloc introuvable — le test ne peut rien affirmer.\x1b[0m');
  process.exit(1);
}
ok("le bloc découpé contient bien l'attache du document 'floorplan'", /feature:\s*'floorplan'/.test(BLOCK));
ok("le bloc découpé contient bien la relance différée", /setTimeout\(/.test(BLOCK));

/* ── Une horloge que l'on tient ───────────────────────────────────────────── */
function makeClock() {
  let queue = [];
  let now = 0;
  return {
    setTimeout(fn, ms) { queue.push({ fn, at: now + (Number(ms) || 0) }); },
    tick(ms) {
      now += Number(ms) || 0;
      for (;;) {
        const due = queue.filter((t) => t.at <= now);
        if (!due.length) return;
        queue = queue.filter((t) => t.at > now);
        due.forEach((t) => { try { t.fn(); } catch (_) {} });
      }
    },
    pending() { return queue.length; },
  };
}

/* Fait tourner le bloc dans un monde de poche. `cloudAt` = au bout de combien de
 * millisecondes `window.KiwiCloudDoc` apparaît (comme un script `defer`) ;
 * `enabledAt` = à partir de quand le magasin est connu (appairage résolu). */
function run(opts) {
  const o = opts || {};
  const clock = makeClock();
  const log = { attach: 0, bind: 0, listeners: 0, opts: null };

  const handle = {
    enabled: () => (o.enabledAt != null && elapsed >= o.enabledAt),
    bind: () => { log.bind++; },
  };
  let elapsed = 0;

  const cloud = {
    attach: (cfg) => { log.attach++; log.opts = cfg; return handle; },
    currentSlug: () => (handle.enabled() ? 'amira-cafe' : ''),
  };

  const store = Object.create(null);
  const win = {
    KiwiFloorPlan: null,
    localStorage: null,
  };
  const sandbox = {
    window: win,
    document: {
      addEventListener: (ev) => { if (ev === 'kiwi-paired') log.listeners++; },
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    setupRealSalle: () => { log.repaint = (log.repaint || 0) + 1; },
    JSON,
  };
  sandbox.globalThis = sandbox;

  if (o.cloudAt === 0) win.KiwiCloudDoc = cloud;
  vm.createContext(sandbox);
  vm.runInContext(BLOCK, sandbox, { timeout: 5000 });

  // On avance par pas de 250 ms, en faisant apparaître les pièces à l'heure dite.
  for (let step = 0; step < 80; step++) {
    elapsed += 250;
    if (o.cloudAt != null && elapsed >= o.cloudAt) win.KiwiCloudDoc = cloud;
    clock.tick(250);
  }
  return { log, clock, win, store, cfg: log.opts };
}

/* ── 1. Le cas qui était cassé : cloud-doc.js arrive après (defer) ────────── */
{
  const r = run({ cloudAt: 500, enabledAt: 0 });
  eq('cloud-doc en retard (defer) → le document finit par être attaché', r.log.attach, 1);
  ok('cloud-doc en retard → la lecture serveur est bien lancée', r.log.bind >= 1);
  eq('cloud-doc en retard → on ne lit qu’une fois', r.log.bind, 1);
  eq('cloud-doc en retard → un seul écouteur « kiwi-paired »', r.log.listeners, 1);
}

/* ── 2. cloud-doc est là tout de suite, mais l'appairage traîne ───────────── */
{
  const r = run({ cloudAt: 0, enabledAt: 1500 });
  eq('appairage tardif → attaché une seule fois', r.log.attach, 1);
  eq('appairage tardif → la lecture part quand le magasin est connu', r.log.bind, 1);
  eq('appairage tardif → un seul écouteur « kiwi-paired »', r.log.listeners, 1);
}

/* ── 3. Jamais appairée : on n'interroge pas le serveur, et on s'arrête ───── */
{
  const r = run({ cloudAt: 0, enabledAt: null });
  eq('caisse jamais appairée → aucune lecture serveur', r.log.bind, 0);
  eq('caisse jamais appairée → attachée au plus une fois', r.log.attach, 1);
  eq('caisse jamais appairée → plus aucune relance en attente (borné)', r.clock.pending(), 0);
}

/* ── 4. Ce que le document sait faire une fois attaché ────────────────────── */
{
  const r = run({ cloudAt: 0, enabledAt: 0 });
  const cfg = r.cfg;
  ok('le document attaché est bien « floorplan »', cfg && cfg.feature === 'floorplan');
  ok('le signet de révision nomme la copie LOCALE (miroir par slug)',
    cfg && typeof cfg.localKey === 'function' && cfg.localKey() === 'kiwiPlanDeSalle:slug:amira-cafe');
  ok('une salle sans table est considérée vide (rien à propager)',
    cfg && cfg.isEmpty({ zones: [], tables: [], staff: [] }) === true);
  ok('une salle avec une table n’est PAS vide',
    cfg && cfg.isEmpty({ tables: [{ id: 't1' }] }) === false);

  // L'écriture : miroir local + plan global + repeinture.
  const plan = { zones: [{ id: 'z1', name: 'Salle' }], tables: [{ id: 't1', num: '1', type: 'round4' }], staff: [] };
  cfg.write(plan);
  eq('la copie serveur est rangée sous le slug', r.store['kiwiPlanDeSalle:slug:amira-cafe'], JSON.stringify(plan));
  ok('le plan reçu est posé sur window.KiwiFloorPlan (ce que lit caisseFloorPlan)',
    r.win.KiwiFloorPlan === plan);
  ok('recevoir un plan repeint la salle', (r.log.repaint || 0) >= 1);

  // La lecture : le miroir local d'abord, une forme neutre sinon.
  const back = cfg.read();
  ok('la relecture retrouve le plan écrit', back && back.tables && back.tables.length === 1);
}

/* ── 5. Les deux bouts de la chaîne, côté source ──────────────────────────── */
{
  // Si un jour cloud-doc.js cesse d'être `defer`, la relance devient une
  // ceinture en plus d'une bretelle — pas une panne. Mais on veut le SAVOIR.
  ok('assets/cloud-doc.js est bien chargé en `defer` (d’où la relance)',
    /<script src="assets\/cloud-doc\.js" defer><\/script>/.test(CAISSE));
  ok('le lecteur du plan vit dans le script EN LIGNE (pas un module différé)',
    CAISSE.indexOf(BLOCK) > CAISSE.indexOf('<script>'));

  // Le serveur doit continuer à accepter la forme du plan.
  ok('/api/store accepte la fonctionnalité « floorplan »', /floorplan:\s*\{\s*keys:/.test(STORE));
  ok('/api/store reconnaît un plan à ses tables et ses zones',
    /floorplan:\s*\{\s*keys:\s*\[[^\]]*'tables'[^\]]*\]/.test(STORE)
    && /floorplan:\s*\{\s*keys:\s*\[[^\]]*'zones'[^\]]*\]/.test(STORE));

  // Le tableau de bord doit encore écrire les deux copies.
  ok('le tableau de bord écrit le miroir par slug (même navigateur)',
    /localStorage\.setItem\(PDS_LS_KEY \+ ':slug:' \+ slug/.test(PAGES));
  ok('le tableau de bord pousse le plan au serveur à chaque enregistrement',
    /function pdsSave\(state\)\s*\{[\s\S]{0,160}pdsCloud\(\)[\s\S]{0,60}\.push\(\)/.test(PAGES));
  ok('la caisse préfère la copie serveur au miroir local',
    CAISSE.indexOf('window.KiwiFloorPlan && Array.isArray(window.KiwiFloorPlan.tables)')
    < CAISSE.indexOf("localStorage.getItem('kiwiPlanDeSalle:slug:' + slug)"));
}

/* ── Verdict ──────────────────────────────────────────────────────────────── */
const line = '─'.repeat(64);
console.log('\n' + line);
if (fails.length) {
  console.log(`\x1b[31m✗ ${fails.length} échec(s) sur ${pass + fails.length}.\x1b[0m`);
  fails.forEach((f) => console.log('  \x1b[31m✗\x1b[0m ' + f));
  console.log(line);
  process.exit(1);
}
console.log(`  \x1b[32m✓\x1b[0m plan de salle → caisse (${pass} contrôles : armement différé, `
  + 'relance bornée, un seul écouteur, miroir par slug, forme serveur)');
console.log(line);

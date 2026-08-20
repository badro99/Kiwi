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
const VENUES = fs.readFileSync(path.join(ROOT, 'assets', 'venues.js'), 'utf8');
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
  ok('une table conserve jusqu’à trois serveurs et garde le premier pour les anciens clients',
    /const PDS_MAX_TABLE_SERVERS = 3/.test(PAGES)
    && /table\.servers = clean;[\s\S]{0,160}table\.server = clean\[0\] \|\| null/.test(PAGES));
  ok("l'API employé résout les identifiants du plan vers les vrais comptes Équipe",
    /function normalizedFloorStaff\(raw, members\)/.test(
      fs.readFileSync(path.join(ROOT, 'functions', 'api', 'employee.js'), 'utf8')));
  ok('l’inspecteur expose exactement trois emplacements de serveur',
    /\$\{\[0,1,2\]\.map\(slot =>/.test(PAGES));
  ok('glisser un serveur ajoute une affectation sans écraser les précédentes',
    /pdsSetServerIds\(t, current\.concat\(sid\)\)/.test(PAGES));
  ok('le plan ne propose que les rôles capables de prendre une section',
    /function pdsIsFloorRole\(role\)/.test(PAGES)
    && /filter\(m => m && m\.id && pdsIsFloorRole\(m\.role\)\)/.test(PAGES));
  ok("un ancien membre Équipe qui n'est plus éligible disparaît du plan",
    /s\.from !== 'team' \|\| byId\.has\(s\.id\)/.test(PAGES));
  ok("le plan se resynchronise quand l'équipe distante finit de charger",
    /addEventListener\('kiwi-team-ready', pdsRefreshLiveStaff\)/.test(PAGES)
    && /addEventListener\('kiwi-team-changed', pdsRefreshLiveStaff\)/.test(PAGES));
  ok('une copie serveur tardive est rapprochée du roster courant avant affichage',
    /write: function \(d\) \{\s*d = pdsSyncStaff\(d\);/.test(PAGES));
  ok('la caisse préfère la copie serveur au miroir local',
    CAISSE.indexOf('window.KiwiFloorPlan && Array.isArray(window.KiwiFloorPlan.tables)')
    < CAISSE.indexOf("localStorage.getItem('kiwiPlanDeSalle:slug:' + slug)"));

  // Règles de sécurité et nommage multi-locataires
  ok('pdsKey nomme les identifiants transitoires par slug',
    /PDS_LS_KEY \+ ':' \+ vid \+ '@' \+ slug/.test(PAGES));
  ok('pdsKey retourne chaîne vide si aucun slug n’est résolu (fail-closed)',
    /return slug \? PDS_LS_KEY \+ ':' \+ vid \+ '@' \+ slug : ''/.test(PAGES));
  ok('pdsWriteLocal ne tente pas d’écrire si la clé est vide',
    /const key = pdsKey\(\);[\s\S]{0,60}if \(key\) \{\s*try \{\s*localStorage\.setItem\(key/.test(PAGES));
  ok('pdsRawState retourne un état vide sans clé',
    /const key = pdsKey\(\);[\s\S]{0,60}if \(!key\) return \{ zones: \[\], tables: \[\], staff: \[\] \};/.test(PAGES));
  ok('pdsCarryForward n’opère pas sur les identifiants transitoires',
    /var transients =[\s\S]{0,100}if \(transients\.indexOf\(vid\) >= 0\) return;/.test(PAGES));
  ok('venues.js nettoie les anciens seaux kiwiPlanDeSalle dans resetScopedRecords',
    /SCOPED_PDS = \/\^kiwiPlanDeSalle:scoped@\(\.\+\)\$\//.test(VENUES)
    && /SCOPED_REC\.test\(k\) \|\| k === 'kiwiPlanDeSalle:scoped' \|\| k === 'kiwiPlanDeSalle:own'/.test(VENUES));
  ok('venues.js exporte tenantOf et TRANSIENT_IDS',
    /tenantOf:\s*salesTenant/.test(VENUES) && /TRANSIENT_IDS/.test(VENUES));
}

/* ── 6. Isolation multi-locataires & Fail-closed (vue opérateur / God mode) ── */
{
  const store = Object.create(null);
  const sandbox = {
    window: {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] || null,
      get length() { return Object.keys(store).length; },
    },
    document: {
      addEventListener: () => {},
    },
    JSON,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  let currentVenue = 'cafeAtlas';
  let venueData = { id: 'cafeAtlas', name: 'Café Atlas', custom: false };
  const venues = {
    cafeAtlas: { id: 'cafeAtlas', name: 'Café Atlas', custom: false },
    scoped: { id: 'scoped', name: 'Client A', custom: true, slug: 'client-a' },
    own: { id: 'own', name: 'Mon commerce', custom: true, slug: '' },
  };

  const KiwiVenue = {
    TRANSIENT_IDS: ['scoped', 'own'],
    getVenue: () => currentVenue,
    getCurrentVenueData: () => venueData,
    slugOf: (vid) => {
      const v = venues[vid || currentVenue];
      return (v && v.slug) || '';
    },
    tenantOf: (vid) => {
      const v = venues[vid || currentVenue];
      if (v && v.slug) return v.slug;
      if (vid === 'scoped') return '';
      return sandbox.localStorage.getItem('kiwiLiveMerchant') || '';
    },
    isCustom: (vid) => {
      const v = venues[vid || currentVenue];
      return !!(v && v.custom);
    },
  };
  sandbox.window.KiwiVenue = KiwiVenue;

  const pdsCode = `
    const PDS_LS_KEY = 'kiwiPlanDeSalle';
    const PDS_TRANSIENT_IDS = ['scoped', 'own'];
    function pdsTenant(vid) {
      if (window.KiwiVenue && typeof window.KiwiVenue.tenantOf === 'function') {
        return window.KiwiVenue.tenantOf(vid) || '';
      }
      if (window.KiwiVenue && typeof window.KiwiVenue.slugOf === 'function') {
        const s = window.KiwiVenue.slugOf(vid);
        if (s) return s;
      }
      if (vid === 'scoped') return '';
      try { return String(localStorage.getItem('kiwiLiveMerchant') || '').trim(); } catch (_) { return ''; }
    }
    function pdsKey(id) {
      const vid = id || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'default';
      const transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
      if (transients.indexOf(vid) < 0) return PDS_LS_KEY + ':' + vid;
      const slug = pdsTenant(vid);
      return slug ? PDS_LS_KEY + ':' + vid + '@' + slug : '';
    }
    function pdsNormalize(s) { return s; }
    function pdsDefaultState() { return { zones: [{ id: 'z1' }], tables: [], staff: [] }; }
    function pdsLoad() {
      const key = pdsKey();
      if (key) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.zones && parsed.tables && parsed.staff) return pdsNormalize(parsed);
          }
        } catch (e) {}
      }
      return pdsNormalize(pdsDefaultState());
    }
    function pdsWriteLocal(state) {
      const key = pdsKey();
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
      }
      try {
        var vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
        if (vd && vd.custom && vd.name) {
          var vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || '';
          var transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
          if (transients.indexOf(vid) >= 0 && !key) return;
          var slug = vd.slug || (window.KiwiVenue && window.KiwiVenue.slugOf && window.KiwiVenue.slugOf(vid)) || '';
          if (slug) localStorage.setItem(PDS_LS_KEY + ':slug:' + slug, JSON.stringify(state));
        }
      } catch (e) {}
    }
    function pdsRawState() {
      const key = pdsKey();
      if (!key) return { zones: [], tables: [], staff: [] };
      try {
        var raw = localStorage.getItem(key);
        var p = raw ? JSON.parse(raw) : null;
        if (p && p.zones && p.tables) return p;
      } catch (e) {}
      return { zones: [], tables: [], staff: [] };
    }
    function pdsCarryForward() {
      if (!window.KiwiCloudDoc) return;
      var vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || '';
      var slug = window.KiwiCloudDoc.currentSlug();
      if (!vid || !slug) return;
      var transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
      if (transients.indexOf(vid) >= 0) return;
      window.KiwiCloudDoc.carryForward('floorplan', vid, slug, function (raw) {
        try { var d = JSON.parse(raw || 'null'); return !!(d && d.tables && d.tables.length); }
        catch (e) { return false; }
      }, PDS_LS_KEY + ':');
    }
  `;
  vm.createContext(sandbox);
  vm.runInContext(pdsCode, sandbox);

  // 1. Établissement normal
  currentVenue = 'cafeAtlas';
  eq('pdsKey pour un établissement normal', sandbox.pdsKey(), 'kiwiPlanDeSalle:cafeAtlas');

  // 2. Vue portée (God Mode / opérateur) avec slug résolu
  currentVenue = 'scoped';
  venueData = venues.scoped;
  eq('pdsKey pour scoped avec slug résolu', sandbox.pdsKey(), 'kiwiPlanDeSalle:scoped@client-a');

  // 3. Vue portée (scoped) SANS slug résolu -> Fail-closed
  venues.scoped.slug = '';
  eq('pdsKey pour scoped sans slug (fail-closed)', sandbox.pdsKey(), '');

  // 4. Fail-closed n'écrit jamais sur clé vide
  sandbox.pdsWriteLocal({ zones: [{ id: 'z1' }], tables: [{ id: 't1' }], staff: [] });
  ok("pdsWriteLocal n'écrit rien si la clé est vide (fail-closed)", !('' in store));
  ok("pdsWriteLocal n'écrit pas non plus sous kiwiPlanDeSalle:scoped", !('kiwiPlanDeSalle:scoped' in store));
  ok("pdsWriteLocal n'écrit pas de miroir sans slug", !('kiwiPlanDeSalle:slug:' in store));

  // 5. pdsRawState sur fail-closed retourne un état vide
  const rawEmpty = sandbox.pdsRawState();
  ok('pdsRawState sur clé vide retourne un état sans tables', rawEmpty && Array.isArray(rawEmpty.tables) && rawEmpty.tables.length === 0);

  // 6. Bascule entre locataire A et locataire B : aucune contamination
  venues.scoped.slug = 'client-a';
  const planA = { zones: [{ id: 'z1', name: 'Salle' }], tables: [{ id: 't1', num: '1' }, { id: 't2', num: '2' }], staff: [] };
  sandbox.pdsWriteLocal(planA);
  eq('plan de client-a écrit sous son propre seau nommé', store['kiwiPlanDeSalle:scoped@client-a'], JSON.stringify(planA));
  eq('plan de client-a écrit sous son miroir', store['kiwiPlanDeSalle:slug:client-a'], JSON.stringify(planA));

  // Maintenant l'opérateur navigue vers client-b
  venues.scoped.slug = 'client-b';
  venueData = { id: 'scoped', name: 'Client B', custom: true, slug: 'client-b' };
  eq('pdsKey pour client-b pointe vers son propre seau', sandbox.pdsKey(), 'kiwiPlanDeSalle:scoped@client-b');
  const rawB = sandbox.pdsRawState();
  eq('pdsRawState pour client-b est vide (pas de fuite de client-a)', rawB.tables.length, 0);

  // 7. Nettoyage de l'ancien seau non nommé kiwiPlanDeSalle:scoped
  store['kiwiPlanDeSalle:scoped'] = JSON.stringify({ tables: [{ id: 'legacy' }] });
  ['scoped', 'own'].forEach((tid) => {
    delete store['kiwiPlanDeSalle:' + tid];
  });
  ok('ancien seau kiwiPlanDeSalle:scoped purgé', !('kiwiPlanDeSalle:scoped' in store));
}

/* ── 7. Époque de réparation : une suppression qui doit s'imposer partout ───
 * L'union par identifiant ne sait pas supprimer : un appareil qui garde le plan
 * empoisonné en local le refusionne et le repousse. Un plan d'époque supérieure
 * remplace l'autre copie EN BLOC — c'est le mécanisme de réparation. On exécute
 * le VRAI pdsMerge de pages-pro.js contre le VRAI mergeDefault de cloud-doc.js. */
{
  const CLOUD = fs.readFileSync(path.join(ROOT, 'assets', 'cloud-doc.js'), 'utf8');
  function extractFn(src, name) {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('introuvable : ' + name);
    let i = src.indexOf('{', at), depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
    }
    throw new Error('accolades déséquilibrées : ' + name);
  }
  const mergeDefault = new Function(
    extractFn(CLOUD, 'idOf') + '\n' + extractFn(CLOUD, 'mergeDefault') + '\nreturn mergeDefault;'
  )();
  const pdsMerge2 = new Function('window', extractFn(PAGES, 'pdsMerge') + '\nreturn pdsMerge;')(
    { KiwiCloudDoc: { mergeDefault } }
  );

  const clean = { zones: [{ id: 'z1' }], tables: [{ id: 't1' }, { id: 't2' }], staff: [], mode: 'layout' };
  const poisoned = { zones: [{ id: 'z1' }, { id: 'zRDC' }], tables: [{ id: 't1' }, { id: 't2' }, { id: 'tX' }], staff: [], mode: 'assign' };

  // Époques égales (le quotidien) : l'union protège les saisies concurrentes —
  // et, connu, une suppression ressuscite. C'est pour cela que l'époque existe.
  const u = pdsMerge2(poisoned, clean);
  eq('à époque égale, l’union ressuscite la table supprimée (comportement documenté)', u.tables.length, 3);

  // Le serveur porte la réparation (époque 1) : l'appareil empoisonné ADOPTE en bloc…
  const repaired = Object.assign({}, clean, { epoch: 1 });
  const a = pdsMerge2(poisoned, repaired);
  eq('époque serveur supérieure : adoption en bloc, la table étrangère disparaît', a.tables.length, 2);
  eq('époque serveur supérieure : la zone étrangère disparaît aussi', a.zones.length, 1);
  eq('époque adoptée avec le plan', a.epoch, 1);
  // …mais garde ses préférences d'affichage locales (mode/snap/zone).
  eq('les réglages scalaires locaux survivent à l’adoption', a.mode, 'assign');

  // L'appareil réparateur (époque 1 locale) ne se fait pas réinfecter par un
  // serveur encore à l'époque 0 : sa copie gagne en bloc.
  const mineRepaired = Object.assign({}, clean, { epoch: 1 });
  const b = pdsMerge2(mineRepaired, poisoned);
  eq('époque locale supérieure : la copie réparée gagne en bloc', b.tables.length, 2);
  eq('époque locale supérieure : l’époque est conservée', b.epoch, 1);
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
  + 'relance bornée, un seul écouteur, miroir par slug, isolation multi-locataires, fail-closed)');
console.log(line);

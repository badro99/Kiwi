#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · « On ne demande pas l'addition pendant qu'il monte sa carte »
 *
 * Le panneau d'activation ne doit s'ouvrir qu'une fois l'installation finie,
 * et pendant l'installation seuls les gestes d'argent restent retenus.
 *
 * Les contrôles EXÉCUTENT le code livré, extrait de ses fichiers.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (c, m) => { if (c) passed++; else { failures.push(m); console.error(`  ✗ ${m}`); } };

console.log('■ Activation : après l’installation, pas pendant');

/* ── 1 · Le verdict n’est pas réinventé ici ──────────────────────────────── */
const meSrc = fs.readFileSync(path.join(ROOT, 'functions/api/me.js'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(ROOT, 'functions/api/config.js'), 'utf8');
ok(/out\.onboarded = true;/.test(meSrc), '/api/me rend déjà le verdict d’installation');
ok(!/onboardingState|onboarding:/.test(cfgSrc),
  '/api/config n’en écrit pas un second : une seule vérité pour une seule question');

/* ── 3 · Les deux listes de gestes, extraites d’entitlements.js ──────────── */
const entSrc = fs.readFileSync(path.join(ROOT, 'assets/entitlements.js'), 'utf8');
const blockedMatch = entSrc.match(/function blockedWord\(el\)\{[\s\S]*?\n  \}/);
const moneyMatch = entSrc.match(/function moneyWord\(el\)\{[\s\S]*?\n  \}/);
let blockedWord = null, moneyWord = null;
if (!blockedMatch) ok(false, 'blockedWord introuvable');
else if (!moneyMatch) ok(false, 'moneyWord introuvable');
else {
  try {
    blockedWord = new Function(blockedMatch[0] + '; return blockedWord;')();
    moneyWord = new Function(moneyMatch[0] + '; return moneyWord;')();
    ok(typeof blockedWord === 'function' && typeof moneyWord === 'function',
      'les deux listes de gestes construites depuis la source livrée');
  } catch (e) { ok(false, 'construction impossible : ' + e.message); }
}

const el = (label) => ({
  closest: () => null,
  hasAttribute: () => false,
  getAttribute: (k) => (k === 'aria-label' ? label : ''),
  textContent: label,
});

if (!blockedWord || !moneyWord) ok(false, 'section 3 interrompue');
else {
  /* Les gestes de l’installation : retenus AVANT, libres MAINTENANT. */
  for (const verb of ['Ajouter un plat', 'Créer une catégorie', 'Enregistrer', 'Modifier la salle', 'Publier la carte']) {
    ok(blockedWord(el(verb)) === true, `« ${verb} » reste tenu une fois installé`);
    ok(moneyWord(el(verb)) === false, `« ${verb} » passe pendant l’installation`);
  }
  /* Les gestes d’argent : tenus dans les deux cas. */
  for (const verb of ['Encaisser', 'Rembourser le client', 'Exporter en CSV']) {
    ok(moneyWord(el(verb)) === true, `« ${verb} » reste tenu pendant l’installation`);
    ok(blockedWord(el(verb)) === true, `« ${verb} » reste tenu une fois installé`);
  }
}

/* ── 4 · Le panneau ne s’ouvre pas tant que l’installation n’est pas finie ── */
const acceptMatch = entSrc.match(/function acceptConfig\(cfg\)\{[\s\S]*?\n  \}/);
const refreshMatch = entSrc.match(/function refreshPill\(\)\{[\s\S]*?\n  \}/);
const identityMatch = entSrc.match(/function confirmIdentity\(state\)\{[\s\S]*?\n  \}/);
ok(!!acceptMatch && !!refreshMatch && !!identityMatch,
  'acceptConfig, refreshPill et confirmIdentity extraits de la source livrée');

if (acceptMatch && refreshMatch && identityMatch) {
  /* On rejoue l'ordre réel : /api/config peut arriver avant OU après /api/me. */
  const run = (cfg, identity, order) => {
    let shown = false;
    const cls = { remove(){}, add(){}, contains(){ return false; } };
    const doc = { documentElement: { classList: cls } };
    const build = new Function('showPill', 'pillRef', 'closePaywall', 'installPrivacy', 'document', `
      var pending=false, onboarded=true, identitySettled=false, pill=pillRef, modal=null, operator=false, privacy=false, wantsPrivacy=false;
      ${refreshMatch[0]}
      ${acceptMatch[0]}
      ${identityMatch[0]}
      return { cfg: acceptConfig, id: confirmIdentity, state: function(){ return { pending: pending, onboarded: onboarded }; } };
    `);
    const api = build(() => { shown = true; }, { remove() {}, focus() {} }, () => {}, () => {}, doc);
    if (order === 'me-first') { api.id(identity); api.cfg(cfg); }
    else { api.cfg(cfg); api.id(identity); }
    return { ...api.state(), shown };
  };
  const pendingCfg = { subscription: { active: false } };
  const payingCfg = { subscription: { active: true } };
  const installing = { authenticated: true, onboarded: false };
  const ready = { authenticated: true, onboarded: true };
  const legacy = { authenticated: true };
  const anon = { authenticated: false };

  for (const order of ['cfg-first', 'me-first']) {
    ok(run(pendingCfg, installing, order).shown === false,
      `en attente ET en cours d’installation : aucun panneau (${order})`);
    ok(run(pendingCfg, ready, order).shown === true,
      `en attente, installation finie : le panneau peut s’ouvrir (${order})`);
    ok(run(payingCfg, ready, order).shown === false,
      `un abonnement actif ne voit jamais le panneau (${order})`);
    ok(run(pendingCfg, legacy, order).shown === true,
      `réponse sans le champ : comportement d’avant, la porte ne s’ouvre pas seule (${order})`);
    ok(run(pendingCfg, anon, order).shown === true,
      `session sans compte : comportement d’avant (${order})`);
  }
  ok(run(pendingCfg, installing, 'me-first').onboarded === false,
    'le verdict d’/api/me est bien celui qui est lu');
  /* Le clignotement : /api/config seul, sans réponse d'identité, ne doit RIEN
     peindre — sinon la pastille apparaît puis disparaît à chaque chargement. */
  ok(run(pendingCfg, installing, 'cfg-first').shown === false,
    'aucune pastille tant que l’identité n’a pas tranché (pas de clignotement)');
}

/* ── 5 · Les écouteurs consultent la même question ───────────────────────── */
ok(/function heldBack\(el\)\{/.test(entSrc), 'une seule question (heldBack) décide pour tous les écouteurs');
ok(/showPaywall\(\)\{\s*\n?\s*if\(operator\|\|!pending\|\|!onboarded\)/.test(entSrc),
  'le panneau lui-même refuse de s’ouvrir pendant l’installation');
ok(/function showPill\(\)\{if\(pill\|\|operator\|\|!pending\|\|!onboarded\)/.test(entSrc),
  'la pastille aussi');

/* ── 6 · Un geste retenu pendant l’installation DIT pourquoi ─────────────── */
ok(/function installToast\(\)\{/.test(entSrc), 'un message existe pour les gestes retenus pendant l’installation');
ok(/if\(onboarded\)showPaywall\(\);else installToast\(\);/.test(entSrc),
  'le clic retenu ouvre le panneau une fois installé, et explique pendant l’installation');
ok((entSrc.match(/else installToast\(\);/g) || []).length >= 2,
  'le clic ET la requête réseau expliquent tous les deux : aucun bouton muet');

/* ── 7 · Le ton ─────────────────────────────────────────────────────────── */
ok(!/Abonnement Kiwi requis/.test(entSrc), 'plus de « Abonnement requis » comme nom du dialogue');
ok(/Tout est en place/.test(entSrc), 'le panneau parle du travail accompli, pas d’un accès manquant');
ok(!/Mode découverte/.test(entSrc), 'la pastille ne classe plus le commerçant en « mode découverte »');

const EXPECTED = 41;
ok(passed === EXPECTED, `compte de contrôles épinglé (${passed}/${EXPECTED})`);
console.log(`\n✓ ${passed} contrôles verts (${failures.length} échec(s))`);
if (failures.length) process.exit(1);

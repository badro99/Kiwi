#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE PANNEAU D'ACTIVATION (assets/entitlements.{js,css})
 *
 * C'est le premier écran d'un commerçant dont l'abonnement n'est pas encore
 * validé, et il doit pouvoir s'en aller : « Continuer à explorer » est ce qui
 * rend le tableau de bord visitable en attendant.
 *
 * Il ne s'en allait pas. `modal.hidden = true` posait l'attribut, mais
 * `.kiwi-entitlement-layer{display:grid}` bat le `[hidden]{display:none}` de la
 * feuille du navigateur : le panneau restait peint par-dessus tout, sans une
 * erreur en console ni une requête en échec. Le clic partait, il n'avait
 * simplement aucun effet. Cette suite existe pour que ce silence-là ne
 * recommence pas — c'est la classe de bug la plus chère du dépôt : la page
 * répond 200, la console est vide, et le correctif n'apparaît pas.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else { failures.push(msg); console.error(`  ✗ ${msg}`); } };

console.log('■ Panneau d’activation (entitlements)');

const js = fs.readFileSync(path.join(ROOT, 'assets/entitlements.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/entitlements.css'), 'utf8');

/* 1. LA FERMETURE — la règle qui a coûté la session. */
ok(/\.kiwi-entitlement-layer\.is-off\s*,\s*\.kiwi-entitlement-layer\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css),
  'la feuille déclare elle-même l’état fermé (classe ET attribut), au lieu de compter sur celle du navigateur');
ok(/classList\.add\('is-off'\)/.test(js) && /classList\.remove\('is-off'\)/.test(js),
  'le script ferme et rouvre par cette classe');
/* La garde : `display:grid` doit être déclaré AVANT la règle de fermeture,
   sinon la fermeture perd à égalité de spécificité. Le `!important` la protège
   aussi, mais l'ordre est ce qui doit rester vrai si quelqu'un le retire. */
ok(css.indexOf('.kiwi-entitlement-layer{position:fixed') < css.indexOf('.kiwi-entitlement-layer.is-off'),
  'la règle de fermeture est déclarée après la règle qui la contredirait');

/* 2. TROIS SORTIES — un panneau dont on doute se referme par tous les moyens. */
ok(/kiwi-entitlement-x/.test(js) && /kiwi-entitlement-x/.test(css), 'une croix, visible avant même de lire les boutons');
ok(/e\.key\s*===\s*'Escape'/.test(js), 'la touche Échap ferme');
ok(/if\(e\.target===modal\)closePaywall\(\)/.test(js), 'un clic sur le fond ferme');
ok(/'mousedown'/.test(js) && !/modal\.addEventListener\('click',function\(e\)\{if\(e\.target===modal\)/.test(js),
  'le fond ferme sur mousedown : un glissé qui finit sur le fond ne doit pas fermer');
ok(/later\.onclick=function\(\)\{closePaywall\(\);\}/.test(js), '« Continuer à explorer » appelle la même fermeture que la croix');

/* 3. LE RYTHME — fermer signifie « pas maintenant », pas « redemandez-moi au
      prochain clic ». Le délai survit aux navigations, mais la pastille permet
      toujours une réouverture volontaire. */
ok(/PAYWALL_COOLDOWN_MS=10\*60\*1000/.test(js), 'le grand panneau est limité à une apparition toutes les dix minutes');
ok(/localStorage\.setItem\(PAYWALL_COOLDOWN_KEY,String\(Date\.now\(\)\+PAYWALL_COOLDOWN_MS\)\)/.test(js),
  'la fermeture mémorise le délai au-delà de la page courante');
ok(/if\(!force&&paywallCoolingDown\(\)\)return false;/.test(js),
  'les clics protégés restent refusés sans rouvrir le panneau pendant le délai');
ok(/pill\.onclick=function\(\)\{showPaywall\(true\);\}/.test(js),
  'la petite pastille peut rouvrir volontairement le panneau pendant le délai');
ok(/cta\.onclick=function\(\)\{closePaywall\(\);\}/.test(js),
  'partir vers WhatsApp déclenche aussi le délai au retour');

const cooldownSource = js.match(/var PAYWALL_COOLDOWN_MS=[\s\S]*?function paywallCoolingDown\(\)\{[\s\S]*?\n  \}/)?.[0];
if (!cooldownSource) ok(false, 'les fonctions de délai sont exécutables depuis la source livrée');
else {
  let now = 1_000_000;
  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, String(value)); },
    getItem(key) { return values.get(key) || null; },
    removeItem(key) { values.delete(key); },
  };
  const timing = new Function('window', 'Date', `${cooldownSource}; return { snoozePaywall, paywallCoolingDown };`)(
    { localStorage: storage }, { now: () => now },
  );
  ok(timing.paywallCoolingDown() === false, 'aucun délai fantôme avant la première fermeture');
  timing.snoozePaywall();
  now += (10 * 60 * 1000) - 1;
  ok(timing.paywallCoolingDown() === true, 'le panneau reste en veille jusqu’à la dernière milliseconde');
  now += 1;
  ok(timing.paywallCoolingDown() === false && values.size === 0,
    'le panneau redevient disponible après exactement dix minutes et nettoie le délai expiré');
}

/* 4. CLAVIER — le panneau recouvre le tableau de bord : tabuler hors de lui,
      c'est tabuler dans le vide. */
ok(/e\.key!=='Tab'/.test(js) && /shiftKey/.test(js), 'le focus est piégé dans le panneau tant qu’il est ouvert');
ok(/focus\(\{preventScroll:true\}\)/.test(js),
  'le focus initial ne fait pas défiler la carte (le titre passait au-dessus du cadre)');
ok(/card\.tabIndex=-1/.test(js) && /kiwi-entitlement-card'\)\.focus/.test(js),
  'le focus va sur la carte, pas sur un bouton — l’anneau ne désigne pas la sortie comme action principale');

/* 5. LE VOCABULAIRE DU CLIENT — « God Mode » est notre mot d'atelier ; il a été
      affiché tel quel au commerçant. On lit les CHAÎNES, pas les commentaires :
      le mot doit rester dicible dans le code qui explique pourquoi il en sort. */
const strings = js.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/God\s*Mode/i.test(strings), 'aucun jargon interne dans un écran que le commerçant lit');

/* 6. AUTONOME — il s'injecte dans trois surfaces et ne peut pas parier sur
      le reset de la page hôte. */
ok(/\.kiwi-entitlement-layer\s*,\s*\.kiwi-entitlement-layer \*\{box-sizing:border-box\}/.test(css),
  'le panneau pose son propre box-sizing (sans quoi le bouton pleine largeur déborde sur mobile)');
ok(/@media\(max-width:640px\)/.test(css) && /flex-direction:column-reverse/.test(css),
  'sur mobile les actions s’empilent, l’action principale au plus près du pouce');
ok(/@media\(prefers-reduced-motion:reduce\)/.test(css) && /animation:none/.test(css),
  'les animations se coupent quand le système le demande');

/* 7. CE QUI NE DOIT PAS CHANGER — le panneau ne s'ouvre jamais pour un
      opérateur ni pour un compte à jour. */
/* La garde peut S'AJOUTER des raisons de refuser (l'installation en cours en
   est une), jamais en perdre : on exige que `operator` et `!pending` restent
   en tête et que le refus soit un `return true`, tout en laissant passer les
   conditions supplémentaires. Épingler la chaîne exacte faisait tomber la
   suite sur un durcissement de la garde — un refus de PLUS lu comme une
   régression. */
ok(/function showPaywall\(force\)\{\s*if\(operator\|\|!pending(\|\|[^)]+)?\)return true;/.test(js),
  'ni l’opérateur ni un abonnement actif ne voient le panneau');
ok(/function showPaywall\(force\)\{\s*if\(operator\|\|!pending\|\|!onboarded\)return true;/.test(js),
  'et le panneau reste fermé tant que l’installation n’est pas finie');

console.log(`\n✓ ${passed} controls green (${failures.length} failure(s))`);
if (failures.length) process.exit(1);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES PAGES PUBLIQUES CHARGENT-ELLES CE QU'ELLES DEMANDENT ?
 * ---------------------------------------------------------------------------
 * Une page allow-listée dans functions/_middleware.js répond 200 à un inconnu.
 * Ses SCRIPTS, eux, sont des requêtes séparées — et si le chemin qui les porte
 * n'est pas allow-listé, chacune reçoit l'écran de connexion à la place du
 * JavaScript. La page s'affiche quand même, en moins bien : le navigateur
 * essaie de lire du HTML comme du JS, `window.lucide` reste undefined, les
 * icônes ne se dessinent jamais.
 *
 * C'est exactement ce qui tournait en production : kiwi-order.html répondait
 * 200, ses deux scripts 401, et le client qui scannait un QR voyait vingt-deux
 * carrés vides. Rien ne le signalait — la page, elle, allait bien.
 *
 * Ce garde-fou relit les deux fichiers ensemble : pour chaque page publique, il
 * exige que tout ce qu'elle référence soit publiquement atteignable par les
 * mêmes règles. Il ne teste pas le réseau ; il teste l'accord entre la page et
 * la porte, ce qui est le vrai endroit où ça a divergé.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MW = fs.readFileSync(path.join(ROOT, 'functions', '_middleware.js'), 'utf8');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }

/* ── ce que la porte laisse passer en lecture ────────────────────────────────
 * On lit les règles telles qu'elles sont écrites, plutôt que d'en tenir une
 * copie ici : une liste recopiée finit toujours par mentir sur l'originale. */
const exact = new Set();
const prefixes = [];
MW.split('\n').forEach((line) => {
  if (!/return next\(\);/.test(line) || !/isRead/.test(line)) return;
  for (const m of line.matchAll(/path === '([^']+)'/g)) exact.add(m[1]);
  for (const m of line.matchAll(/path\.startsWith\('([^']+)'\)/g)) prefixes.push(m[1]);
});

ok('les règles de lecture publiques ont été trouvées dans _middleware.js',
  exact.size > 0 || prefixes.length > 0);

function publiclyReadable(p) {
  if (exact.has(p)) return true;
  return prefixes.some((pre) => p.startsWith(pre));
}

/* ── les pages publiques, et ce qu'elles chargent ────────────────────────── */
const PAGES = [...exact].filter((p) => p.endsWith('.html'));
let localRefs = 0;
ok('au moins une page publique est allow-listée', PAGES.length > 0);

PAGES.forEach((page) => {
  const file = path.join(ROOT, page.replace(/^\//, ''));
  if (!fs.existsSync(file)) {
    fails.push(`${page} est allow-listée mais le fichier n'existe pas`);
    return;
  }
  const html = fs.readFileSync(file, 'utf8');

  /* src="..." et href="..." qui pointent vers un fichier du dépôt. On laisse de
   * côté les URL absolues (les polices Google), les data:, les ancres, et tout
   * ce qui vient d'un gabarit JS (`${...}`) — celui-là ne se résout pas ici. */
  const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const raw = m[1];
    if (!raw || /^(https?:|data:|mailto:|tel:|#|\/\/)/.test(raw)) continue;
    if (raw.includes('${')) continue;
    refs.add('/' + raw.replace(/^\.?\//, '').split(/[?#]/)[0]);
  }

  /* Une page publique peut légitimement ne rien charger : reset.html est
   * autonome exprès, parce qu'elle doit s'afficher pour quelqu'un qui, par
   * définition, ne peut pas franchir la porte. On n'exige donc rien ici — on
   * exige seulement que ce qui EST référencé soit joignable. */
  localRefs += refs.size;

  refs.forEach((ref) => {
    ok(`${page} → ${ref} est joignable sans session`, publiclyReadable(ref));
  });
});

ok('l\'extracteur de références trouve bien des fichiers locaux', localRefs > 0);

/* ── la porte ne s'ouvre pas trop grand ──────────────────────────────────────
 * Le correctif ouvre /assets/ ; il ne doit jamais ouvrir /api/ en préfixe, ni
 * la racine. Un préfixe trop large ici rendrait tout le reste décoratif. */
prefixes.forEach((pre) => {
  ok(`préfixe public « ${pre} » assez étroit`, pre !== '/' && pre !== '/api/');
});
ok('/api/config reste privé', !publiclyReadable('/api/config'));
ok('/api/order/queue reste privé', !publiclyReadable('/api/order/queue'));
ok('/api/channel/keys reste privé', !publiclyReadable('/api/channel/keys'));
ok('/dashboard.html reste privé', !publiclyReadable('/dashboard.html'));
ok('/kiwi-admin.html reste privé', !publiclyReadable('/kiwi-admin.html'));
ok('/kiwi-caisse.html reste privé', !publiclyReadable('/kiwi-caisse.html'));

/* ── et les fichiers ouverts ne portent pas de secret ────────────────────────
 * /assets ne contient que du statique. On vérifie qu'aucun n'embarque de clé
 * en clair — c'est la contrepartie de les avoir ouverts. */
const assetsDir = path.join(ROOT, 'assets');
const SECRET = /(?:AUTH_SECRET|SITE_PASSWORD|api[_-]?key|secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i;
let scanned = 0;
if (fs.existsSync(assetsDir)) {
  fs.readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f)).forEach((f) => {
    scanned++;
    const body = fs.readFileSync(path.join(assetsDir, f), 'utf8');
    if (SECRET.test(body)) fails.push(`assets/${f} contient une chaîne en forme de secret`);
    else pass++;
  });
}
ok('des fichiers assets ont bien été relus', scanned > 10);

if (fails.length) {
  console.log(`\n  ✗ pages publiques — ${fails.length} échec(s) sur ${pass + fails.length}`);
  fails.forEach((f) => console.log(`     · ${f}`));
  process.exit(1);
}
console.log(`  ✓ pages publiques (${pass} contrôles : scripts joignables, porte étroite, aucun secret ouvert)`);

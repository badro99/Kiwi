#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · porte d'entrée du stock inter-établissements.
 *
 *   node tools/stock-lookup-test.js
 *
 * /api/stock/lookup répond « voici le stock d'un magasin qui n'est pas celui
 * d'où vous appelez ». C'est, par construction, le seul endpoint de Kiwi qui
 * franchit volontairement la frontière entre deux boutiques. Une erreur de
 * tenancy ici ne se voit pas à l'écran — elle se voit quand un concurrent lit
 * l'inventaire du voisin.
 *
 * `node --check` prouve que le fichier parse. Ceci prouve ce qui compte :
 *
 *   1. IDENTITÉ   caisse appairée / session du compte / opérateur / anonyme
 *   2. FRONTIÈRE  un compte ne voit JAMAIS le magasin d'un autre compte
 *   3. RECHERCHE  code-barres exact, équivalence GTIN, texte sans accents
 *   4. SILENCE    un magasin sans inventaire répond « je ne sais pas »,
 *                 jamais « zéro »
 *
 * Les cookies sont VRAIS — signés avec les mêmes fonctions que la production
 * (auth/_lib.js). Un test qui forgerait ses propres jetons ne testerait que
 * lui-même.
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  makeSession, sessionCookie, tillToken, TILL_COOKIE,
  operatorToken, OP_COOKIE, SESS_COOKIE,
  operatorIdToken, OPID_COOKIE,
} from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/stock/lookup.js';

const SECRET = 'test-secret-not-a-real-key';

let pass = 0; const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(label + (detail ? ' — ' + detail : ''));
}

/* ── Le monde ───────────────────────────────────────────────────────────────
 * Deux comptes. Le premier a deux boutiques, le second une seule — c'est celle
 * qui ne doit JAMAIS apparaître dans une réponse destinée au premier. */
const ACC_A = 'acc-alpha';
const ACC_B = 'acc-beta';

const catalogue = (products, variants) => JSON.stringify({ v: 1, products, variants, categories: [], seq: 1 });

const DB_ROWS = {
  merchant_config: [
    { merchant: 'atlas-casa', name: 'Atlas Casa', type: 'boutique', account_id: ACC_A },
    { merchant: 'atlas-marrakech', name: 'Atlas Marrakech', type: 'boutique', account_id: ACC_A },
    { merchant: 'chez-rival', name: 'Chez Rival', type: 'boutique', account_id: ACC_B },
    // Enregistré au compte A mais sans inventaire en base : le cas « je ne sais pas ».
    { merchant: 'atlas-tanger', name: 'Atlas Tanger', type: 'boutique', account_id: ACC_A },
  ],
  accounts: { [ACC_A]: { business: 'Atlas Casa' }, [ACC_B]: { business: 'Chez Rival' } },
  // God mode exige désormais une identité NOMMÉE et VIVANTE (auth/_lib.js →
  // namedOperatorId) : le cookie partagé ne suffit plus, la ligne doit exister.
  operators: ['op-badr'],
  catalogs: {
    'atlas-casa': catalogue(
      [{ id: 'p1', name: 'Chemise lin', priceMAD: 249, cost: 90, archived: false, art: 'CHM-1' }],
      [{ id: 'v1', productId: 'p1', size: '38', colorLabel: 'Bleu', stock: 2, barcodes: [{ code: '036000291452', primary: true }] }]
    ),
    'atlas-marrakech': catalogue(
      [{ id: 'p9', name: 'Chemise lin', priceMAD: 249, cost: 90, archived: false, art: 'CHM-1' },
       { id: 'p8', name: 'Écharpe brodée', priceMAD: 120, cost: 40, archived: false, art: '' }],
      [// même article, même code — mais écrit sans le zéro de tête par l'autre douchette
       { id: 'v9', productId: 'p9', size: '40', colorLabel: 'Bleu', stock: 3, barcodes: [{ code: '0036000291452', primary: true }] },
       { id: 'v10', productId: 'p9', size: '42', colorLabel: 'Bleu', stock: 1, barcodes: [] },
       { id: 'v8', productId: 'p8', size: 'U', colorLabel: 'Or', stock: 7, barcodes: [] }]
    ),
    'chez-rival': catalogue(
      [{ id: 'r1', name: 'Chemise lin', priceMAD: 199, cost: 70, archived: false, art: '' }],
      [{ id: 'rv1', productId: 'r1', size: '40', colorLabel: 'Bleu', stock: 99, barcodes: [{ code: '036000291452', primary: true }] }]
    ),
  },
};

/* Un D1 de poche : juste assez pour les trois requêtes que le code émet. */
function makeEnv() {
  return {
    AUTH_SECRET: SECRET,
    DB: {
      prepare(sql) {
        const q = sql.replace(/\s+/g, ' ').trim();
        let args = [];
        const api = {
          bind(...a) { args = a; return api; },
          async first() {
            if (q.startsWith('SELECT account_id FROM merchant_config')) {
              const r = DB_ROWS.merchant_config.find((x) => x.merchant === args[0]);
              return r ? { account_id: r.account_id } : null;
            }
            if (q.startsWith('SELECT business FROM accounts')) {
              return DB_ROWS.accounts[args[0]] || null;
            }
            if (q.startsWith('SELECT id FROM operators')) {
              return DB_ROWS.operators.includes(args[0]) ? { id: args[0] } : null;
            }
            if (q.startsWith('SELECT data FROM catalogs')) {
              const d = DB_ROWS.catalogs[args[0]];
              return d ? { data: d } : null;
            }
            throw new Error('unexpected first(): ' + q);
          },
          async all() {
            if (q.startsWith('SELECT merchant, name, type FROM merchant_config')) {
              return { results: DB_ROWS.merchant_config.filter((x) => x.account_id === args[0]) };
            }
            throw new Error('unexpected all(): ' + q);
          },
        };
        return api;
      },
    },
  };
}

const req = (qs, cookie) => new Request('https://kiwi.test/api/stock/lookup?' + qs, {
  headers: cookie ? { Cookie: cookie } : {},
});

async function call(qs, cookie) {
  const res = await onRequestGet({ request: req(qs, cookie), env: makeEnv() });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

const byName = (r, n) => (r.body.stores || []).find((s) => s.name === n || s.merchant === n);

(async function run() {
  const sessA = sessionCookie(await makeSession(ACC_A, SECRET)).split(';')[0];
  const sessB = sessionCookie(await makeSession(ACC_B, SECRET)).split(';')[0];
  const tillCasa = TILL_COOKIE + '=' + await tillToken(SECRET, 'atlas-casa');
  // Les DEUX cookies : le jeton opérateur partagé et l'identité signée.
  const opShared = OP_COOKIE + '=' + await operatorToken(SECRET);
  const opCookie = opShared + '; ' + OPID_COOKIE + '=' + await operatorIdToken(SECRET, 'op-badr');
  // Même jeton partagé, identité valide — mais la ligne a été supprimée.
  const opRevoked = opShared + '; ' + OPID_COOKIE + '=' + await operatorIdToken(SECRET, 'op-parti');

  /* ── 1 · IDENTITÉ ─────────────────────────────────────────────────────── */

  let r = await call('from=atlas-casa&code=036000291452', '');
  ok('anonyme refusé', r.status === 403, 'status ' + r.status);

  r = await call('from=atlas-casa&code=036000291452', SESS_COOKIE + '=forge.forge');
  ok('cookie de session forgé refusé', r.status === 403, 'status ' + r.status);

  r = await call('from=atlas-casa&code=036000291452', TILL_COOKIE + '=' + 'f'.repeat(64));
  ok('cookie de caisse forgé refusé', r.status === 403, 'status ' + r.status);

  // Une caisse appairée sur Casa ne peut pas se déclarer caisse de Marrakech :
  // le jeton est un HMAC du slug, il ne vaut que pour le sien.
  r = await call('from=atlas-marrakech&code=036000291452', tillCasa);
  ok('caisse de Casa ne se fait pas passer pour Marrakech', r.status === 403, 'status ' + r.status);

  r = await call('from=atlas-casa&code=036000291452', tillCasa);
  ok('caisse appairée acceptée', r.status === 200, 'status ' + r.status);
  const tillStores = r.status === 200 ? (r.body.stores || []) : [];

  r = await call('from=atlas-casa&code=036000291452', sessA);
  ok('session du propriétaire acceptée', r.status === 200, 'status ' + r.status);
  const sessStores = r.status === 200 ? (r.body.stores || []) : [];

  ok('caisse et session voient la même chose',
    JSON.stringify(tillStores) === JSON.stringify(sessStores));

  r = await call('from=atlas-casa&code=036000291452', opCookie);
  ok('opérateur (God mode) accepté', r.status === 200, 'status ' + r.status);

  r = await call('code=036000291452', opCookie);
  ok('opérateur sans magasin désigné refusé', r.status === 403,
    'un opérateur qui ne dit pas quel client il consulte ne doit rien recevoir');

  r = await call('from=atlas-casa&code=036000291452', opShared);
  ok('jeton opérateur partagé SEUL refusé', r.status === 403,
    'le cookie kiwi_op est le même pour tout le monde : il ne prouve personne');

  r = await call('from=atlas-casa&code=036000291452', opRevoked);
  ok('opérateur révoqué refusé', r.status === 403,
    'identité signée mais ligne supprimée — la révocation doit mordre ici aussi');

  /* ── 2 · FRONTIÈRE ────────────────────────────────────────────────────── */

  r = await call('from=atlas-casa&code=036000291452', sessA);
  ok('les deux boutiques du compte A sont là',
    !!byName(r, 'Atlas Casa') && !!byName(r, 'Atlas Marrakech'));
  ok('le magasin du compte B est absent', !byName(r, 'Chez Rival'),
    'FUITE : l\'inventaire d\'un autre compte est sorti');

  // Le compte B porte le MÊME code-barres, avec 99 pièces. S'il apparaissait
  // quelque part, ce serait ici.
  const leaked = JSON.stringify(r.body).includes('99');
  ok('aucun chiffre du compte B ne transparaît', !leaked);

  r = await call('from=chez-rival&code=036000291452', sessA);
  ok('A ne peut pas viser le magasin de B comme origine',
    !byName(r, 'Chez Rival') || (byName(r, 'Chez Rival').hits || []).length === 0,
    'un `from` étranger ne doit pas ouvrir le magasin visé');

  r = await call('from=chez-rival&code=036000291452', sessB);
  ok('B voit son propre magasin', r.status === 200 && !!byName(r, 'Chez Rival'));
  ok('B ne voit pas les magasins de A',
    !byName(r, 'Atlas Casa') && !byName(r, 'Atlas Marrakech'));

  /* ── 3 · RECHERCHE ────────────────────────────────────────────────────── */

  r = await call('from=atlas-casa&code=036000291452', sessA);
  const casa = byName(r, 'Atlas Casa');
  const mrk = byName(r, 'Atlas Marrakech');
  ok('le magasin d\'origine est marqué self', casa && casa.self === true);
  ok('les autres ne le sont pas', mrk && mrk.self === false);
  ok('code exact trouvé sur place', casa && casa.hits.length === 1 && casa.hits[0].stock === 2);
  ok('équivalence GTIN : le zéro de tête ne casse pas la correspondance',
    mrk && mrk.hits.length === 1 && mrk.hits[0].stock === 3,
    'attendu 3 à Marrakech, reçu ' + JSON.stringify(mrk && mrk.hits));
  ok('la taille scannée est rapportée', mrk && mrk.hits[0].size === '40');
  ok('le total toutes tailles est rapporté', mrk && mrk.hits[0].total === 4,
    '3 en 40 + 1 en 42 = 4, reçu ' + (mrk && mrk.hits[0].total));

  // Le prix de vente est utile au vendeur ; le coût d'achat est la marge du
  // magasin et n'a rien à faire dans un autre onglet.
  ok('le prix de vente est rapporté', mrk && mrk.hits[0].price === 249);
  ok('le coût d\'achat ne sort jamais', !JSON.stringify(r.body).includes('"cost"')
    && !JSON.stringify(r.body).includes('90,'));
  ok('les codes-barres ne sortent jamais', !JSON.stringify(r.body).includes('barcode'));

  // Un code au chiffre-clé invalide n'est PAS un GTIN : il ne doit jamais être
  // rapproché d'un autre par troncature des zéros.
  r = await call('from=atlas-casa&code=0012', sessA);
  ok('une référence interne opaque ne matche pas par équivalence',
    (byName(r, 'Atlas Marrakech') || {}).hits.length === 0);

  r = await call('from=atlas-casa&q=echarpe', sessA);
  ok('recherche texte sans accents trouve « Écharpe »',
    (byName(r, 'Atlas Marrakech') || {}).hits.some((h) => h.product === 'Écharpe brodée'));
  ok('recherche texte donne le détail par taille',
    ((byName(r, 'Atlas Marrakech') || {}).hits.find((h) => h.product === 'Écharpe brodée') || {}).sizes.length === 1);

  r = await call('from=atlas-casa&q=x', sessA);
  ok('une requête d\'un seul caractère est refusée', r.status === 400);

  r = await call('from=atlas-casa', sessA);
  ok('ni code ni requête → 400', r.status === 400);

  /* ── 4 · SILENCE ──────────────────────────────────────────────────────── */

  r = await call('from=atlas-casa&code=036000291452', sessA);
  const tanger = byName(r, 'Atlas Tanger');
  ok('un magasin sans inventaire est listé', !!tanger);
  ok('…et se déclare INCONNU, pas vide', tanger && tanger.known === false,
    '« 0 en stock » serait un mensonge : on ne sait pas');
  ok('…et ne rapporte aucun article', tanger && tanger.hits.length === 0);

  const known = byName(r, 'Atlas Marrakech');
  ok('un magasin avec inventaire se déclare connu', known && known.known === true);

  /* ── verdict ──────────────────────────────────────────────────────────── */
  console.log('');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log(`\n✗ stock-lookup: ${pass} ok, ${fails.length} échec(s)\n`);
    process.exit(1);
  }
  console.log(`  ✓ stock inter-établissements (${pass} contrôles : identité, frontière, recherche, silence)\n`);
})().catch((e) => { console.log('  ✗ ' + (e && e.stack || e)); process.exit(1); });

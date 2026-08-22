#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Menu translation test — « Traduire la carte » : route AI, validation
 * des identifiants et prix, préservation de structure, handler workspace.
 *
 *   node tools/menu-translate-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failures.push(msg); console.log(`  ✗ ${msg}`); }
}

console.log('■ Menu translate test (tools/menu-translate-test.mjs)');

const transSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/menu-translate.js'), 'utf8');
const wsSrc = fs.readFileSync(path.join(ROOT, 'assets/restaurant-menu-workspace.js'), 'utf8');
const quotaSrc = fs.readFileSync(path.join(ROOT, 'functions/api/ai/_quota.js'), 'utf8');

/* Fonctions exportées au niveau module */
function extractFn(src, name) {
  const m = src.match(new RegExp('export function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('cannot extract ' + name);
  return m[0].replace(/^export /, '');
}

// ── 1. Validation de la traduction ──────────────────────────────────────────
const validateTranslation = new Function(extractFn(transSrc, 'validateTranslation') + '; return validateTranslation;')();

const original = {
  cats: [
    { id: 'cat-1', name: 'Hot Drinks', sub: [{ id: 'sub-1', name: 'Classics' }] },
    { id: 'cat-2', name: 'Sweets', sub: [] }
  ],
  items: [
    { id: 'it-1', name: 'Salted Caramel Latte', catId: 'cat-1', subId: 'sub-1', price: 42, desc: 'Delicious latte with salted caramel' },
    { id: 'it-2', name: 'Cheesecake', catId: 'cat-2', price: 35, desc: 'Fresh cheesecake' }
  ],
  opts: [
    { id: 'opt-1', name: 'Choice of milk', choices: [{ id: 'ch-1', name: 'Oat milk' }, { id: 'ch-2', name: 'Almond milk' }] }
  ]
};

const rawAiOutput = {
  cats: [
    { id: 'cat-1', name: 'Boissons chaudes', sub: [{ id: 'sub-1', name: 'Classiques' }] },
    { id: 'cat-2', name: 'Desserts & Douceurs' }
  ],
  items: [
    { id: 'it-1', name: 'Latte Caramel Beurre Salé', desc: 'Délicieux latte au caramel au beurre salé' },
    { id: 'it-2', name: 'Cheesecake', desc: 'Cheesecake frais' }
  ],
  opts: [
    { id: 'opt-1', name: 'Choix du lait', choices: [{ id: 'ch-1', name: 'Lait d’avoine' }, { id: 'ch-2', name: 'Lait d’amande' }] }
  ]
};

const res = validateTranslation(rawAiOutput, original);
ok(res !== null, 'la validation produit un objet non nul');
ok(res.cats[0].id === 'cat-1' && res.cats[0].name === 'Boissons chaudes', 'catégorie traduite avec son id conservé');
ok(res.cats[0].sub[0].id === 'sub-1' && res.cats[0].sub[0].name === 'Classiques', 'sous-catégorie traduite avec son id conservé');
ok(res.items[0].id === 'it-1' && res.items[0].name === 'Latte Caramel Beurre Salé' && res.items[0].price === 42, 'article traduit, prix 42 MAD préservé');
ok(res.opts[0].id === 'opt-1' && res.opts[0].name === 'Choix du lait' && res.opts[0].choices[0].name === 'Lait d’avoine', 'groupe d’options et choix traduits');

// ── 2. Tolérance aux données incomplètes du modèle ─────────────────────────
const fallbackRes = validateTranslation({}, original);
ok(fallbackRes && fallbackRes.cats[0].name === 'Hot Drinks' && fallbackRes.items[0].name === 'Salted Caramel Latte', 'en cas de réponse partielle, les noms originaux sont conservés');

// ── 3. Quota et sécurité ────────────────────────────────────────────────────
ok(/quotaOk\(env,\s*who,\s*'menutranslate',\s*DAILY_CAP\)/.test(transSrc), 'quota kind "menutranslate"');
ok(/menutranslate:\s*60/.test(quotaSrc), '_quota.js déclare le plafond menutranslate');
ok(/tenantFor\(request,\s*env,\s*body\.merchant\)/.test(transSrc), 'authentification tenant obligatoire');

// ── 4. Intégration Workspace ────────────────────────────────────────────────
/* v2 : plus de bouton qui écrase la carte — l'onglet « Traductions » et la
   traduction automatique des manquants (tools/menu-i18n-test.mjs). */
ok(/data-action="rmw-i18n-fill"/.test(wsSrc), 'action « Traduire ce qui manque » présente dans le workspace');
ok(!/data-action="rmw-menu-translate" style="display:none;"/.test(wsSrc), 'plus de bouton caché « Traduire la carte »');
ok(/H\['rmw-menu-translate'\]/.test(wsSrc), 'handler rmw-menu-translate branché dans wire()');

console.log(`\n✓ ${passed} controls green`);

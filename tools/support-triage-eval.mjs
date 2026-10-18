// tools/support-triage-eval.mjs
//
// Mesure combien Clef (@cf/cloudflare/clef-flash) se trompe sur des demandes de
// support SYNTHÉTIQUES (français, arabe, darija en lettres latines, anglais), avec
// les mêmes questions et la même lecture que la production
// (functions/api/_support-triage.js : buildTriageRequest, readTriageAnswers).
//
// Aucune donnée de commerçant ici : chaque texte est inventé pour l'évaluation.
//
//   node tools/support-triage-eval.mjs --dry     sans réseau : valide le jeu et le calcul
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node tools/support-triage-eval.mjs
//
// Appelle POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/cloudflare/clef-flash
// Le jeton ne s'affiche jamais, ni dans un message ni dans une erreur. Un tri
// coûte environ 0,038 $ par million de jetons d'entrée : les ~30 demandes
// ci-dessous pèsent quelques centimes.
//
// Options : --dry  --model clef|clef-flash|clef-omni  --lang fr|ar|darija|en  --limit N  --concurrency N  --show-errors
// Code de sortie 0 si le rappel d'alerte >= 0,9 et les fausses alertes <= 0,2
// (les seuils de la production, ALERT_AT = 0,5), sinon 1 ; 2 si les variables manquent.
import { pathToFileURL } from 'node:url';
import {
  ALERT_AT, CATEGORY_IDS, CONFIDENT_AT, TRIAGE_MODEL, URGENCY_LEVELS,
  buildTriageRequest, readTriageAnswers,
} from '../functions/api/_support-triage.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
/* --model clef | clef-flash | clef-omni : le modèle mesuré (par défaut, celui de la production). */
const MODEL = opt('model', TRIAGE_MODEL.split('/').pop());

/* expect.urgency : 0 peut attendre, 1 aujourd'hui, 2 maintenant (caisse ou ventes
 * bloquées, ou argent en jeu : double débit, par exemple).
 * expect.blocked : le commerçant ne peut plus vendre à cet instant.
 * Une alerte est attendue si urgency === 2 ou blocked. */
const T = (id, lang, text, category, urgency, blocked = false) => ({ id, lang, text, expect: { category, urgency, blocked } });
export const DATASET = [
  // Français
  T('fr-01', 'fr', 'la caisse ne s\'ouvre plus, impossible d\'encaisser, j\'ai des clients qui attendent', 'caisse', 2, true),
  T('fr-02', 'fr', 'L\'imprimante de la cuisine n\'imprime plus les bons depuis ce matin', 'impression', 1),
  T('fr-03', 'fr', 'Un client a été débité deux fois sur le TPE, comment le rembourser ?', 'paiement', 2),
  T('fr-04', 'fr', 'Comment changer le prix d\'un plat ?', 'menu_stock', 0),
  T('fr-05', 'fr', 'J\'ai oublié mon mot de passe, je n\'arrive plus à me connecter au tableau de bord', 'compte', 1),
  T('fr-06', 'fr', 'Mon employé n\'arrive pas à ouvrir la caisse, le code PIN est refusé et le service commence', 'compte', 2, true),
  T('fr-07', 'fr', 'Pouvez-vous ajouter une option pour imprimer le logo du restaurant sur le ticket ?', 'impression', 0),
  T('fr-08', 'fr', 'Le stock de farine est faux depuis l\'inventaire d\'hier', 'menu_stock', 1),
  T('fr-09', 'fr', 'La caisse est complètement figée sur l\'écran de démarrage, rien ne répond', 'caisse', 2, true),
  T('fr-10', 'fr', 'La tablette de la salle met parfois du temps à envoyer les commandes à la caisse', 'caisse', 1),
  T('fr-11', 'fr', 'Bonjour, je voudrais savoir comment exporter mes ventes du mois en PDF', 'autre', 0),
  T('fr-12', 'fr', 'Le total de la journée ne correspond pas à l\'argent du tiroir, il manque 300 dirhams', 'paiement', 1),
  // Anglais
  T('en-01', 'en', 'The register crashed and will not restart, we cannot take any orders right now', 'caisse', 2, true),
  T('en-02', 'en', 'How do I add a new category to the menu?', 'menu_stock', 0),
  T('en-03', 'en', 'My receipt printer keeps going offline, the bluetooth connection drops every hour', 'impression', 1),
  T('en-04', 'en', 'I cannot log in, it says the account is suspended and I have customers at the counter', 'compte', 2, true),
  T('en-05', 'en', 'Please send me last month\'s subscription invoice for my accountant', 'paiement', 0),
  T('en-06', 'en', 'It would be nice to have a dark mode in the dashboard', 'autre', 0),
  // Darija (lettres latines)
  T('da-01', 'darija', 'imprimante ma kat5demch', 'impression', 1),
  T('da-02', 'darija', 'lcaisse ma bghatch t7el, 3ndi clients kay tsnaw', 'caisse', 2, true),
  T('da-03', 'darija', 'kifach nbdel taman dyal plat f menu?', 'menu_stock', 0),
  T('da-04', 'darija', 'nsit lmot de passe dyali, ma9drtch ndkhol l dashboard', 'compte', 1),
  T('da-05', 'darija', 'l client tkhlsso mrtayn f TPE, kifach n3awdhom lflous?', 'paiement', 2),
  T('da-06', 'darija', 'l\'ecran dyal caisse tjmed w ma 9adrinch nbi3o walo', 'caisse', 2, true),
  T('da-07', 'darija', 'bghit n3rf kifach ndir inventaire dyal stock', 'menu_stock', 0),
  // Arabe
  T('ar-01', 'ar', 'الصندوق لا يعمل ولا يمكننا تسجيل أي عملية بيع الآن', 'caisse', 2, true),
  T('ar-02', 'ar', 'الطابعة لا تطبع الفواتير منذ هذا الصباح', 'impression', 1),
  T('ar-03', 'ar', 'كيف يمكنني تغيير سعر المنتج في القائمة؟', 'menu_stock', 0),
  T('ar-04', 'ar', 'نسيت كلمة المرور ولا أستطيع الدخول إلى حسابي', 'compte', 1),
  T('ar-05', 'ar', 'تم خصم المبلغ مرتين من بطاقة الزبون', 'paiement', 2),
  T('ar-06', 'ar', 'أريد إضافة خاصية جديدة في تقارير المبيعات', 'autre', 0),
];

/* Contrôle du jeu : étiquettes connues, au moins 20 demandes, quatre langues. */
export function validateDataset(data) {
  const problems = [];
  const ids = new Set();
  for (const t of data) {
    if (ids.has(t.id)) problems.push('doublon ' + t.id);
    ids.add(t.id);
    if (!CATEGORY_IDS.includes(t.expect.category)) problems.push(t.id + ' : catégorie inconnue');
    if (![0, 1, 2].includes(t.expect.urgency)) problems.push(t.id + ' : urgence inconnue');
    if (!t.text || t.text.length < 12) problems.push(t.id + ' : texte trop court');
    if (t.expect.blocked && t.expect.urgency !== 2) problems.push(t.id + ' : bloqué mais pas « maintenant »');
  }
  if (data.length < 20) problems.push('moins de 20 demandes');
  for (const lang of ['fr', 'en', 'darija', 'ar']) if (!data.some((t) => t.lang === lang)) problems.push('aucune demande en ' + lang);
  return problems;
}

/* Réponse d'un modèle parfait, pour exercer le calcul en mode --dry. */
function perfectAnswer(t) {
  const u = [0.05, 0.05, 0.05]; u[t.expect.urgency] = 0.9;
  const ids = CATEGORY_IDS;
  const probs = Object.fromEntries(ids.map((id) => [id, id === t.expect.category ? 0.9 : 0.02]));
  return {
    model: 'clef-flash',
    answers: {
      urgence: { type: 'score', score: u[1] + 2 * u[2], legend: {}, probabilities: { 0: u[0], 1: u[1], 2: u[2] }, confidence: 0.9 },
      categorie: { type: 'choice', choice: t.expect.category, probabilities: probs, confidence: 0.9 },
      bloque: { type: 'noul', noul: t.expect.blocked ? 0.95 : 0.03 },
    },
    usage: { input_tokens: 150, output_tokens: 0 },
  };
}

async function callClef(account, token, payload) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/@cf/cloudflare/${MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* corps non JSON */ }
  if (!res.ok || (body && body.success === false)) {
    const why = body && Array.isArray(body.errors) && body.errors.length ? body.errors.map((e) => e.message).join('; ').slice(0, 200) : '';
    throw new Error('HTTP ' + res.status + (why ? ' · ' + why : ''));
  }
  return body && body.result ? body.result : body;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next; next += 1; out[i] = await fn(items[i]); }
  }));
  return out;
}

const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + ' %' : 'n/a');

function report(results, showErrors) {
  const done = results.filter((r) => r.triage);
  const failed = results.filter((r) => !r.triage);
  const cat = done.filter((r) => r.triage.category.id === r.t.expect.category);
  const lowCat = done.filter((r) => r.triage.category.top < CONFIDENT_AT);
  const confident = done.filter((r) => r.triage.category.top >= CONFIDENT_AT);
  const confidentRight = confident.filter((r) => r.triage.category.id === r.t.expect.category);
  const urg = done.filter((r) => URGENCY_LEVELS.indexOf(r.triage.urgency.level) === r.t.expect.urgency);
  const wantAlert = done.filter((r) => r.t.expect.urgency === 2 || r.t.expect.blocked);
  const noAlert = done.filter((r) => !(r.t.expect.urgency === 2 || r.t.expect.blocked));
  const gotAlert = (r) => r.triage.verdict === 'urgent';
  const caught = wantAlert.filter(gotAlert);
  const falseAlerts = noAlert.filter(gotAlert);
  const recall = wantAlert.length ? caught.length / wantAlert.length : 1;
  const falseRate = noAlert.length ? falseAlerts.length / noAlert.length : 0;

  console.log(`\nDemandes triées : ${done.length} / ${results.length}` + (failed.length ? `  (${failed.length} sans réponse exploitable)` : ''));
  console.log(`Catégorie           : ${pct(cat.length, done.length)} exacte  (${cat.length}/${done.length})`);
  console.log(`  réponses assurées : ${confident.length} (>= ${CONFIDENT_AT}), justes à ${pct(confidentRight.length, confident.length)} ; « à vérifier » : ${lowCat.length}`);
  console.log(`Urgence (3 niveaux) : ${pct(urg.length, done.length)} exacte  (${urg.length}/${done.length})`);
  console.log(`Alerte (seuil ${ALERT_AT}) : rappel ${pct(caught.length, wantAlert.length)} (${caught.length}/${wantAlert.length} demandes bloquantes), fausses alertes ${pct(falseAlerts.length, noAlert.length)} (${falseAlerts.length}/${noAlert.length})`);

  console.log('\nPar langue (catégorie / urgence / alerte juste) :');
  for (const lang of ['fr', 'en', 'darija', 'ar']) {
    const rows = done.filter((r) => r.t.lang === lang);
    if (!rows.length) continue;
    const c = rows.filter((r) => r.triage.category.id === r.t.expect.category).length;
    const u = rows.filter((r) => URGENCY_LEVELS.indexOf(r.triage.urgency.level) === r.t.expect.urgency).length;
    const a = rows.filter((r) => gotAlert(r) === (r.t.expect.urgency === 2 || r.t.expect.blocked)).length;
    console.log(`  ${lang.padEnd(7)} ${rows.length} demandes : ${pct(c, rows.length)} / ${pct(u, rows.length)} / ${pct(a, rows.length)}`);
  }

  const wrong = done.filter((r) => r.triage.category.id !== r.t.expect.category
    || URGENCY_LEVELS.indexOf(r.triage.urgency.level) !== r.t.expect.urgency
    || gotAlert(r) !== (r.t.expect.urgency === 2 || r.t.expect.blocked));
  if (wrong.length && showErrors) {
    console.log('\nÉcarts :');
    for (const r of wrong) {
      console.log(`  ${r.t.id} « ${r.t.text.slice(0, 60)} »\n    attendu ${r.t.expect.category}/${r.t.expect.urgency}/${r.t.expect.blocked ? 'bloqué' : 'ok'}`
        + `  obtenu ${r.triage.category.id} (${r.triage.category.top})/${URGENCY_LEVELS.indexOf(r.triage.urgency.level)} (${r.triage.urgency.top})/bloqué ${r.triage.blocked}`);
    }
  } else if (wrong.length) {
    console.log(`\n${wrong.length} écarts (relancez avec --show-errors pour les voir).`);
  }
  for (const r of failed) console.log(`  ${r.t.id} : pas de réponse (${r.error})`);
  return { recall, falseRate, failed: failed.length };
}

async function main() {
  const problems = validateDataset(DATASET);
  if (problems.length) { console.error('Jeu de données invalide :\n  ' + problems.join('\n  ')); process.exit(1); }

  let data = DATASET;
  const only = opt('lang', '');
  if (only) data = data.filter((t) => t.lang === only);
  const limit = Number(opt('limit', 0));
  if (limit > 0) data = data.slice(0, limit);
  const dry = flag('dry');

  console.log(`Évaluation de @cf/cloudflare/${MODEL} · ${data.length} demandes synthétiques (${[...new Set(data.map((t) => t.lang))].join(', ')})` + (dry ? ' · MODE SEC : aucun appel réseau, modèle parfait simulé' : ''));

  const account = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  if (!dry && (!account || !token)) {
    console.error('\nVariables manquantes : définissez CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN (jeton avec la permission Workers AI), ou lancez avec --dry.');
    console.error('Exemple : CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node tools/support-triage-eval.mjs --show-errors');
    process.exit(2);
  }

  if (dry) {
    const sample = buildTriageRequest({ summary: data[0].text, storeType: 'restaurant' });
    console.log('\nExemple de requête (corps envoyé à l\'API) :\n' + JSON.stringify(sample, null, 2).slice(0, 1800) + '\n…');
  }

  const results = await mapLimit(data, Math.max(1, Number(opt('concurrency', 3))), async (t) => {
    try {
      const payload = buildTriageRequest({ summary: t.text, storeType: 'restaurant' });
      payload.model = MODEL;
      const response = dry ? perfectAnswer(t) : await callClef(account, token, payload);
      const triage = readTriageAnswers(response);
      if (!triage) return { t, triage: null, error: 'réponse hors schéma' };
      return { t, triage };
    } catch (e) {
      // Le message d'erreur vient de la réponse HTTP, jamais d'un en-tête : le jeton n'y figure pas.
      return { t, triage: null, error: String(e && e.message || e).replace(token || '\u0000', '***') };
    }
  });

  const { recall, falseRate, failed } = report(results, flag('show-errors'));
  if (dry) { console.log('\nMode sec terminé : le calcul fonctionne. Lancez la commande avec vos variables pour la vraie mesure.'); return; }
  if (failed === results.length) process.exit(1);
  console.log(recall >= 0.9 && falseRate <= 0.2 ? '\nSeuils d\'alerte tenus (rappel >= 0,9, fausses alertes <= 0,2).' : '\nSeuils d\'alerte NON tenus : revoyez ALERT_AT ou les critères avant de compter sur l\'alerte.');
  process.exit(recall >= 0.9 && falseRate <= 0.2 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

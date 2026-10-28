#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
import { hotelTestSource } from './hotel-test-source.mjs';
import stockTestSource from './stock-test-source.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Les noms saisis par le commerçant n'entrent pas en HTML brut
 *
 * Kiwi.modal() insère `desc` tel quel dans un <p> (assets/interactive.js : des
 * appelants y passent volontairement du balisage, on ne change donc pas la
 * fenêtre). La barrière est chez l'APPELANT : un nom de zone, de catégorie, de
 * produit ou de client contenant <img onerror=…> s'exécutait à l'ouverture de
 * la fenêtre de confirmation. Même défaut dans le rendu des résultats du scan
 * de documents (agent-vision.js), où le texte vient d'une facture photographiée.
 * ─────────────────────────────────────────────────────────────────────────── */
import mergedPart from './merged-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const read = (rel) => coreTestSource.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
let controls = 0;
const has = (src, needle, label) => { assert.ok(src.includes(needle), label); controls++; };
const hasNot = (src, needle, label) => { assert.ok(!src.includes(needle), label); controls++; };

const interactive = read('assets/interactive.js');
has(interactive, '${desc ? `<p>${desc}</p>` : \'\'}', 'Kiwi.modal garde `desc` comme balisage (des appelants en dépendent) : la barrière est chez l\'appelant');

const pages = pagesProSource();
has(pages, 'desc: T.removeDesc(esc(`${t.model} · ${locName(t.loc)}`)),', 'terminal retiré : modèle et lieu échappés');
has(pages, 'desc: T.deleteZoneDesc(pdsEsc(pdsZoneName(z)), count),', 'plan de salle : nom de zone échappé');
has(pages, 'desc: _catL(`« ${_esc(c.name)} » contient', 'boutique : nom de catégorie échappé');
has(pages, '`"${_esc(c.name)}" contains', 'boutique : nom de catégorie échappé (anglais)');
has(pages, '`«${_esc(c.name)}» تحتوي', 'boutique : nom de catégorie échappé (arabe)');
hasNot(pages, 'desc: T.deleteZoneDesc(z.name, count)', 'plus de nom de zone brut');
hasNot(pages, 'desc: `« ${c.name} » contient', 'plus de nom de catégorie brut');
hasNot(pages, '`« ${c.name} » contient', 'plus de nom de catégorie brut (traduit)');
hasNot(pages, '`"${c.name}" contains', 'plus de nom de catégorie brut (anglais)');

const stock = stockTestSource();
has(stock, 'desc: `${esc(it.name)} · ${esc(catLabel(it.category))}`,', 'stock : article et catégorie échappés (fournisseur de secours)');
has(stock, "desc: `${esc(t('moveCurrent'))} : ${esc(fmtUnit(currentStockFor(it), it.unit))}`,", 'stock : unité échappée');
has(stock, 'desc: `${esc(catLabel(it.category))} · ${st ===', 'stock : catégorie échappée (fiche article)');
hasNot(stock, 'desc: `${it.name} · ${catLabel(it.category)}`', 'plus d\'article brut dans la description');

const hotel = hotelTestSource();
has(hotel, "desc: esc(booking.customer.name) + ' · ' + esc(cuDay(", 'hôtel : nom du client échappé dans « Libérer cette chambre »');
has(hotel, 'dernier : ${esc(g.last)}', 'hôtel : fiche client échappée');

/* Le scan de documents : tout ce qui vient du modèle ou du fichier passe par esc(). */
const vision = mergedPart('assets/agent-voice.js', 'assets/agent-vision.js');
const escSrc = vision.slice(vision.indexOf('function esc(v)'), vision.indexOf('function toast(msg)'));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(escSrc + '\nglobalThis.esc = esc;', sandbox);
const evil = '<img src=x onerror=alert(1)>"\'&';
const out = sandbox.esc(evil);
assert.ok(!/[<>"']/.test(out) && out.includes('&lt;img') && out.endsWith('&amp;'), 'esc() neutralise < > " \' &');
controls++;
for (const raw of [
  /\+ ent\.supplier \+/, /\+ ent\.date \+/, /\+ ent\.invoiceNumber \+/, /\+ it\.name \+/,
  /\+ \(data\.title \|\|/, /\+ \(data\.summary \|\|/, /\+ \(data\.categoryLabel \|\|/,
  /\+ filename \+/, /\+ \(err\.message \|\|/, /src="' \+ dataUrl/, /\n\s+act\.label \+/,
]) { assert.ok(!raw.test(vision), 'agent-vision : plus de concaténation brute ' + raw); controls++; }
for (const safe of [
  'esc(ent.supplier)', 'esc(ent.date)', 'esc(ent.invoiceNumber)', 'esc(it.name)', 'esc(data.title ||', 'esc(data.summary ||',
  'esc(data.categoryLabel ||', 'esc(filename)', 'esc(err.message ||', 'esc(dataUrl)', 'esc(act.label)', 'esc(act.type)',
]) has(vision, safe, 'agent-vision : ' + safe);

console.log('modal-desc-escape-test: ' + controls + ' controls passed');

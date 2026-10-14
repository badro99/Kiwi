#!/usr/bin/env node
/* Order Pro · les tags NFC suivent le plan de salle (assets/orderpro-panel.js).
 *
 * Le panneau listait « Table 1..12 » quoi qu'il arrive. Une salle dont les
 * tables s'appellent « T7 » ou « Terrasse 2 » recevait des tags que la caisse
 * ne reconnaissait pas. On charge le vrai fichier dans un bac à sable, on lui
 * donne un plan, et on lit les liens qu'il propose. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/orderpro-panel.js'), 'utf8');
let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; };

async function render(plan, status = 200) {
  const rows = { innerHTML: '', insertAdjacentHTML(_, h) { el.before += h; } };
  const more = { hidden: false };
  let note = null;
  const el = {
    innerHTML: '', before: '', isConnected: true,
    addEventListener() {},
    querySelector(sel) {
      if (sel === '.opp-rows') return rows;
      if (sel === '.opp-more') return more;
      if (sel === '[data-opp-plan]') return note;
      return null;
    },
  };
  const ctx = {
    window: {}, location: { origin: 'https://kiwi.test' }, console,
    navigator: {}, document: { readyState: 'complete', getElementById: () => ({}), head: { appendChild() {} }, addEventListener() {} },
    fetch: async (url) => {
      if (url.startsWith('/api/store?feature=floorplan')) return { ok: status === 200, json: async () => ({ data: plan }) };
      return { ok: true, json: async () => ({ menu: { items: [] } }) };
    },
  };
  ctx.window = ctx;
  ctx.KiwiOrderPro = { merchant: () => 'chez-nadia', type: () => 'restaurant' };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.KiwiOrderProPanel.mount(el);
  const first = el.innerHTML;
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const links = [...(rows.innerHTML || first).matchAll(/data-opp-copy="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const titles = [...(rows.innerHTML || first).matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);
  return { first, links, titles, more, note: el.before, rowsHtml: rows.innerHTML || first };
}

/* 1. un plan : ses tables, nommées comme la caisse les nomme */
let r = await render({
  tables: [
    { id: 't-a', num: '12' }, { id: 't-b', num: '2' }, { id: 't-c', num: 'T7' },
    { id: 't-d', num: '9', name: 'Terrasse 2' }, { id: 't-e', num: '5' }, { id: 't-f' },
    { id: 't-g', num: '2' }, { id: 't-h', num: 'T12' },
  ],
  gone: { 't-e': 1 },
});
const tables = r.links.filter((u) => u.includes('&t='));
ok(r.links[0] === 'https://kiwi.test/order?s=chez-nadia&m=takeout', 'le tag comptoir reste en tête');
ok(tables.map((u) => decodeURIComponent(u.split('&t=')[1])).join() === '2,7,9,12',
  'les liens portent les chiffres que le téléphone garde (T7 → 7), triés, sans doublon ni table effacée: ' + tables.join(' '));
ok(r.titles.slice(1, 5).join('|') === 'Table 2|T7|Terrasse 2|Table 12', 'chaque tag dit le nom du plan: ' + r.titles.join('|'));
const html = r.rowsHtml;
ok(/<b>t-f<\/b><span>Pas de numéro/.test(html), 'une table sans numéro est listée sans tag, avec la raison');
ok(/<b>T12<\/b><span>Même numéro que « Table 12 »/.test(html), 'une table dont le numéro est déjà pris est listée sans tag');
ok(!/data-opp-copy="[^"]*&amp;t=(t-f|T12)"/.test(html), 'aucun lien pour les tables sans tag possible');
ok(r.more.hidden === true, '« Afficher plus de tables » disparaît quand le plan fait la liste');
ok(/plan de salle/.test(r.note), 'une note dit d’où vient la liste et comment ajouter une table');
ok(!/[—]/.test(r.note + r.titles.join('')), 'pas de tiret cadratin');

/* 2. pas de plan, plan vide, ou lecture refusée : la liste numérotée d'avant */
for (const [plan, status, why] of [[null, 200, 'sans plan'], [{ tables: [] }, 200, 'plan vide'], [{ tables: [{ num: '4' }] }, 401, 'lecture refusée']]) {
  r = await render(plan, status);
  const t = r.links.filter((u) => u.includes('&t='));
  ok(t.length === 12 && t[0].endsWith('&t=1') && t[11].endsWith('&t=12') && r.more.hidden === false,
    `${why} : Table 1..12 et « Afficher plus » restent`);
}

console.log(`orderpro-panel-plan-test: ${checks} checks passed`);

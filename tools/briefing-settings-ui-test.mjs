#!/usr/bin/env node
import briefingSource from './briefing-test-source.cjs';
/* Réglages du point du matin (vague 15, voie J).
 *   briefing#0 · les 17 seuils sont rangés par règle, en mots simples, avec une
 *                phrase d'aide FR/EN/AR et un « rétablir » par règle ;
 *   briefing#1 · les bornes n'existent qu'une fois (functions/api/_briefing-limits.js) :
 *                le serveur les lit, le navigateur en porte une copie générée.
 * Chaque cas exécute le vrai code (vm, générateur, route de nettoyage). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const importModule = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
let count = 0;
const ok = (label) => { count++; console.log('✓ ' + label); };

/** @param {string} lang @param {string} tier */
function briefing(lang = 'fr', tier = 'owner') {
  const card = { parentNode: {}, innerHTML: '', closest: () => null, querySelector: () => null };
  /** @type {Record<string, Array<(e: any) => void>>} */
  const listeners = {};
  const asked = [], message = { textContent: '' };
  const document = {
    readyState: 'loading', documentElement: { lang }, addEventListener: (k, f) => (listeners[k] ||= []).push(f),
    querySelector: (sel) => sel === '[data-briefing-card]' ? card : null, getElementById: (id) => { asked.push(id); return message; }, createElement: () => ({ setAttribute() {} }),
  };
  const memory = new Map(), localStorage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  const window = { KiwiEnv: { isReal: () => true }, KiwiAgentTier: () => tier, KiwiCloudDoc: { currentSlug: () => 'fixture' }, addEventListener() {} };
  vm.runInNewContext(briefingSource(), { window, document, localStorage, console, Date, Intl, setTimeout, clearTimeout });
  return { B: window.KiwiBriefing, T: window.KiwiBriefing._test, listeners, card, asked, message };
}
const html = (ctx) => { ctx.T.render(); return ctx.card.innerHTML; };
/** Les blocs « règle » du rendu : { index, body }. */
const ruleBlocks = (markup) => [...markup.matchAll(/<details class="briefing-rule" data-briefing-open="rule-(\d+)"[^>]*>([\s\S]*?)<\/details>/g)].map((m) => ({ index: Number(m[1]), body: m[2] }));
const keysIn = (body) => [...body.matchAll(/data-briefing-limit="(\w+)"/g)].map((m) => m[1]);
const click = (ctx, target) => ctx.listeners.click.forEach((f) => f({ target }));

const { BRIEFING_FIELDS, BRIEFING_GROUPS } = await importModule('functions/api/_briefing-limits.js');
const { BRIEFING_LIMITS, cleanBriefingSettings } = await importModule('functions/api/_briefing-settings.js');
const generator = await importModule('tools/build-briefing-limits.mjs');

/* ── briefing#1 · une seule table ─────────────────────────────────────────── */
{
  // La copie du navigateur est exactement ce que le générateur écrirait.
  const source = briefingSource();
  assert.equal(generator.splice(source, await generator.renderBlock()), source, 'assets/briefing.js : lancez node tools/build-briefing-limits.mjs');
  // Le navigateur (copie évaluée) et le serveur donnent les mêmes bornes que la table pour chaque champ.
  const block = vm.runInNewContext('(function () {\n' + (await generator.renderBlock()) + '\nreturn LIMITS;\n})()');
  for (const [key, f] of Object.entries(BRIEFING_FIELDS)) {
    assert.deepEqual([block[key][0], block[key][1], block[key][2]], [f.value, f.min, f.max], key);
    assert.deepEqual(BRIEFING_LIMITS[key], { min: f.min, max: f.max, integer: !!f.integer }, key);
  }
  // Et la règle de nettoyage du serveur refuse ce que la table refuse, accepte ce qu'elle accepte.
  const edge = { salesDrop: BRIEFING_FIELDS.salesDrop.max + 1, share: BRIEFING_FIELDS.share.min, samples: 2.5 };
  const cleaned = cleanBriefingSettings({ settings: edge, settingsFieldsAt: { salesDrop: 1, share: 1, samples: 1 } });
  assert.deepEqual(cleaned.settings, { share: BRIEFING_FIELDS.share.min });
  // Plus de seconde table à tenir à la main.
  assert.doesNotMatch(read('functions/api/_briefing-settings.js'), /const RANGE|new Set\(\[/, 'le serveur ne redéclare plus les bornes');
  ok('briefing#1 les bornes vivent une fois : le serveur les lit, la copie du navigateur est générée et à jour');
}

/* ── briefing#0 · le pavé de réglages ─────────────────────────────────────── */
{
  const keys = Object.keys(BRIEFING_FIELDS);
  assert.equal(keys.length, 17);
  assert.deepEqual([...new Set(BRIEFING_GROUPS.flat())].sort(), [...keys].sort(), 'chaque seuil est lu par au moins une règle');
  for (const lang of ['fr', 'en', 'ar']) {
    const ctx = briefing(lang);
    const markup = html(ctx);
    const blocks = ruleBlocks(markup);
    const names = ctx.T.copy().ruleNames;
    assert.equal(blocks.length, 9, lang + ': une section par règle');
    assert.equal(blocks.length, names.length);
    blocks.forEach(({ index, body }) => {
      assert.equal(index, blocks.indexOf(blocks[index]));
      assert.deepEqual(keysIn(body), BRIEFING_GROUPS[index], lang + ' · ' + names[index] + ' : ses champs, dans l’ordre');
      assert.ok(body.includes('<summary>' + names[index] + '</summary>'), lang + ' : le titre est le nom de la règle');
      assert.match(body, new RegExp('data-briefing-reset="' + index + '"'), lang + ' : un rétablissement par règle');
      for (const key of BRIEFING_GROUPS[index]) {
        const f = BRIEFING_FIELDS[key], at = lang === 'ar' ? 2 : lang === 'en' ? 1 : 0;
        assert.ok(f.help[at] && f.help[at].length > 20, lang + ' · ' + key + ' : une phrase d’aide');
        assert.ok(body.includes(f.help[at].replace(/’/g, '’')), lang + ' · ' + key + ' : l’aide est affichée');
        assert.ok(body.includes('>' + f.label[at] + '</label>'), lang + ' · ' + key + ' : le nom est celui du champ');
        assert.match(body, new RegExp('aria-describedby="briefing-help-' + index + '-' + key + ' briefing-error-' + index + '-' + key + '"'));
      }
    });
    // Les 17 seuils sont tous réglables, aucun n'est perdu par le regroupement.
    assert.deepEqual([...new Set(keysIn(markup))].sort(), [...keys].sort(), lang);
  }
  // Le jargon statistique a disparu de l'écran.
  const fr = html(briefing('fr')).replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(fr, /chantillons minimum|Multiple de r[ée]f[ée]rence/);
  assert.doesNotMatch(Object.values(BRIEFING_FIELDS).flatMap((f) => [...f.label, ...f.help]).join(' '), /—|–/, 'pas de tiret long');
  // Un employé ne voit aucun réglage.
  assert.doesNotMatch(html(briefing('fr', 'staff')), /data-briefing-limit/);
  ok('briefing#0 neuf règles, dix-sept seuils, noms simples et aide dans les trois langues');
}

{
  // Un seuil lu par deux règles le dit.
  const ctx = briefing('fr');
  const names = ctx.T.copy().ruleNames;
  const body = ruleBlocks(html(ctx)).find((b) => b.index === 4).body;
  assert.ok(body.includes('Aussi utilisé par : ' + [names[0], names[5], names[7]].join(', ') + '.'), 'repères minimum : partagé avec ventes, remises et délais');
  assert.ok(body.includes('Aussi utilisé par : ' + names[5] + '.'), 'part d’alerte : partagée avec les remises');
  const stock = ruleBlocks(html(ctx)).find((b) => b.index === 1).body;
  assert.doesNotMatch(stock, /Aussi utilisé par/, 'un seuil propre à une règle ne renvoie à personne');
  ok('briefing#0 un seuil partagé annonce les autres règles qui le lisent');
}

{
  // Rétablir : une règle, ses champs, rien d'autre.
  const ctx = briefing('fr');
  const { B } = ctx;
  const d = (k) => BRIEFING_FIELDS[k].value;
  assert.ok(B.setSettings({ salesDrop: 35, stockFactor: 2.5 }));
  assert.ok(B.setSettings({ share: 9, multiple: 4, events: 6 }));
  const markup = html(ctx);
  const disabled = (i) => /disabled/.test(markup.match(new RegExp('<button[^>]*data-briefing-reset="' + i + '"[^>]*>'))[0]);
  assert.equal(disabled(0), false, 'ventes : un seuil a bougé');
  assert.equal(disabled(1), false);
  assert.equal(disabled(4), false);
  assert.equal(disabled(3), true, 'planning : déjà aux valeurs d’usine');
  assert.equal(disabled(6), true);
  // Clic sur le bouton de la règle Annulations (4).
  const button = { disabled: false, getAttribute: (k) => k === 'data-briefing-reset' ? '4' : null };
  click(ctx, { closest: (sel) => sel === '[data-briefing-reset]' ? button : null });
  const s = B.settings();
  assert.deepEqual([s.share, s.multiple, s.events], [d('share'), d('multiple'), d('events')], 'les champs de la règle reviennent à l’usine');
  assert.equal(s.salesDrop, 35, 'les autres règles ne bougent pas');
  assert.equal(s.stockFactor, 2.5);
  // Rétablir la règle Ventes puis lire le pavé : tout est à l’usine, les boutons se grisent.
  click(ctx, { closest: (sel) => sel === '[data-briefing-reset]' ? { disabled: false, getAttribute: () => '0' } : null });
  click(ctx, { closest: (sel) => sel === '[data-briefing-reset]' ? { disabled: false, getAttribute: () => '1' } : null });
  assert.equal(B.settings().salesDrop, d('salesDrop'));
  assert.equal(B.settings().stockFactor, d('stockFactor'));
  assert.ok(/disabled/.test(html(ctx).match(/<button[^>]*data-briefing-reset="4"[^>]*>/)[0]), 'plus rien à rétablir');
  // Un bouton grisé ne fait rien, un employé non plus.
  assert.ok(B.setSettings({ lateMinutes: 30 }));
  click(ctx, { closest: (sel) => sel === '[data-briefing-reset]' ? { disabled: true, getAttribute: () => '7' } : null });
  assert.equal(B.settings().lateMinutes, 30);
  assert.equal(briefing('fr', 'staff').B.resetRule(0), false);
  assert.equal(B.resetRule(99), false, 'une règle inconnue est refusée');
  ok('briefing#0 « rétablir » ramène les seuils d’une règle à l’usine sans toucher aux autres');
}

{
  // Une valeur refusée s'explique dans le message du bon champ, même quand le seuil figure dans plusieurs règles.
  const ctx = briefing('fr');
  const attrs = {};
  const input = { value: '12', getAttribute: (k) => ({ 'data-briefing-limit': 'share', 'data-briefing-error': 'briefing-error-5-share' })[k] || null, setAttribute: (k, v) => { attrs[k] = v; } };
  ctx.listeners.change.forEach((f) => f({ target: input }));
  assert.equal(attrs['aria-invalid'], 'false');
  assert.equal(ctx.B.settings().share, 12);
  input.value = '1000';
  ctx.listeners.change.forEach((f) => f({ target: input }));
  assert.equal(attrs['aria-invalid'], 'true');
  assert.equal(ctx.asked.at(-1), 'briefing-error-5-share', 'le message va au champ saisi');
  assert.match(ctx.message.textContent, /entre 0,1 et 100/);
  ok('briefing#0 le message d’erreur suit le champ saisi');
}

{
  // Les pavés ouverts le restent après le redessin qui suit une saisie.
  const ctx = briefing('fr');
  assert.doesNotMatch(html(ctx), /data-briefing-open="rule-4" open/);
  const open = (key, value) => ctx.listeners.toggle.forEach((f) => f({ target: { open: value, getAttribute: (k) => k === 'data-briefing-open' ? key : null } }));
  open('all', true); open('rule-4', true);
  const markup = html(ctx);
  assert.match(markup, /data-briefing-open="all" open/);
  assert.match(markup, /data-briefing-open="rule-4" open/);
  assert.doesNotMatch(markup, /data-briefing-open="rule-5" open/);
  open('rule-4', false);
  assert.doesNotMatch(html(ctx), /data-briefing-open="rule-4" open/);
  ok('briefing#0 un pavé ouvert reste ouvert après une saisie');
}

console.log('briefing-settings-ui-test: ' + count + ' cases passed');

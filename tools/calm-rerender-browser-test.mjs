#!/usr/bin/env node
// Une animation d'entrée ne rejoue pas quand un écran se redessine à l'identique.
// Vidéos du 21 nov. 2026 (Amira Boutique, iPad) : Échanges & avoirs « clignotait »
// à chaque repeint, parce que chaque carte recréée par innerHTML rejouait son
// fondu d'entrée (222 règles d'entrée dans ~40 feuilles). Ces suites tournent
// mouvement ALLUMÉ : toutes les autres forcent prefers-reduced-motion, et c'est
// pour ça que personne ne l'avait vu.
import assert from 'node:assert/strict';
import { harness, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('calm-rerender');
const MOTION = [{ name: 'prefers-reduced-motion', value: 'no-preference' }];

/* Ce qui est en train de jouer, deux images après le geste : un fondu terminé
   d'office est « finished », un fondu qui rejoue est « running ». */
const RUNNING = `(sel) => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() =>
  ok(document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target
    && a.effect.target.matches(sel)).map((a) => a.effect.target.textContent.trim())))))`;

try {
  await h.S.run('rules on a bare page: same content calm, new content and navigation animate', async (t) => {
    const ctx = await h.browser.createBrowserContext(); t.defer(() => ctx.close());
    const page = await ctx.newPage(); t.watch(page);
    await page.emulateMediaFeatures(MOTION);
    await page.setContent(`<!doctype html><style>
      @keyframes enter { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      .row { animation: enter 900ms ease both; } .spin { animation: spin 1s linear infinite; }
      .panel { display: none; } .panel.on { display: block; }
    </style><div id="list"></div><div id="p1" class="panel on"><div id="in1"></div></div><div id="p2" class="panel"><div id="in2"></div></div>`);
    await page.addScriptTag({ path: 'assets/kit/haptics.js' });
    const rows = (names) => names.map((n) => `<div class="row">${n}</div>`).join('');
    const running = (sel) => page.evaluate(`(${RUNNING})(${JSON.stringify(sel)})`);

    t.step('a list that appears for the first time fades in');
    await page.evaluate((h) => { document.getElementById('list').innerHTML = h; }, rows(['A', 'B']));
    assert.deepEqual(await running('#list .row'), ['A', 'B']);
    await sleep(1000);

    t.step('the same list drawn again does not fade again');
    await page.evaluate((h) => { document.getElementById('list').innerHTML = h; }, rows(['A', 'B']));
    assert.deepEqual(await running('#list .row'), [], 'identical rows rebuilt by innerHTML stay put');

    t.step('a redraw with one new row animates only that row');
    await page.evaluate((h) => { document.getElementById('list').innerHTML = h; }, rows(['C', 'A', 'B']));
    assert.deepEqual(await running('#list .row'), ['C']);
    await sleep(1000);

    t.step('emptied, then filled again a moment later: still the same rows, no fade');
    await page.evaluate(() => { document.getElementById('list').innerHTML = '<div class="spin"></div>'; });
    await sleep(120);
    await page.evaluate((h) => { document.getElementById('list').innerHTML = h; }, rows(['C', 'A', 'B']));
    assert.deepEqual(await running('#list .row'), [], 'a loading state in between is not a new screen');

    t.step('a looping spinner is never stopped');
    await page.evaluate(() => { document.getElementById('list').innerHTML = '<div class="spin">s</div>'; });
    await page.evaluate(() => { document.getElementById('list').innerHTML = '<div class="spin">s</div>'; });
    assert.deepEqual(await running('#list .spin'), ['s']);

    t.step('opening another screen keeps its entrance, even with content already seen');
    await page.evaluate((h) => { document.getElementById('in2').innerHTML = h; }, rows(['X']));
    await sleep(1000);
    await page.evaluate((h) => {
      document.getElementById('p1').classList.remove('on'); document.getElementById('p2').classList.add('on');
      document.getElementById('in2').innerHTML = h;
    }, rows(['X']));
    assert.deepEqual(await running('#in2 .row'), ['X'], 'navigation is a real entrance');

    t.step('an element that asks to always animate keeps doing so');
    await sleep(1000);
    await page.evaluate(() => { document.getElementById('in2').innerHTML = '<div class="row" data-enter-always>X</div>'; });
    assert.deepEqual(await running('#in2 .row'), ['X']);
  });

  for (const viewport of ['tablet', 'phone']) await h.S.run(`boutique till · Échanges does not flash on redraw · fr · ${viewport}`, async (t) => {
    const { page } = await openTill(h, t, 'caisse-boutique', 'fr', viewport);
    await page.emulateMediaFeatures(MOTION);
    const tap = (v) => page.evaluate(`(async () => {
      document.querySelector('[data-bq-view="${v}"]').click();
      return (${RUNNING})('.bq-sale, .bq-line, .bq-card');
    })()`);
    const repaint = () => page.evaluate(`(async () => { window.KiwiPosDispatch.repaint(); return (${RUNNING})('.bq-sale, .bq-line, .bq-card'); })()`);

    /* Une entrée en cascade dure jusqu'à ~0,9 s (420 ms + 22 ms par carte) :
       on la laisse finir avant de mesurer un repeint, sinon on compte la
       première entrée, légitime, encore en cours. */
    const SETTLE = 1600;
    t.step('open Échanges from Vente: the sales arrive with their entrance');
    await tap('vente'); await sleep(SETTLE);
    assert.ok((await tap('echanges')).length > 0, 'navigating to the screen keeps its entrance');
    await sleep(SETTLE);
    t.step('tap Échanges again, then a till repaint: nothing fades');
    assert.deepEqual(await tap('echanges'), [], 'tapping the open screen again');
    assert.deepEqual(await repaint(), [], 'refresh button / data arrival');
    t.step('same on Vente: the ticket and the grid stay still');
    await tap('vente'); await sleep(SETTLE);
    assert.deepEqual(await tap('vente'), []);
    assert.deepEqual(await repaint(), []);
  });
  /* Le même repeint de fond (catalogue tiré toutes les 20 s, promos, retour
     au premier plan) reconstruisait aussi le champ où la caissière tapait :
     code-barres à moitié saisi effacé au Scanner, clavier de l'iPad refermé
     en pleine recherche aux Échanges. Il attend qu'elle quitte le champ. */
  await h.S.run('boutique till · a background repaint waits while the cashier types · fr · tablet', async (t) => {
    const { page } = await openTill(h, t, 'caisse-boutique', 'fr', 'tablet');
    const typeIn = async (view, text) => {
      await page.evaluate((v) => document.querySelector(`[data-bq-view="${v}"]`).click(), view);
      await sleep(900);
      const sel = `[data-bq-panel="${view}"] input:not([type=checkbox]):not([type=radio])`;
      await page.$eval(sel, (e) => { e.__typed = true; e.value = ''; e.focus(); });
      await page.keyboard.type(text);
      await page.evaluate(() => window.KiwiPosDispatch.repaint());
      await sleep(600);
      return page.$eval(sel, (e) => ({ same: e.__typed === true, focused: document.activeElement === e, value: e.value }));
    };
    t.step('Scanner: a half-typed barcode survives a repaint');
    assert.deepEqual(await typeIn('scan', '61234'), { same: true, focused: true, value: '61234' });
    t.step('Échanges: the search keeps its field and its keyboard');
    assert.deepEqual(await typeIn('echanges', 'Sal'), { same: true, focused: true, value: 'Sal' });
    t.step('once she leaves the field, the held repaint runs');
    await page.evaluate(() => document.activeElement.blur());
    await sleep(900);
    assert.equal(await page.$eval('[data-bq-panel="echanges"] input:not([type=checkbox]):not([type=radio])', (e) => e.__typed === true), false, 'the screen was redrawn after the field was left');
  });
  await h.S.run('maison till · a background repaint waits while the cashier types · fr · tablet', async (t) => {
    const { page } = await openTill(h, t, 'caisse-maison', 'fr', 'tablet');
    await page.evaluate(() => document.querySelector('[data-mz-view="scan"]').click());
    await sleep(900);
    const sel = '[data-mz-panel="scan"] input:not([type=checkbox]):not([type=radio])';
    await page.$eval(sel, (e) => { e.__typed = true; e.value = ''; e.focus(); });
    await page.keyboard.type('61234');
    await page.evaluate(() => window.KiwiPosDispatch.repaint());
    await sleep(600);
    assert.deepEqual(await page.$eval(sel, (e) => ({ same: e.__typed === true, focused: document.activeElement === e, value: e.value })),
      { same: true, focused: true, value: '61234' }, 'a half-typed barcode survives a repaint');
  });
} finally { await h.close(); await h.S.finish(); }

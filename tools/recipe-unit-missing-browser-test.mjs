#!/usr/bin/env node
/* Fiche recette : « Unités manquantes » dit QUELLE ligne (26 nov. 2026).
 *
 * Une ligne d'ingrédient sans unité faisait refuser l'enregistrement avec un
 * seul message en haut de l'écran, « Choisissez une unité pour chaque
 * ingrédient » : sur une recette de dix lignes, le commerçant devait chercher
 * laquelle. La ligne fautive est maintenant marquée (aria-invalid, bord
 * d'erreur) et sa liste d'unités prend le focus ; la marque part dès qu'une
 * unité est choisie. Un ingrédient libre, hors stock, n'est toujours pas
 * rempli d'office : 200 « unité » de farine au lieu de 200 g fausserait le
 * coût le jour où l'article entre au stock.
 *
 * L'article est posé par le magasin de la carte (la démo n'en a pas) ; la
 * fiche, elle, s'ouvre, se remplit et s'enregistre au vrai clic. */
import assert from 'node:assert/strict';
import { harness, dashboardWalker, sleep } from './surface-matrix-lib.mjs';

const h = await harness('recipe-unit-missing');
const nav = dashboardWalker(h);
try {
  await h.S.run('recipe editor · a line without a unit is marked and focused', async (t) => {
    // coverage: surface=dashboard-menu locale=fr viewport=desktop
    const { page } = await nav.open(t, 'dashboard-menu', 'fr', 'desktop');
    await page.evaluate(() => {
      const s = window.KiwiMenuStore;
      s.addCategory('Plats test');
      const cats = s.categories();
      s.addItem({ catId: cats[cats.length - 1].id, name: 'Salade test', price: 50 });
    });
    const at = (sel, i = 0) => page.evaluate((sel, i) => {
      const e = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)[i];
      if (!e) return null;
      e.scrollIntoView({ block: 'center' });
      const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, sel, i);
    const tap = async (sel, i = 0) => { const p = await at(sel, i); assert.ok(p, 'on screen: ' + sel); await page.mouse.click(p.x, p.y); };
    t.step('open the recipe of the dish');
    await tap('[data-action="rmw-tab"][data-tab="recipes"]');
    await sleep(700);
    await tap('[data-action="rmw-recipe-edit"]');
    await page.waitForSelector('.rmw-recipe-modal [data-recipe-ing]', { visible: true, timeout: 8000 });
    await sleep(500);
    const M = '.rmw-recipe-modal ';
    const fill = async (row, name, qty) => {
      await tap(M + '[data-ing-name]', row);
      await page.keyboard.type(name);
      const q = await at(M + '[data-ing-qty]', row);
      await page.mouse.click(q.x, q.y, { clickCount: 3 });
      await page.keyboard.type(String(qty));
    };
    t.step('three lines, the second and third without a unit');
    await fill(0, 'Tomate test', 2);
    await page.evaluate(() => { const s = document.querySelectorAll('.rmw-recipe-modal [data-ing-unit]')[0]; s.value = [...s.options].find((o) => o.value).value; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await tap(M + '[data-ing-add]');
    await fill(1, 'Sel test', 1);
    await tap(M + '[data-ing-add]');
    await fill(2, 'Poivre test', 1);
    const state = () => page.evaluate(() => {
      const units = [...document.querySelectorAll('.rmw-recipe-modal [data-ing-unit]')];
      return {
        open: !!document.querySelector('.rmw-recipe-modal [data-recipe-ing]'),
        invalid: units.map((u) => u.getAttribute('aria-invalid') === 'true'),
        focus: units.indexOf(document.activeElement),
        borders: units.map((u) => getComputedStyle(u).borderTopColor),
        described: units.map((u) => { const id = u.getAttribute('aria-describedby'); return id ? (document.getElementById(id)?.textContent || '').trim() : ''; }),
      };
    });
    t.step('save is refused');
    await tap(M + '[data-save]');
    await sleep(500);
    const refused = await state();
    assert.equal(refused.open, true, 'the recipe is not saved without its units');
    assert.deepEqual(refused.invalid, [false, true, true], 'the two lines without a unit are marked, the complete one is not');
    assert.equal(refused.focus, 1, 'the first unit to choose has the focus');
    assert.notEqual(refused.borders[1], refused.borders[0], 'a marked unit does not look like a chosen one');
    assert.notEqual(refused.borders[2], refused.borders[0], 'the second marked unit, without the focus, stands out too');
    assert.ok(refused.described[1].length > 3 && !refused.described[0], 'the marked line says what is missing, in words');

    t.step('choosing a unit clears the mark');
    const choose = (i) => page.evaluate((i) => { const s = document.querySelectorAll('.rmw-recipe-modal [data-ing-unit]')[i]; s.value = [...s.options].find((o) => o.value).value; s.dispatchEvent(new Event('change', { bubbles: true })); }, i);
    await choose(1);
    await sleep(200);
    assert.deepEqual((await state()).invalid, [false, false, true], 'the mark leaves the line whose unit was chosen, and only that one');
    await choose(2);
    await tap(M + '[data-save]');
    await sleep(700);
    assert.equal((await state()).open, false, 'with every unit chosen the recipe saves');
    assert.equal(await page.evaluate(() => {
      const x = window.KiwiMenuStore.items().find((it) => JSON.stringify(it.name).includes('Salade test'));
      const r = window.KiwiRestaurantRecipes.get(x.id, x.name);
      return r ? r.ingredients.length : -1;
    }), 3, 'the three lines are in the saved recipe');
  });
} finally {
  await h.close();
  await h.S.finish();
}

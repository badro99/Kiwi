#!/usr/bin/env node
/* Kiwi · boutique-escape-browser-test · aucune salle sans porte.
 *
 * Deux écrans de la caisse boutique enfermaient la caissière — signalés le
 * même jour par la propriétaire (2026-10-28), sur sa tablette :
 *
 *   1 · « Clientes » ouvre #kcb-root, un calque fixe que clients-book.js
 *       retire de la largeur du rail. Sa recherche de rail ne connaissait que
 *       `#kit-rail` (restaurant), `.sidebar` et `nav[class$="-nav"]`. Sous la
 *       peau 2027 le rail de la boutique est `#bq-kit-rail`, et le `<nav
 *       class="bq-nav">` livré est réduit à une largeur NULLE pour éteindre la
 *       barre d'origine : une bande de 0 px passait les deux tests, le retrait
 *       tombait à zéro, le carnet couvrait le rail et plus rien ne sortait.
 *
 *   2 · « Inventaire physique » pose son gestionnaire en `modal.onclick`, ce
 *       qui ÉCRASE celui de la caisse — donc le clic sur le voile. Il n'avait
 *       ni croix ni Échap, et son `window.closeSkModal` n'a jamais existé
 *       (c'est une fonction locale de assets/caisse/inventory.js). Quatre
 *       sorties, quatre mortes, dans les DEUX peaux : ce second piège est
 *       antérieur à la peau 2027.
 *
 * Ce banc mesure les sorties dans un vrai navigateur, peau allumée ET éteinte,
 * parce que la régression de l'une ne dit rien de l'autre.
 *   node tools/boutique-escape-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-escape');
let n = 0, bad = 0;
const ok = (cond, msg) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };

for (const skin of ['1', '0']) {
  const label = skin === '1' ? 'peau 2027' : 'peau livrée';
  const { ctx, page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:till': skin, 'kiwiSkin2027:dashboard': '0' });
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(500);
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
  await sleep(1200);

  /* ── 1 · le carnet des clientes ne couvre jamais le rail ───────────────── */
  await page.evaluate(() => document.querySelector('#bq-nav .bq-nav-it[data-bq-view="clientes"]').click());
  /* #kcb-root est `position:fixed` : son offsetParent est toujours nul. */
  await page.waitForFunction(() => { const k = document.getElementById('kcb-root'); return !!k && getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0; }, { timeout: 15000 });
  await sleep(600);
  const seen = await page.evaluate(() => {
    const rail = document.querySelector('#bq-kit-rail') || document.querySelector('#pos-boutique .bq-rail');
    const r = rail.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + 140));
    return { w: Math.round(r.width), reachable: rail.contains(hit), inset: getComputedStyle(document.getElementById('kcb-root')).inset };
  });
  ok(seen.w >= 8, `${label} · le rail a une largeur réelle (${seen.w}px)`);
  ok(seen.reachable, `${label} · Clientes ouvert, le rail reste cliquable (retrait ${seen.inset})`);

  /* ── 2 · le comptage physique a quatre sorties, et aucune ne coûte la saisie ── */
  await page.evaluate(() => document.querySelector('#bq-nav .bq-nav-it[data-bq-view="inventaire"]').click());
  await sleep(900);
  const shown = () => page.evaluate(() => { const v = document.getElementById('sk-modal'); return !!v && v.classList.contains('is-open'); });
  const openIt = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#pos-boutique button')].find((x) => /Inventaire physique/i.test(x.textContent));
      if (b) b.click();
    });
    await sleep(900);
  };

  await openIt();
  ok(await shown(), `${label} · le comptage s'ouvre`);
  ok(await page.evaluate(() => !!document.querySelector('#sk-modal [data-cnt-close]')), `${label} · une croix est présente`);
  await page.evaluate(() => document.querySelector('#sk-modal [data-cnt-close]').click());
  await sleep(400);
  ok(!(await shown()), `${label} · la croix referme`);

  await openIt();
  await page.evaluate(() => {
    const b = document.getElementById('sk-modal-box').getBoundingClientRect();
    const x = Math.max(6, Math.round(b.x / 2)), y = Math.round(window.innerHeight / 2);
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  });
  await sleep(400);
  ok(!(await shown()), `${label} · le clic sur le voile referme`);

  await openIt();
  await page.keyboard.press('Escape');
  await sleep(400);
  ok(!(await shown()), `${label} · Échap referme`);

  await openIt();
  const key = await page.evaluate(() => {
    const i = document.querySelector('#sk-modal [data-cnt-input]');
    if (!i) return null;
    i.value = '7'; i.dispatchEvent(new Event('input', { bubbles: true }));
    return i.dataset.cntInput;
  });
  ok(key !== null, `${label} · une ligne de comptage est saisissable`);
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(400);
  await openIt();
  const kept = await page.evaluate((k) => { const i = document.querySelector(`#sk-modal [data-cnt-input="${k}"]`); return i ? i.value : null; }, key);
  ok(String(kept) === '7', `${label} · fermer ne coûte pas la saisie (relu : ${kept})`);
  await page.keyboard.press('Escape');
  await ctx.close();
}

await h.close();
if (bad) { console.log(`\n✗ boutique-escape-browser-test · ${bad} sortie(s) murée(s)`); process.exit(1); }
console.log(`\n✓ boutique-escape-browser-test · ${n} contrôles, les deux peaux`);

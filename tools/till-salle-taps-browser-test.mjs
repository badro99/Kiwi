#!/usr/bin/env node
// Un doigt posé sur la caisse restaurant atteint ce qu'il vise. Trois défauts
// filmés ou trouvés le 26 nov. 2026 (iPad, « Ouvrir la table » qui sautait de
// la 11 à la 2 puis à la 8) :
//   1. le halo d'appel d'une table occupée (un disque SVG de 1,45 × sa taille,
//      qui déborde du nœud) prenait les touchers de la table libre voisine, et
//      un meuble du plan (banquette) prenait ceux de la table posée dessous ;
//   2. « Envoyer en cuisine » disparaît en envoyant, « Encaisser » remonte à sa
//      place : le second toucher d'un double toucher ouvrait l'encaissement ;
//   3. sur une carte étroite du menu, le compteur « − 1 + » sortait de la carte
//      et recouvrait le prix.
// Clics réels uniquement (page.mouse), jamais el.click().
import assert from 'node:assert/strict';
import { harness, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('till-salle-taps');

const box = (page, sel) => page.evaluate((s) => {
  const e = [...document.querySelectorAll(s)].find((n) => n.getBoundingClientRect().width > 0);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.top, bottom: b.bottom };
}, sel);
const cashOpen = (page) => page.evaluate(() => document.getElementById('cash-modal').classList.contains('is-open'));

/* Chaque table visible, sondée au centre et aux quatre quarts de son plateau :
   qui répond ? */
const PROBE = () => [...document.querySelectorAll('.cplan-tbl')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
  const b = e.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(e).getPropertyValue('--pad')) || 0;
  const k = b.width / e.offsetWidth;                       // échelle du plan
  const w = b.width - 2 * pad * k, hh = b.height - 2 * pad * k;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const wrong = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]].map(([dx, dy]) => {
    const hit = document.elementFromPoint(cx + dx * w, cy + dy * hh);
    const own = hit && hit.closest('.cplan-tbl');
    return own === e ? null : (own ? own.dataset.table : (hit ? String(hit.className.baseVal ?? hit.className).slice(0, 24) || hit.tagName : 'rien'));
  }).filter(Boolean);
  return { id: e.dataset.table, status: e.dataset.status, x: cx, y: cy, wrong };
});

async function openSalle(page) {
  await page.click('.mode-pill[data-mode="salle"]');
  await page.waitForSelector('.view-salle.is-active .cplan-tbl', { visible: true, timeout: 10000 });
  await sleep(700);
}
async function openFreeTable(page, t) {
  const free = (await page.evaluate(PROBE)).filter((x) => x.status === 'khawya');
  assert.ok(free.length, 'la démo a une table libre');
  t.step('tap the free table ' + free[0].id + ' and open it');
  await page.mouse.click(free[0].x, free[0].y);
  await page.waitForSelector('#new-table-modal.is-open', { visible: true, timeout: 5000 });
  await sleep(400);
  await page.click('#nt-confirm');
  await page.waitForFunction(() => document.body.dataset.mode === 'order', { timeout: 5000 });
  await sleep(700);
  return free[0].id;
}

try {
  await h.S.run('plan de salle : le toucher atteint la table visée, à chaque étage', async (t) => {
    const { page } = await openTill(h, t, 'caisse-restaurant', 'fr', 'tablet');
    await openSalle(page);
    const floors = await page.$$eval('.floor-pill', (els) => els.map((e) => e.dataset.floor));
    assert.ok(floors.length >= 2, 'la démo a deux étages');
    const missed = [], seen = [];
    for (const f of floors) {
      t.step('floor ' + f + ': probe every table face');
      await page.click(`.floor-pill[data-floor="${f}"]`);
      await sleep(700);
      const tables = await page.evaluate(PROBE);
      seen.push(...tables);
      for (const x of tables) if (x.wrong.length) missed.push(`${x.id} (étage ${f}) → ${x.wrong.join(', ')}`);
      /* La preuve par le geste : un vrai toucher au centre de chaque table
         libre propose d'ouvrir CETTE table. */
      for (const x of tables.filter((y) => y.status === 'khawya')) {
        await page.mouse.click(x.x, x.y);
        const opened = await page.waitForSelector('#new-table-modal.is-open', { visible: true, timeout: 2500 }).then(() => true, () => false);
        const title = opened ? await page.$eval('#nt-title', (e) => e.textContent.trim()) : '(rien ne s\'ouvre)';
        if (!new RegExp('\\b' + x.id + '$').test(title)) missed.push(`toucher ${x.id} (étage ${f}) → ${title}`);
        if (opened) { await sleep(300); await page.click('#nt-cancel'); await sleep(400); }
        else {
          /* Une table occupée s'est ouverte à la place : on referme sa note. */
          await page.click('.mode-pill[data-mode="salle"]'); await sleep(500);
        }
      }
    }
    assert.ok(seen.some((x) => x.status === 'ka-yaklo' || x.status === 'bgha-ykhlass'), 'le plan sondé porte des tables à halo');
    assert.ok(seen.filter((x) => x.status === 'khawya').length >= 3, 'et des tables libres');
    assert.deepEqual(missed, [], 'chaque plateau répond pour lui-même');
  });

  await h.S.run('double toucher sur « Envoyer en cuisine » : envoie une fois, n\'encaisse pas', async (t) => {
    const { page } = await openTill(h, t, 'caisse-restaurant', 'fr', 'tablet');
    await openSalle(page);
    await openFreeTable(page, t);
    await page.click('.menu-item[data-menu-id]');
    await sleep(500);

    t.step('double tap on the order panel\'s send button');
    const send = await box(page, '#validate-order');
    await page.mouse.click(send.x, send.y);
    await sleep(60);
    await page.mouse.click(send.x, send.y);
    await sleep(900);
    assert.equal(await page.evaluate(() => document.body.dataset.mode), 'salle', 'la commande est partie');
    assert.equal(await cashOpen(page), false, 'le second toucher n\'ouvre pas l\'encaissement');

    t.step('a deliberate tap on Encaisser, a moment later, still works');
    await sleep(600);
    await page.click('#pay-charge');
    await sleep(600);
    assert.equal(await cashOpen(page), true, 'Encaisser répond à un toucher voulu');
    await page.click('#cash-cancel');
    await sleep(500);

    t.step('a round added to the open table: same double tap, same answer');
    await page.click('#rp-add-items');
    await sleep(700);
    await page.click('.menu-item[data-menu-id]');
    await sleep(400);
    const again = await box(page, '#validate-order');
    await page.mouse.click(again.x, again.y);
    await sleep(60);
    await page.mouse.click(again.x, again.y);
    await sleep(900);
    assert.equal(await page.evaluate(() => document.body.dataset.mode), 'salle', 'la suite est partie');
    assert.equal(await cashOpen(page), false, 'le second toucher n\'ouvre pas l\'encaissement');
    assert.equal(await page.evaluate(() => (document.querySelector('#rp-items').textContent.match(/\d+(?=×)/g) || []).reduce((n, q) => n + +q, 0)), 2, 'deux unités sur la note, chacune envoyée une fois');
  });

  await h.S.run('menu : le compteur d\'une carte étroite reste dans la carte, hors du prix', async (t) => {
    const { page } = await openTill(h, t, 'caisse-restaurant', 'fr', 'tablet');
    await openSalle(page);
    await openFreeTable(page, t);
    t.step('put the first three dishes (one per column) in the order');
    const ids = await page.$$eval('.menu-item[data-menu-id]', (els) => els.slice(0, 3).map((e) => e.dataset.menuId));
    for (const id of ids) { await page.click(`.menu-item[data-menu-id="${id}"] .menu-item-name`); await sleep(350); }
    const cards = await page.evaluate((ids) => ids.map((id) => {
      const card = document.querySelector(`.menu-item[data-menu-id="${id}"]`);
      const c = card.getBoundingClientRect();
      const s = card.querySelector('.menu-item-stepper').getBoundingClientRect();
      const p = card.querySelector('.menu-item-price').getBoundingClientRect();
      const plus = card.querySelector('.step-plus').getBoundingClientRect();
      const top = document.elementFromPoint(plus.x + plus.width / 2, plus.y + plus.height / 2);
      return {
        id, inside: s.left >= c.left - 0.5 && s.right <= c.right + 0.5,
        clear: s.right <= p.left + 0.5 || s.left >= p.right - 0.5 || s.top >= p.bottom - 0.5 || s.bottom <= p.top + 0.5,
        plusReachable: !!top && !!top.closest('.step-plus') && card.contains(top),
        detail: `carte ${Math.round(c.left)}–${Math.round(c.right)}, compteur ${Math.round(s.left)}–${Math.round(s.right)}, prix ${Math.round(p.left)}–${Math.round(p.right)}`,
      };
    }), ids);
    assert.equal(cards.length, 3);
    for (const c of cards) {
      assert.ok(c.inside, `${c.id} : le compteur tient dans la carte (${c.detail})`);
      assert.ok(c.clear, `${c.id} : le compteur ne recouvre pas le prix (${c.detail})`);
      assert.ok(c.plusReachable, `${c.id} : le + du compteur est sous le doigt`);
    }
    t.step('the + of the stepper adds one');
    await page.click(`.menu-item[data-menu-id="${ids[2]}"] .step-plus`);
    await sleep(350);
    assert.equal(await page.$eval(`.menu-item[data-menu-id="${ids[2]}"] .step-num`, (e) => e.textContent.trim()), '2');
  });
} finally { await h.close(); await h.S.finish(); }

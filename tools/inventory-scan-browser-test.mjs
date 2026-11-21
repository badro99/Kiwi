#!/usr/bin/env node
// « Scanner » sur l'inventaire boutique : n'importe quelle photo (carton,
// facture, reçu, article) part à l'assistant, qui s'ouvre et l'analyse, sans
// passer par la conversation. Demandé le 21 nov. 2026 (Amira Boutique).
// La route du modèle est simulée ; la boutique de démo est synthétique.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('inventory-scan');
const temp = await mkdtemp(path.join(os.tmpdir(), 'kiwi-inventory-scan-'));
const png = path.join(temp, 'carton.png');
await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=', 'base64'));
const READING = {
  docType: 'boutique_product', categoryLabel: 'Étiquette de carton', confidence: 0.93, reviewNeeded: false,
  title: 'Carton 1986-10 KHAKI', summary: 'Étiquette de carton : 12 paires, pointures 36 à 41.',
  entities: { supplier: '', date: '', invoiceNumber: '', totalMad: 0, items: [], reference: '1986-10', color: 'KHAKI', packQty: 12,
    sizeRun: [['36', 1], ['37', 2], ['38', 3], ['39', 3], ['40', 2], ['41', 1]].map(([size, qty]) => ({ size, qty })) },
  suggestedActions: [],
};
const venue = { id: 'matrix-scan', name: 'Matrix Scan', fullDisplay: 'Matrix Scan', slug: 'matrix-scan',
  type: 'boutique', custom: true, location: '', siblings: '', status: '', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0 };
try {
  for (const viewport of ['desktop', 'phone']) await h.S.run(`the inventory scan button sends any photo to the assistant · fr · ${viewport}`, async (t) => {
    // coverage: surface=dashboard locale=fr viewport=desktop
    let sent = 0;
    const { ctx, page } = await demoPage(h, 'fr', viewport, {
      kiwiCustomVenues: JSON.stringify([venue]), kiwiVenue: venue.id, kiwiOnboarded: '1',
    }, { 'POST /api/ai/vision-inspect': () => { sent++; return { status: 200, body: { ok: true, data: READING } }; } });
    t.defer(() => ctx.close()); t.watch(page);
    t.step('open the inventory of the demo boutique');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-nav="inventory"]', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-nav="inventory"]').click());
    const btn = await page.waitForSelector('[data-action="bqx-scan"]', { visible: true, timeout: 15000 });
    const label = await page.$eval('[data-action="bqx-scan"]', (b) => b.textContent.trim());
    assert.equal(label, 'Scanner', 'the button says what it does, in French');
    t.step('tap Scanner and pick a photo: the assistant opens and reads it');
    const choosing = page.waitForFileChooser();
    await btn.click();
    const chooser = await choosing;
    assert.match(chooser.isMultiple() ? '' : 'single', /single/, 'one photo at a time');
    await chooser.accept([png]);
    await page.waitForSelector('.fa-drawer [data-ksr-open]', { visible: true, timeout: 20000 });
    assert.equal(sent, 1, 'exactly one analysis request');
    const rows = await page.$$eval('.fa-drawer [data-ksr-size]', (r) => r.length);
    assert.equal(rows, 6, 'the analysis lands in the assistant like a photo attached there');
    const thread = await page.$eval('.fa-drawer', (el) => el.textContent);
    assert.ok(thread.includes('carton.png'), 'the photo shows in the conversation, so the merchant sees what was sent');
  });
} finally { await rm(temp, { recursive: true, force: true }); await h.close(); await h.S.finish(); }

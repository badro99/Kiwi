#!/usr/bin/env node
/* Réservation publique · changer de langue avec une erreur d'envoi incertaine
 * à l'écran (i18n#A2).
 *
 * Une réponse illisible à un envoi (2xx sans JSON) n'est ni un succès ni un
 * échec franc : la réservation a peut-être été enregistrée, et le message dit
 * de réessayer depuis cette page avec la même référence. Si la cliente change
 * de langue à ce moment, la page se redessine ; ce message ne doit ni
 * disparaître (elle croirait que rien ne s'est passé) ni rester dans l'ancienne
 * langue. Parcours réel (Chromium, téléphone, réponses simulées) :
 *  1 · envoi, réponse illisible : message d'incertitude en français ;
 *  2 · FR -> EN puis EN -> AR : le même message, dans la langue choisie, le
 *      brouillon (nom, téléphone) intact, le bouton prêt à réessayer ;
 *  3 · on réessaie : la requête repart avec la MÊME référence, et la
 *      confirmation s'affiche dans la langue courante, sans message résiduel.
 * L'API est simulée ; le serveur réel est couvert par booking-properties-test. */
import assert from 'node:assert/strict';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('booking-language-uncertain');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const posts = [];
let reply = 'unreadable';

await h.S.run('envoi incertain · changement de langue', async (t) => {
  const { ctx, page } = await demoPage(h, 'fr', 'phone', { kiwiBookingLang: 'fr' });
  t.watch(page); t.defer(() => ctx.close());
  page.removeAllListeners('request');
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === h.base && u.pathname === '/api/booking') {
      if (r.method() === 'POST') {
        posts.push(JSON.parse(r.postData() || '{}'));
        if (reply === 'unreadable') return r.respond({ status: 200, contentType: 'application/json', body: '<html>proxy page, not json' });
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, code: 'R-1A2B3C4D', status: 'confirmed', manageToken: 'a'.repeat(32), startAt: Date.now() + 864e5 }) });
      }
      const date = u.searchParams.get('date');
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
        name: 'Hammam Test', tz: 'Africa/Casablanca', hoursSet: true,
        services: [{ id: 's1', name: 'Hammam', duration: 60, price: 200, maxParty: 4 }],
        ...(date ? { slots: [10, 11, 12].map((hour) => ({ startAt: Date.parse(date + 'T' + hour + ':00:00Z') })) } : {}),
      }) });
    }
    if (u.origin === h.base && u.pathname.startsWith('/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return r.url().startsWith(h.base + '/') || r.url().startsWith('data:') ? r.continue() : r.abort();
  });
  // coverage: surface=booking locale=fr viewport=phone
  await page.goto(h.base + '/booking.html?merchant=hammam-test', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-service]', { visible: true });
  await sleep(400);
  await page.tap('[data-service]');
  await page.waitForSelector('[data-slot]', { visible: true });
  await page.focus('[data-slot]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-form] input[name="name"]', { visible: true });
  await page.type('[data-form] input[name="name"]', 'TEST KIWI Cliente');
  await page.type('[data-form] input[name="phone"]', '+212612345678');

  t.step('submit, the reply is unreadable');
  await page.click('[data-form] [type="submit"]');
  await page.waitForFunction(() => /Confirmation illisible/.test((document.querySelector('[data-error]') || {}).textContent || ''), { timeout: 10000 });
  check(true, 'réponse illisible : message d’incertitude en français');
  const ref = posts[0].ref;
  check(!!ref, 'la requête porte une référence de réessai');

  const error = () => page.$eval('[data-error]', (e) => e.textContent);
  t.step('switch to English with the error open');
  await page.click('[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  check(/could not be read/.test(await error()), 'FR -> EN : le message incertain reste, en anglais (' + (await error()).slice(0, 40) + ')');
  check(await page.$eval('[data-form] input[name="name"]', (e) => e.value) === 'TEST KIWI Cliente', 'le brouillon est intact');
  t.step('switch to Arabic');
  await page.click('[data-lang="ar"]');
  await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
  check(/تعذّر قراءة تأكيد الحجز/.test(await error()), 'EN -> AR : le même message, en arabe');
  check(await page.$eval('[data-form] [type="submit"]', (b) => !b.disabled), 'le bouton est prêt à réessayer');

  t.step('retry with the same reference');
  reply = 'ok';
  await page.click('[data-form] [type="submit"]');
  await page.waitForSelector('.bk-success', { timeout: 10000 });
  check(posts.length === 2 && posts[1].ref === ref, 'le réessai repart avec la même référence');
  check(posts[1].lang === 'ar', 'et dans la langue courante');
  check(await page.$('[data-error]') === null || (await error()) === '', 'la confirmation ne garde aucun message d’incertitude');
});

await h.close();
await h.S.finish();

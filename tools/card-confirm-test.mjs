#!/usr/bin/env node
/* Kiwi · « Carte » sans lecteur n'écrit jamais la vente toute seule.
 *
 * Sur une vraie caisse sans terminal certifié, readCard() rend un verdict
 * « enregistré, terminal externe » : c'est une DÉCLARATION, rien ne dit que le
 * client a payé. Les caisses de métier attendaient quelques secondes puis
 * appelaient finishSale('carte'), sans que personne ait confirmé. Le verdict
 * partagé (KiwiHardware.authorizeCard) exige maintenant un geste explicite du
 * caissier ; fermer la fenêtre, c'est refuser ; la démo ne change pas. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../assets/caisse-hardware.js', import.meta.url), 'utf8');
let passed = 0;
const ok = (c, l) => { assert.ok(c, l); passed++; };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* Un DOM minimal : assez pour poser un bouton sous la ligne de statut et savoir
   s'il est encore dans la page. */
function fakeDom() {
  const mounted = new Set();
  const body = { contains: (n) => mounted.has(n) };
  const parent = {
    insertBefore(node) { mounted.add(node); node.parentNode = parent; },
    removeChild(node) { mounted.delete(node); node.parentNode = null; },
  };
  const document = {
    body,
    createElement(tag) {
      const listeners = {};
      return {
        tag, style: {}, disabled: false, parentNode: null, textContent: '',
        setAttribute() {}, addEventListener(t, f) { listeners[t] = f; },
        click() { if (!this.disabled && listeners.click) listeners.click(); },
      };
    },
  };
  const status = { textContent: '', parentNode: parent, nextSibling: null, classList: { add() {}, remove() {} } };
  const disc = { classList: { add() {}, remove() {} }, replaceChildren() {} };
  return { document, status, disc, parent, mounted };
}

function runtime(real, extra = {}) {
  const dom = fakeDom();
  const ctx = {
    navigator: {}, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem() { return null; } },
    document: dom.document, KiwiEnv: { isReal() { return real; } }, ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  new vm.Script(src, { filename: 'assets/caisse-hardware.js' }).runInContext(ctx);
  return { hw: ctx.KiwiHardware, dom };
}
const button = (dom) => [...dom.mounted][0];

/* 1 · vraie caisse : rien n'est approuvé tant que le caissier n'a pas confirmé */
{
  const { hw, dom } = runtime(true);
  let result = null;
  hw.authorizeCard(125, dom.disc, dom.status).then((r) => { result = r; });
  await tick(60);
  ok(result === null, 'real till: the card is NOT approved by a timer');
  ok(dom.mounted.size === 1 && /125,00 MAD/.test(button(dom).textContent), 'real till: a confirm button names the amount to be checked');
  ok(/puis confirmez/.test(dom.status.textContent), 'real till: the status tells the cashier what to do');
  button(dom).click();
  await tick();
  ok(result && result.approved === true && result.recordOnly === true, 'real till: an explicit tap approves, still labelled record-only');
  ok(dom.mounted.size === 0, 'real till: the button is removed once answered');
  ok(/terminal externe/.test(dom.status.textContent), 'real till: the status then says it is an external-terminal record');
}

/* 2 · fermer la fenêtre = refuser */
{
  const { hw, dom } = runtime(true);
  let result = null;
  hw.authorizeCard(80, dom.disc, dom.status).then((r) => { result = r; });
  await tick(60);
  dom.mounted.clear();                          /* le caissier ferme la fenêtre de paiement */
  await tick(500);
  ok(result && result.approved === false && result.reason === 'cashier-not-confirmed', 'closing the window refuses the card, nothing is recorded');
  ok(/rien n'a été enregistré/.test(dom.status.textContent), 'the refusal says so');
}

/* 3 · sans ancre DOM : la confirmation passe par une boîte, jamais en silence */
{
  const yes = runtime(true, { confirm: () => true });
  const noAnchor = { textContent: '', classList: { add() {}, remove() {} } };
  const approved = await yes.hw.authorizeCard(40, null, noAnchor);
  ok(approved.approved === true, 'no anchor: a "yes" in the confirm box approves');
  const no = runtime(true, { confirm: () => false });
  const refused = await no.hw.authorizeCard(40, null, { textContent: '' });
  ok(refused.approved === false && refused.reason === 'cashier-not-confirmed', 'no anchor: a "no" refuses');
  const none = runtime(true);
  const failClosed = await none.hw.authorizeCard(40, null, null);
  ok(failClosed.approved === false, 'no anchor and no confirm box: fails closed, never auto-approves');
}

/* 4 · l'appelant qui a déjà sa confirmation (restaurant) n'est pas redemandé */
{
  const { hw, dom } = runtime(true);
  const result = await hw.authorizeCard(60, dom.disc, dom.status, { cashierConfirmed: true });
  ok(result.approved === true && result.recordOnly === true && dom.mounted.size === 0, 'cashierConfirmed: approved at once, no second prompt');
}

/* 5 · inchangé : la démo et la pré-autorisation d'hôtel */
{
  const { hw, dom } = runtime(false);
  const demo = await hw.authorizeCard(50, dom.disc, dom.status);
  ok(demo.approved === true && demo.mock === true && dom.mounted.size === 0, 'demo: still approves at once, no button');
  const real = runtime(true);
  const pre = await real.hw.authorizeCard(50, real.dom.disc, real.dom.status, { capture: false, purpose: 'deposit' });
  ok(pre.approved === false && pre.reason === 'payment-terminal-not-configured', 'hotel pre-authorization still needs a real terminal');
}

/* 6 · le restaurant, qui a son propre bouton, le dit à l'adaptateur */
{
  const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
  ok(/hw\.authorizeCard\(currentTotal\(\) \+ payTipAmount\(\), reader\.disc, reader\.status, \{ cashierConfirmed: true \}\)/.test(caisse), 'restaurant: its confirm button passes cashierConfirmed');
}

console.log(`✓ card confirmation (${passed} controls)`);

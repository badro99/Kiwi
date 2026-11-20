#!/usr/bin/env node
/* Caisse maison · la feuille « Avoir en paiement » (assets/pos-maison/avoir-sheet.js).
 *
 * Un avoir appartient à sa cliente. La feuille montre ceux de la cliente du
 * ticket, en choisit un d'office quand il n'y en a qu'un, et écrit avant de
 * valider ce qui reste à payer et ce qui restera sur le bon. L'avoir de
 * quelqu'un d'autre ne s'ouvre qu'avec son code complet : ni un nom ni un
 * bout de code ne le listent. Ce test tient ces règles sur le vrai module. */
import assert from 'node:assert/strict';
import { avoirView, refusal, foldCode, codeKey, cleanCode } from '../assets/pos-maison/avoir-sheet.js';

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

const day = 864e5, now = Date.parse('2026-11-20T12:00:00Z');
const av = (code, holderName, balance, extra = {}) => ({ code, holderId: extra.holderId || null, holderName, balance, motif: extra.motif || 'Retour', at: new Date(now), until: new Date(extra.until || now + 60 * day) });
const sara = av('AV-7KQ2M9', 'Sara Bennani', 300, { holderId: 'c-sara' });
const saraSoon = av('AV-3PX1T0', 'Sara Bennani', 120, { holderId: 'c-sara', until: now + 3 * day, motif: 'Échange' });
const nadia = av('AV-9ZZ4K2', 'Nadia Élalami', 80, { holderId: 'c-nadia' });
const all = [sara, saraSoon, nadia];
const codes = (v) => v.list.map((a) => a.code);

/* La cliente du ticket a un seul avoir : il est déjà choisi, le calcul est prêt. */
let v = avoirView({ mine: [nadia], all, portion: 450, due: 450 });
eq([v.mode, v.chosen && v.chosen.code, v.take, v.rest, v.left], ['mine', 'AV-9ZZ4K2', 80, 370, 0],
  'one credit for the ticket client: picked without a tap, 80 off 450 leaves 370');

/* Deux avoirs : aucun n'est choisi d'office, celui qui expire le premier passe devant. */
v = avoirView({ mine: [sara, saraSoon], all, portion: 450, due: 450 });
eq([v.chosen, codes(v)], [null, ['AV-3PX1T0', 'AV-7KQ2M9']], 'two credits: the cashier chooses, the one expiring first is listed first');

/* Un avoir plus gros que le ticket : on ne prend que le dû, le reste demeure sur le bon. */
v = avoirView({ mine: [sara, saraSoon], all, picked: 'AV-7KQ2M9', portion: 249.5, due: 249.5 });
eq([v.take, v.rest, v.left], [249.5, 0, 50.5], 'a 300 credit on a 249.50 ticket takes 249.50, pays it in full, and leaves 50.50 on the voucher');

/* Ses avoirs se filtrent par motif ou bout de code ; ceux des autres n'y entrent jamais. */
v = avoirView({ query: 'echange', mine: [sara, saraSoon], all, portion: 100, due: 100 });
eq(codes(v), ['AV-3PX1T0'], 'the reason, typed without its accent, narrows the client\'s own credits');
v = avoirView({ query: 'nadia', mine: [sara, saraSoon], all, portion: 100, due: 100 });
eq([v.mode, codes(v)], ['search', []], 'another customer\'s name never lists her credit');

/* Vente sans cliente : rien n'est listé, seul un code complet ouvre un avoir. */
v = avoirView({ mine: [], all, portion: 100, due: 100 });
eq([v.mode, v.list, v.chosen], ['walkin', [], null], 'a walk-in sale lists nobody\'s credits');
v = avoirView({ query: 'Sara', mine: [], all, portion: 100, due: 100 });
eq([v.mode, v.list], ['walkin', []], 'a walk-in sale cannot find a credit by its holder\'s name');
v = avoirView({ query: 'AV-7KQ', mine: [], all, portion: 100, due: 100 });
eq([v.mode, v.list], ['walkin', []], 'a walk-in sale cannot list credits from a partial code');

/* Le code complet, même recopié à la main : minuscules, sans tiret, O pour 0, marques bidi d'un copier-coller arabe. */
v = avoirView({ query: '⁦av7kq2m9⁩', mine: [], all, portion: 500, due: 500 });
eq([v.mode, v.chosen && v.chosen.code, v.rest], ['code', 'AV-7KQ2M9', 200], 'the full code, typed lowercase without its dash inside bidi marks, opens that credit');
v = avoirView({ query: 'AV-3PXLTO', mine: [nadia], all, portion: 500, due: 500 });
eq([codes(v), v.chosen && v.chosen.code], [['AV-3PX1T0'], 'AV-3PX1T0'], 'a full code with L for 1 and O for 0 opens it, even with another client on the ticket');
eq(foldCode('av-3pxlto'), 'AV-3PX1T0', 'the fold matches the register: O→0, I and L→1');
eq(codeKey('av3pxlto'), codeKey('AV-3PX1T0'), 'the comparison key ignores the dash');
eq(cleanCode(' av-7kq2 m9‏'), 'AV-7KQ2M9', 'the code sent to the register is upper case, without spaces or bidi marks');

/* La raison d'un refus, écrite. */
const rules = { expired: (a) => +a.until < now, active: (a) => a.balance > 0, untilOf: () => '12/11/2026' };
eq(refusal(null, rules), 'Aucun avoir avec ce code, vérifiez-le sur le bon.', 'an unknown code says so');
eq(refusal(av('AV-OLD', 'X', 50, { until: now - day }), rules), 'Cet avoir a expiré le 12/11/2026.', 'an expired credit gives its date');
eq(refusal(av('AV-USED', 'X', 0), rules), 'Cet avoir est déjà entièrement utilisé.', 'a spent credit says it is used up');
eq(refusal(sara, rules), '', 'a valid credit is not refused');

console.log(`✓ maison avoir sheet · ${passed} checks`);

#!/usr/bin/env node
/* Caisse maison · le rafraîchissement après catalogue (assets/pos-maison/catalog-settle.js).
 *
 * Au déverrouillage, le catalogue arrive en plusieurs fois (copie locale, base
 * de l'appareil, serveur) et chaque arrivée redessinait toute la vente : la
 * caisse restait figée (20 nov. 2026). Un redessin sous le doigt avale aussi le
 * toucher (CLAUDE.md §5). Ce test tient les deux règles sur le vrai module :
 * plusieurs arrivées, un seul redessin ; jamais pendant qu'un doigt est posé. */
import assert from 'node:assert/strict';
import { mzSettle } from '../assets/pos-maison/catalog-settle.js';

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

function fakeWin() {
  const on = {}, frames = [];
  return {
    on, frames,
    addEventListener: (t, f) => { (on[t] = on[t] || []).push(f); },
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    fire: (t) => (on[t] || []).forEach((f) => f({ type: t })),
    frame: () => { const fs = frames.splice(0); fs.forEach((f) => f()); },
  };
}

/* Trois arrivées dans la même image : un seul redessin. */
let w = fakeWin(), runs = 0;
let kick = mzSettle(() => runs++, w);
kick(); kick(); kick();
eq(runs, 0, 'nothing is redrawn inside the notification itself');
w.frame();
eq(runs, 1, 'three catalog arrivals in one frame give one redraw');
w.frame();
eq(runs, 1, 'and no second one after');

/* Un doigt posé : le redessin attend qu'il se lève. */
w = fakeWin(); runs = 0;
kick = mzSettle(() => runs++, w);
w.fire('pointerdown');
kick(); w.frame();
eq(runs, 0, 'a finger on the glass holds the redraw back');
w.fire('pointerup');
eq(runs, 0, 'the release itself does not redraw (the tap lands first)');
w.frame();
eq(runs, 1, 'the next frame after the release redraws once');

/* Un toucher annulé libère aussi. */
w = fakeWin(); runs = 0;
kick = mzSettle(() => runs++, w);
w.fire('pointerdown'); kick(); w.fire('pointercancel'); w.frame();
eq(runs, 1, 'a cancelled touch releases the redraw too');

/* flush() redessine tout de suite ce qui attend (fermeture d'une reprise de stock). */
w = fakeWin(); runs = 0;
kick = mzSettle(() => runs++, w);
kick(); kick.flush(); w.frame();
eq(runs, 1, 'flush redraws now, and the pending frame does not repeat it');
kick.flush();
eq(runs, 1, 'flush with nothing pending does nothing');

/* Sans fenêtre (banc vm) : redessin immédiat, comme avant. */
runs = 0;
kick = mzSettle(() => runs++, null);
kick();
eq(runs, 1, 'without a window the redraw stays synchronous');

console.log(`✓ maison catalog settle · ${passed} checks`);

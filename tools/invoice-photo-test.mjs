// Le scan stock lit aussi une PHOTO de bon de livraison ou de facture
// (20 nov. 2026 : un bon de livraison photographié tombait sur une table vide,
// la route ne savait lire que le texte d'un PDF). La vraie route, sur la base
// de fixture : la photo part au modèle vision, revient en lignes validées,
// et une photo refusée ne coûte ni place du jour ni appel de modèle.
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as invoiceAi } from '../functions/api/ai/invoice.js';
import { VISION_PRIMARY, TEXT_PRIMARY } from '../functions/api/ai/_models.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const root = new URL('..', import.meta.url).pathname;
const f = await fixture(root);
const seen = [];
let reply = null;
f.env.AI = { async run(model, payload) { seen.push({ model, payload }); return reply; } };
const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
const calls = () => { try { const r = f.sql.prepare("SELECT calls FROM ai_usage_kind WHERE merchant=? AND kind='invoice'").get(f.merchant); return r ? Number(r.calls) : 0; } catch (_) { return 0; } };
const post = async (body) => {
  const res = await invoiceAi({ env: f.env, request: new Request('https://kiwi.test/api/ai/invoice', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ merchant: f.merchant, ...body }) }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(4000);

// Une photo valide : modèle vision, image dans le message, lignes validées.
reply = { response: JSON.stringify({ supplier: { name: 'Textiles Atlas' }, number: 'BL-1182', lines: [
  { label: 'Trench beige', qty: 6, unit: 'unité', unitCost: 280, total: 1680 },
  { label: 'Manteau rayé', qty: 4, unit: 'unité' },
] }) };
const ok = await post({ kind: 'image', image: photo });
assert.equal(ok.status, 200);
assert.equal(ok.body.ok, true, 'une photo de BL est lue');
assert.equal(ok.body.supplier.name, 'Textiles Atlas');
assert.equal(ok.body.number, 'BL-1182');
assert.deepEqual(ok.body.lines.map((l) => [l.label, l.qty]), [['Trench beige', 6], ['Manteau rayé', 4]], 'un BL sans prix garde ses quantités');
assert.equal(seen[0].model, VISION_PRIMARY, 'la photo part au modèle vision, pas au lecteur de texte');
const user = seen[0].payload.messages.find((m) => m.role === 'user');
assert.ok(Array.isArray(user.content) && user.content.some((p) => p.type === 'image_url' && p.image_url.url === photo), 'l’image voyage dans le message');
assert.equal(calls(), 1, 'une lecture = une place du jour');

// Le texte d'un PDF garde son lecteur.
seen.length = 0;
reply = { response: JSON.stringify({ lines: [{ label: 'Jean', qty: 2, unitCost: 150 }] }) };
const txt = await post({ kind: 'text', text: 'BL 12 · Jean x2 150' });
assert.equal(txt.body.ok, true);
assert.equal(seen[0].model, TEXT_PRIMARY, 'le texte reste chez le lecteur texte');

// Refus locaux : ni quota ni modèle.
seen.length = 0;
const before = calls();
const notImage = await post({ kind: 'image', image: 'data:text/html;base64,AAAA' });
const huge = await post({ kind: 'image', image: 'data:image/jpeg;base64,' + 'A'.repeat(3_000_000) });
const empty = await post({ kind: 'image' });
assert.deepEqual([notImage.status, huge.status, empty.status], [400, 413, 400], 'type faux, photo trop lourde, photo absente');
assert.equal(notImage.body.error, 'bad-image');
assert.equal(huge.body.error, 'image-too-large');
assert.equal((await post({ kind: 'pdf' })).body.error, 'unsupported-kind');
assert.equal(calls(), before, 'un refus ne coûte aucune place');
assert.equal(seen.length, 0, 'un refus n’appelle aucun modèle');

// Une photo illisible : repli manuel honnête, pas une erreur serveur.
reply = { response: 'je ne vois rien' };
const blur = await post({ kind: 'image', image: photo });
assert.equal(blur.status, 200);
assert.equal(blur.body.reason, 'unparsed');

console.log('✓ scan stock · une photo de bon de livraison ou de facture est lue par le modèle vision ; refus locaux gratuits ; photo illisible = saisie manuelle');

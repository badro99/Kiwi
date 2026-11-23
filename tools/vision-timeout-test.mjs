// vision-timeout-test · une lecture de document ne dépasse pas la minute.
// Propriétaire, 23 nov. 2026 (Pasta Corner, Safari, photo HEIC) : « Erreur lors de
// l'analyse du document. (Load failed) ». Le serveur attendait le modèle principal
// sans limite, puis le secours : Safari abandonne une requête après une minute
// environ. Chaque modèle a désormais 25 s ; passé ce délai le secours prend la main,
// et un secours trop lent aussi est une erreur nommée, rendue à temps.
import assert from 'node:assert/strict';
import { runVisionPair } from '../functions/api/ai/_vision.js';

const P = '@cf/zai-org/glm-5.3-flash', F = '@cf/google/gemma-4-26b-a4b-it';
const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA' } }] }], max_tokens: 10 };
const never = new Promise(() => {});
const envWith = (byModel) => ({ AI: { run: (model) => byModel[model]() } });
let n = 0;

{ // principal muet : le secours répond, dans le délai
  const t0 = Date.now();
  const out = await runVisionPair(envWith({ [P]: () => never, [F]: async () => ({ response: 'ok' }) }), P, F, payload, { timeoutMs: 80 });
  assert.equal(out.model, F);
  assert.ok(Date.now() - t0 < 1000, 'the fallback starts after the primary deadline');
  n++;
}
{ // les deux muets : une erreur nommée, pas une attente sans fin
  const t0 = Date.now();
  await assert.rejects(runVisionPair(envWith({ [P]: () => never, [F]: () => never }), P, F, payload, { timeoutMs: 80 }), /model-timeout/);
  assert.ok(Date.now() - t0 < 1000);
  n++;
}
{ // principal rapide : inchangé
  const out = await runVisionPair(envWith({ [P]: async () => ({ response: 'vite' }), [F]: () => never }), P, F, payload, { timeoutMs: 80 });
  assert.equal(out.model, P);
  n++;
}
{ // par défaut, deux délais tiennent sous la minute de Safari
  const { VISION_TIMEOUT_MS } = await import('../functions/api/ai/_vision.js');
  assert.ok(VISION_TIMEOUT_MS * 2 <= 55000 && VISION_TIMEOUT_MS >= 15000, String(VISION_TIMEOUT_MS));
  const src = (await import('node:fs')).readFileSync(new URL('../functions/api/ai/vision-inspect.js', import.meta.url), 'utf8');
  assert.match(src, /runVisionPair\([^)]*\{ timeoutMs: VISION_TIMEOUT_MS \}\)/, 'the assistant document read uses the deadline');
  n++;
}
console.log(`✓ vision-timeout · ${n} cases`);
process.exit(0);

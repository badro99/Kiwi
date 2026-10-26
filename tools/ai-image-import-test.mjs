import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(f, 'utf8');
const shared = read('assets/ai-image-import.js');
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function run(surface, legacy, scenario, width = 4000, height = 3000) {
  let timer, request, revoked = 0, drawn;
  const window = { Kiwi: { venue: () => 'fixture' } };
  const context = vm.createContext({window, Kiwi: window.Kiwi, AbortController,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    MAX_IMG_EDGE: 1600, language: () => 'fr', localStorage: {getItem: () => 'fr'},
    document: { documentElement: {lang: 'fr'}, createElement: () => ({
      getContext: () => ({drawImage: (...args) => { drawn = args.slice(1); }}),
      toDataURL: (...args) => JSON.stringify([drawn, args]),
    }) },
    URL: {createObjectURL: () => 'fixture', revokeObjectURL: () => { revoked++; }},
    Image: class { naturalWidth = width; naturalHeight = height; set src(_) { this.onload(); } },
    setTimeout(fn, ms) { assert.equal(ms, 45000); timer = fn; return 1; },
    clearTimeout() { timer = null; },
    fetch: async (url, opts) => {
      request = { url, body: JSON.parse(opts.body), signal: opts.signal };
      if (['timeout', 'cancel'].includes(scenario)) return new Promise(() => {});
      if (scenario === 'network') throw new Error('offline');
      const status = Number(scenario) || 200;
      return {status, ok: status === 200, json: async () => {
        if (scenario === 'bad-json') throw new Error('json');
        if (scenario === 'reason') return {ok: false, reason: 'not-a-room'};
        if (scenario === 'error') return {ok: false, error: 'js-only'};
        return {ok: true, items: [{name: 'fixture'}], tables: []};
      }};
    },
  });
  vm.runInContext(shared, context);
  if (legacy) vm.runInContext(read('tools/fixtures/ai-image-import/' + surface + '.js') + '\nwindow.request = callApi; window.image = downscaleImage; window.busy = busyHtml;', context);
  else {
    const source = read('assets/' + surface + '-scan.js');
    assert.match(source, /window\.KiwiAiImageImport\.callApi/, 'both surfaces delegate transport');
    assert.match(source, /window\.KiwiAiImageImport\.downscaleImage/, 'both surfaces delegate preparation');
    vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.request = callApi; window.image = downscaleImage; window.busy = busyHtml; })();'), context);
  }
  const preview = window.busy('<&', '"preview');
  const image = await window.image({});
  const cancel = new AbortController();
  if (scenario === 'pre-cancel') cancel.abort();
  const p = window.request(surface === 'menu' ? {kind:'image', image} : image, cancel.signal)
    .then(value => ({value}), e => ({error: e.message}));
  await settle();
  if (scenario === 'timeout') timer();
  if (scenario === 'cancel') cancel.abort();
  const outcome = await p;
  assert.equal(timer, null, 'timer released');
  assert.equal(revoked, 1, 'image URL released');
  return JSON.parse(JSON.stringify({outcome, image, preview, request: request && {url:request.url, body:request.body, aborted:request.signal.aborted}}));
}
for (const surface of ['menu', 'salle']) {
  for (const scenario of ['timeout','cancel','pre-cancel','401','429','503','bad-json','reason','error','network','success']) {
    const before = await run(surface, true, scenario);
    const after = await run(surface, false, scenario);
    assert.deepEqual(after, before, surface + ': ' + scenario);
    const expected = {timeout:'timeout', cancel:'cancelled', 'pre-cancel':'cancelled', 401:'auth', 429:'quota', 503:'server', 'bad-json':'unparsed'}[scenario];
    if (expected) assert.equal(after.outcome.error, expected);
  }
  // Deterministic generated dimensions exercise rounding, small images and aspect ratios.
  let seed = 73;
  for (let i = 0; i < 64; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; const w = 1 + seed % 8000;
    seed = (seed * 1664525 + 1013904223) >>> 0; const h = 1 + seed % 8000;
    assert.deepEqual(await run(surface, false, 'success', w, h), await run(surface, true, 'success', w, h));
  }
}
console.log('PASS shared imports: both surfaces equivalent to frozen originals, 22 transport cases and 128 generated images');

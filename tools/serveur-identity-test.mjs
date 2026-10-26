import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(f, 'utf8');
const old = "    /* =========================================================\n       Kiwi Serveur \u2014 demo logic\n       Single-file. No build, no framework.\n       ========================================================= */\n\n    /* Real venue identity for the waiter app. Serveur has no env/identity layer,\n       so derive from the 6-digit pairing (kiwiPairedVenue) or, on a hosted domain,\n       the pinned merchant slug. A real venue shows ITS name \u2014 never the demo\n       \"Caf\u00e9 Atlas \u00b7 Maarif\". Local demo (unpaired localhost) is unchanged. */\n    function svPaired() {\n      try {\n        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function') {\n          var pv = window.KiwiPlatform.pairedVenue();\n          if (pv) return pv;\n        }\n      } catch (_) {}\n      try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; }\n    }\n    function svMerchant() {\n      try {\n        var q = new URLSearchParams(location.search).get('merchant');\n        if (q && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(q)) return q.toLowerCase();\n      } catch (_) {}\n      var p = svPaired();\n      if (p && p.merchant) return String(p.merchant).toLowerCase();\n      try { return String(localStorage.getItem('kiwiEmployeeMerchant') || localStorage.getItem('kiwiLiveMerchant') || '').toLowerCase(); } catch (_) { return ''; }\n    }\n    function svHosted() { try { var h = (location.hostname || '').toLowerCase(); return !(h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '' || /\\.local$/.test(h)); } catch (_) { return false; } }\n    function svReal()   { return !!svMerchant() || svHosted(); }\n";
const current = read('assets/serveur-app.js').split('    /* « Souvent')[0];
// Execute the complete shared runtime, including its lazy session gate.
const environment = read('assets/kiwi-env.js');
const platform = read('assets/platform-kernel.js');
const html = read('kiwi-serveur.html');
assert.match(html, /<script src="assets\/platform-kernel.js\?v=\d+"><\/script>/, 'shared pairing must run before synchronous serveur');
let count = 0, differences = 0;
const failures = new Set();
for (const hostname of ['localhost', '127.0.0.1', '0.0.0.0', 'shop.example'])
for (const forced of [null, '0', '1'])
for (const paired of [null, '0', '1'])
for (const pairing of [null, '{bad', JSON.stringify({merchant:'shop-a',name:'A'}), JSON.stringify({name:'Stale'})])
for (const leftover of [null, 'shop-b'])
for (const search of ['', '?merchant=shop-c'])
for (const employee of [null, 'shop-d'])
for (const session of [false, true])
for (const native of [false, true])
for (const account of [null, 'account-a']) {
  const entries = {kiwiEmployeeMerchant:employee, kiwiDemos:forced, kiwiPaired:paired, kiwiPairedVenue:pairing, kiwiLiveMerchant:leftover, kiwiAccountKey:account};
  const context = vm.createContext({location:{hostname,protocol:'https:',search}, URLSearchParams,
    localStorage:{getItem:k=>entries[k] ?? null}, console:{warn(){},error(){}},
    document:{addEventListener(){},querySelectorAll(){return [];}}, addEventListener(){},
    KiwiMe:session ? {} : null, KiwiApiBase:{native}});
  context.window = context;
  vm.runInContext(environment, context);
  vm.runInContext(platform, context);
  vm.runInContext(old, context);
  const before = {real:context.svReal(), merchant:context.svMerchant(), pairing:JSON.stringify(context.svPaired())};
  vm.runInContext(current, context);
  if (context.svReal() !== context.KiwiEnv.isReal()) {
    if (forced === '0') failures.add('forced-real');
    if (session) failures.add('signed-in');
    if (native && account) failures.add('native-account');
    if (hostname === '0.0.0.0') failures.add('local-origin');
    if (pairing?.includes('"merchant"') && paired !== '1') failures.add('stale-pairing');
    if (leftover || employee || search) failures.add('routing-without-session');
  }
  assert.equal(context.svMerchant(), before.merchant, 'merchant routing preserved');
  assert.equal(JSON.stringify(context.svPaired()), before.pairing, 'pairing projection preserved');
  if (before.real !== context.svReal()) {
    differences++;
    // Exhaustive, named exceptions: shared local-origin semantics, real sessions,
    // forced real mode, native account, or stale routing keys lacking a real gate.
    const local = hostname !== 'shop.example';
    const validPair = paired === '1' && pairing?.includes('"merchant"');
    const expected = !local || forced === '0' || session || validPair || (native && !!account);
    assert.equal(context.svReal(), !!expected);
    assert.ok(hostname === '0.0.0.0' || forced === '0' || session || validPair || (native && account) || leftover || employee || search || pairing?.includes('"merchant"'));
  }
  count++;
}
assert.equal([...failures].sort().join(','), '', 'serveur follows shared gate in every gap category');
assert.ok(differences > 0);
console.log(`✓ serveur identity: ${count} generated states, ${differences} documented gate corrections; merchant/pairing equivalent`);

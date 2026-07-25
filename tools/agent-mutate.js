/* Kiwi AI — metamorphic routing test.
 *
 * Hand-writing another few thousand questions does not work: at that volume
 * they get templated, and templated cases pass by construction. So instead of
 * inventing new questions, this re-types the 1 000 we already trust the way a
 * merchant actually types — dropping the accents, losing an apostrophe, typing
 * in caps, opening with "bonjour,", fat-fingering one letter, using the
 * Arabic-Indic keypad.
 *
 * None of those change what was meant, so the expected route is INVARIANT: it
 * must stay whatever the seed's was. A failure is real fragility — the same
 * question, typed slightly differently, getting a different answer.
 *
 * That is how the greeting bug surfaced: 396 questions became a generic "here
 * is what I can do" the moment a merchant opened with a salutation, which in
 * Morocco is most of the time.
 *
 * Not shipped — no page references this file.
 *   node : require it beside a loaded agent.js (see the tools/ harness)
 *   browser : load agent.js + tools/agent-corpus.js + this, then
 *             KiwiAgentMutate()
 */
'use strict';

(function (root) {
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* Fat-finger exactly one long word, so the signal survives if the corrector
   * is doing its job. Short queries have no word to spare and are skipped. */
  function longWordIdx(words) {
    for (let i = 0; i < words.length; i++) if (/^[a-zà-ÿ']{6,}$/i.test(words[i])) return i;
    return -1;
  }

  const MUTATORS = [
    { name: 'no-accents', keepsMath: true, fn: deaccent },
    { name: 'no-apostrophe', fn: (s) => s.replace(/['’‘`]/g, ' ') },
    { name: 'greeting-prefix', fn: (s) => 'bonjour, ' + s },
    { name: 'polite-suffix', fn: (s) => s + ' svp' },
    { name: 'ask-wrapper', fn: (s) => 'peux-tu me dire ' + s },
    { name: 'question-mark', fn: (s) => s.replace(/[?？]+$/, '').trim() + ' ?' },
    { name: 'uppercase', keepsMath: true, fn: (s) => s.toUpperCase() },
    { name: 'double-space', keepsMath: true, fn: (s) => s.replace(/ /g, '  ') },
    { name: 'trailing-dots', fn: (s) => s + ' ...' },
    { name: 'emoji', fn: (s) => s + ' 🙏' },
    { name: 'arabic-digits', keepsMath: true, fn: (s) => s.replace(/\d/g, (d) => AR_DIGITS[+d]) },
    { name: 'typo-swap', fn: (s) => {
      const w = s.split(/\s+/), i = longWordIdx(w);
      if (i < 0) return null;
      const c = w[i], k = Math.floor(c.length / 2);
      w[i] = c.slice(0, k) + c[k + 1] + c[k] + c.slice(k + 2);
      return w.join(' ');
    } },
    { name: 'typo-drop', fn: (s) => {
      const w = s.split(/\s+/), i = longWordIdx(w);
      if (i < 0) return null;
      w[i] = w[i].slice(0, -1);
      return w.join(' ');
    } },
  ];

  /* Seeds whose premise a mutation would destroy rather than preserve: an
   * empty box, keyboard mash, or a bare greeting is no longer the same input
   * once something is appended to it. Counting those as failures would inflate
   * the score in the wrong direction — they are excluded, not silently passed. */
  function degenerate(q, want) {
    const bare = String(q).trim();
    if (bare.length <= 3) return true;
    if (/^(.)\1{3,}$/.test(bare.replace(/\s+/g, ''))) return true;
    return want === 'unclear' || want === 'greet';
  }

  function run(opts) {
    opts = opts || {};
    const seeds = (root.KiwiAgentEvalSet || []).concat(root.KiwiAgentCorpus || []);
    if (!seeds.length || typeof root.KiwiAgentRoute !== 'function') {
      throw new Error('load assets/agent.js (and tools/agent-corpus.js) first');
    }
    let total = 0, skipped = 0;
    const fails = [];
    seeds.forEach((row) => {
      const q = row[0], want = row[1];
      const isMath = want === 'math' || want === 'calcerr';
      if (degenerate(q, want)) { skipped++; return; }
      MUTATORS.forEach((m) => {
        if (isMath && !m.keepsMath) return;   // "1200 + 3400 svp" is a different input
        let mq;
        try { mq = m.fn(q); } catch (e) { return; }
        if (mq == null || mq === q) return;
        total++;
        let got;
        try { got = root.KiwiAgentRoute(mq); } catch (e) { got = 'CRASH'; }
        if (got !== want) fails.push({ mutation: m.name, seed: q, typed: mq, expected: want, got });
      });
    });
    const byMutation = {};
    fails.forEach((f) => { byMutation[f.mutation] = (byMutation[f.mutation] || 0) + 1; });
    const pass = total - fails.length;
    return {
      seeds: seeds.length,
      skippedSeeds: skipped,
      total,
      pass,
      invariance: Math.round(pass / total * 1000) / 10,
      byMutation,
      fails: opts.all ? fails : fails.slice(0, 40),
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = run;
  if (root && root.document) root.KiwiAgentMutate = run;
}(typeof window !== 'undefined' ? window : globalThis));

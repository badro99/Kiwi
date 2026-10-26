// Historical extraction suites use live bodies in their original lexical scope.
import fs from 'node:fs';
const read = file => fs.readFileSync(file, 'utf8');
export const onboardingSplit = JSON.parse(read('tools/fixtures/onboarding/split.json'));
export function onboardingTestSource() {
  let source = read('assets/onboarding.js');
  const data = read('assets/onboarding-data.js');
  for (const patch of onboardingSplit.alignments) {
    if (!source.includes(patch.replacement)) throw Error('Onboarding alignment wiring changed');
    source = source.replace(patch.replacement, () => patch.original);
  }
  source = source.replace('  const S = session.state;\n  const RESERVED = session.reserved;', '  const S = session.state;');
  // The reserved list preceded state in the original controller.
  source = source.replace('\n\n\n  /* ── Session state', '\n  const RESERVED = session.reserved;\n\n  /* ── Session state');
  for (const f of onboardingSplit.fragments) {
    if (!source.includes(f.replacement)) throw Error('Onboarding forwarding changed: ' + f.replacement);
    source = source.replace(f.replacement, () => data.slice(f.offset, f.offset + f.end - f.start));
  }
  return source.replace(/onboarding-data\.js\?v=\d+/g, 'onboarding-data.js?v=4');
}

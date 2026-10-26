'use strict';
// Final full-gate verdict. An override waives preflight, never evidence.
module.exports = function verdict({ failures = 0, warnings = 0, env = process.env } = {}) {
  const skipped = [];
  if (env.KIWI_ALLOW_PROPERTY_SKIP === '1') skipped.push('properties/accessibility');
  if (env.KIWI_ALLOW_BROWSER_SKIP === '1') skipped.push('browser');
  if (skipped.length) return {
    line: `! INCOMPLETE · evidence waived: ${skipped.join(', ')} · ${failures} failure(s), ${warnings} warning(s)${env.KIWI_ACCEPT_INCOMPLETE === '1' ? ' · explicitly accepted' : ''}`,
    code: failures ? 1 : env.KIWI_ACCEPT_INCOMPLETE === '1' ? 0 : 2,
  };
  return { line: failures ? `✗ ${failures} failure(s), ${warnings} warning(s)` : `✓ all checks passed (${warnings} warning(s))`, code: failures ? 1 : 0 };
};

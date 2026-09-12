'use strict';

// This is an evidence/quality gate, not a cryptographic attestation. The
// local agent controls its own files. The owner still verifies the release.
const fs = require('node:fs');
const path = require('node:path');

function validateUiProof(file, ticketId, now = Date.now()) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.basename(file) !== 'proof.json') throw new Error('uiProofPath must be an absolute proof.json path.');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 100000) throw new Error('UI proof is missing or too large.');
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const finished = Date.parse(p.finishedAt);
  if (p.schema !== 'kiwi-ui-proof-v1' || p.passed !== true || p.ticketId !== ticketId) throw new Error('UI proof does not match this ticket.');
  if (!Number.isFinite(finished) || finished > now + 60000 || now - finished > 24 * 3600000) throw new Error('UI proof must be from the last 24 hours.');
  if (p.environment !== 'synthetic-hotel-dashboard' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(p.origin || '')) throw new Error('UI proof must come from the isolated synthetic fixture.');
  if (p.gitDirty || !/^[a-f0-9]{40}$/.test(p.gitHead || '')) throw new Error('Capture UI proof after committing on a clean worktree.');
  if (!Array.isArray(p.actions) || !p.actions.some(x => x.kind === 'click') ||
      !Array.isArray(p.assertions) || !p.assertions.some(x => ['text_contains', 'value_equals'].includes(x.condition) && x.description && x.description.length >= 8)) {
    throw new Error('UI proof needs a real click and a ticket-specific rendered text/value assertion.');
  }
  const lastAssertionAt = Date.parse(p.assertions.at(-1)?.at || '');
  const lastActionAt = Date.parse(p.actions.at(-1)?.at || '');
  if (!Number.isFinite(lastAssertionAt) || !Number.isFinite(lastActionAt) || lastAssertionAt < lastActionAt) throw new Error('UI proof must assert the final state after the last action.');
  if (typeof p.expectedOutcome !== 'string' || p.expectedOutcome.length < 15) throw new Error('UI proof lacks the expected ticket outcome.');
  if (typeof p.screenshot !== 'string' || path.dirname(p.screenshot) !== path.dirname(file) || !fs.statSync(p.screenshot).isFile()) throw new Error('UI proof screenshot is missing.');
  return p;
}

module.exports = { validateUiProof };

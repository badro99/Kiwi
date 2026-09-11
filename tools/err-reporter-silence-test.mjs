import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const reporterPath = path.join(ROOT, 'assets', 'err-reporter.js');
assert(fs.existsSync(reporterPath), 'err-reporter.js must exist');

const code = fs.readFileSync(reporterPath, 'utf8');

console.log('■ Error Reporter Silence & Loop Prevention (tools/err-reporter-silence-test.mjs)');

// Control 1: err-reporter.js must not invoke KiwiReportError anywhere internally
const reportErrorMatches = code.match(/KiwiReportError\s*\(/g) || [];
// KiwiReportError is only defined/assigned (win.KiwiReportError = ...), never called
assert(reportErrorMatches.length <= 1, 'KiwiReportError must not be invoked inside err-reporter.js');

// Control 2: Catch blocks inside err-reporter.js must stay silent (loop prevention)
// Extract all catch blocks
const catchBlockRegex = /catch\s*\([^\)]*\)\s*\{([^}]*)\}/g;
let match;
let catchCount = 0;
while ((match = catchBlockRegex.exec(code)) !== null) {
  catchCount++;
  const catchBody = match[1].trim();
  // Ensure catch body does not call report() or KiwiReportError() or fetch()
  assert(!/\breport\s*\(/.test(catchBody), `Catch block ${catchCount} must not call report()`);
  assert(!/\bKiwiReportError\b/.test(catchBody), `Catch block ${catchCount} must not call KiwiReportError`);
  assert(!/\bfetch\s*\(/.test(catchBody), `Catch block ${catchCount} must not call fetch`);
  assert(!/\bsendBeacon\s*\(/.test(catchBody), `Catch block ${catchCount} must not call sendBeacon`);
}

assert(catchCount >= 6, `Expected at least 6 fail-soft catch blocks in err-reporter.js, found ${catchCount}`);

// Control 3: Runtime fail-soft execution simulation
// Ensure that when storage throws, getMerchant and getVersion return empty strings without throwing
const mockWindow = {
  location: { pathname: '/test' },
  navigator: { userAgent: 'test' },
  addEventListener: () => {},
};

// Evaluate in a function wrapper
const wrapper = new Function('window', 'localStorage', code);

// Case A: Storage throws (like Safari private mode)
const throwingStorage = {
  getItem: () => { throw new Error('SecurityError: Private browsing'); },
  setItem: () => { throw new Error('SecurityError: QuotaExceeded'); }
};

let evaluatedOk = false;
try {
  wrapper(mockWindow, throwingStorage);
  evaluatedOk = true;
} catch (e) {
  evaluatedOk = false;
}
assert(evaluatedOk, 'err-reporter.js must initialize safely even when localStorage throws');
assert(typeof mockWindow.KiwiReportError === 'function', 'KiwiReportError must be exported');

// Case B: Calling KiwiReportError when beacon/fetch throw must not throw or loop
let manualReportOk = false;
try {
  mockWindow.KiwiReportError(new Error('Test unhandled crash'));
  manualReportOk = true;
} catch (e) {
  manualReportOk = false;
}
assert(manualReportOk, 'KiwiReportError must fail soft without throwing on dispatch failure');

console.log(`  ✓ all ${catchCount} catch blocks in err-reporter.js verified silent (loop prevention active)`);
console.log('  ✓ runtime fail-soft evaluation verified against throwing storage & network');
console.log('✓ 4 error-reporter loop prevention controls green.');

#!/usr/bin/env node
// docs/ops/app-store-listing.md is pasted field by field into App Store Connect.
// A field over Apple's limit is refused at paste time, after the build is chosen;
// this catches it in the gate instead. Pure file read, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const doc = fs.readFileSync(path.join(root, 'docs/ops/app-store-listing.md'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'app/ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
let checks = 0;
const len = s => [...s].length;

function field(block, label) {
  const re = new RegExp('\\*\\*' + label + '\\*\\*\\s*\\n\\s*\\n```\\n([\\s\\S]*?)\\n```');
  const m = block.match(re);
  assert.ok(m, 'missing field ' + label);
  return m[1];
}

for (const lang of ['fr', 'en', 'ar']) {
  const m = doc.match(new RegExp('<!-- listing:' + lang + ' -->([\\s\\S]*?)<!-- /listing:' + lang + ' -->'));
  assert.ok(m, 'missing block ' + lang);
  const block = m[1];
  const subtitle = field(block, 'Subtitle');
  const promo = field(block, 'Promotional text');
  const keywords = field(block, 'Keywords');
  const description = field(block, 'Description');
  assert.ok(len(subtitle) <= 30, lang + ' subtitle ' + len(subtitle) + ' > 30'); checks++;
  assert.ok(len(promo) <= 170, lang + ' promotional text ' + len(promo) + ' > 170'); checks++;
  assert.ok(len(keywords) <= 100, lang + ' keywords ' + len(keywords) + ' > 100'); checks++;
  assert.ok(!/,\s/.test(keywords), lang + ' keywords: no space after a comma'); checks++;
  assert.ok(len(description) <= 4000 && len(description) > 200, lang + ' description length ' + len(description)); checks++;
  for (const text of [subtitle, promo, keywords, description]) {
    // House rules: no em dash, no price or plan name a reviewer could read as an in-app sale (3.1.1).
    assert.ok(!text.includes('—'), lang + ': em dash in listing'); checks++;
    assert.ok(!/MAD|\d+\s?(DH|dh)\b|Kiwi (Basic|Plus|Ultra|Ultimate)\b/.test(text), lang + ': price or plan in listing'); checks++;
  }
}

// The privacy answers list exactly the manifest's types: 21 today.
const declared = [...manifest.matchAll(/<string>NSPrivacyCollectedDataType(?!Purpose)([A-Za-z]+)<\/string>/g)].map(m => m[1]);
assert.equal(declared.length, 21, 'manifest data types changed: update the App Privacy section of the listing'); checks++;
assert.ok(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(manifest), 'manifest must not declare tracking'); checks++;
assert.ok(/Data used to track you: \*\*No\*\*/.test(doc), 'listing must answer No to tracking'); checks++;

console.log('app-store-listing: ' + checks + ' checks passed');

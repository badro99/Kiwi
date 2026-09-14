import assert from 'node:assert/strict';
import fs from 'node:fs';

const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const setup = caisse.match(/function setupRealSalle\(\) \{[\s\S]*?const plan = caisseFloorPlan\(\);/)?.[0];
assert.ok(setup, 'real-store floor-plan setup exists');
assert.match(setup, /if \(!storeIsReal\(\)\) return;/, 'demo floor plan remains separate');
assert.match(setup, /view\.classList\.add\('has-real-plan'\)/, 'paired-store view receives real-plan state');
assert.match(caisse, /\.view-salle\.has-real-plan > \.plan-footer\s*\{\s*display:\s*none;/,
  'demo-only floor counter does not sit above the real plan');
assert.match(caisse, /\.view-salle\.has-real-plan\s*\{\s*padding-top:\s*0;/,
  'real plan starts directly under the header');
assert.match(caisse, /\.view-salle\.has-real-plan \.cplan-room\s*\{\s*margin-top:\s*0;/,
  'floor title retains one controlled gap above the room');
console.log('✓ real caisse floor plan has no empty demo-counter row above it');

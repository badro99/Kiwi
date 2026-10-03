#!/usr/bin/env node
// Verification only: never generate or write an asset. Not simulator proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SOURCES, OUTPUT_DIR, approvedSource, coverageAlpha, verifyLaunchMark, imageSetContents } from './native-launch-mark.mjs';
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && (!args.length || args[0] === '--source-only'),
  'Usage: node tools/native-launch-mark-test.mjs [--source-only]');
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };

// Protect the coverage recipe independently, including clamp boundaries.
ok(coverageAlpha(0) === 0 && coverageAlpha(31) === 0 && coverageAlpha(32) === 0, 'Raster backdrop has zero coverage');
ok(coverageAlpha(40) === 51 && coverageAlpha(64) === 204, 'Intermediate coverage is rounded, not premultiplied');
ok(coverageAlpha(72) === 255 && coverageAlpha(255) === 255, 'Bright sculpted artwork retains opaque coverage');
const runtime = read('app/src/native-runtime.js'), swift = read('app/ios/App/App/KiwiNativeShell.swift');
ok(runtime.includes('color-interpolation-filters="sRGB"') &&
  runtime.includes('values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 6.375 0 0 -0.8"'),
  'Static coverage matches the existing sRGB web alpha-only matrix');
ok(swift.includes('CIVector(x: 0, y: 6.375, z: 0, w: 0)') &&
  swift.includes('CIVector(x: -0.8, y: -0.8, z: -0.8, w: 0)') &&
  swift.includes('blend.setValue(input, forKey: kCIInputImageKey)'),
  'Static coverage coefficients match the native mask without replacing its RGB input');
for (const spec of SOURCES) {
  approvedSource(spec); checks++;
  if (args[0] === '--source-only') continue;
  const output = verifyLaunchMark(spec); checks++;
  const alphaAt = (x, y) => output.pixels[(y * output.width + x) * 4 + 3];
  ok([[0, 0], [output.width - 1, 0], [0, output.height - 1],
    [output.width - 1, output.height - 1]].every(([x, y]) => alphaAt(x, y) === 0),
    spec.output + ': all four corners reveal the actual launch canvas');
  let transparent = false, intermediate = false, opaque = false;
  for (let i = 3; i < output.pixels.length; i += 4) {
    const alpha = output.pixels[i];
    transparent ||= alpha === 0; intermediate ||= alpha > 0 && alpha < 255; opaque ||= alpha === 255;
  }
  ok(transparent && intermediate && opaque, spec.output + ': transparent backdrop, soft coverage and intact opaque art exist');
}
if (args[0] !== '--source-only') {
  ok(JSON.stringify(JSON.parse(read(OUTPUT_DIR + '/Contents.json'))) ===
    JSON.stringify(JSON.parse(imageSetContents())), 'All scales map to their exact approved derivative');
  const storyboard = read('app/ios/App/App/Base.lproj/LaunchScreen.storyboard');
  ok(storyboard.includes('image="KiwiLaunchMark"') && storyboard.includes('name="KiwiLaunchMark"') &&
    !storyboard.includes('image="KiwiBrandIcon"'), 'Static launch uses the transparent derivative, not the opaque master');
  ok(storyboard.includes('constant="88"') && storyboard.includes('id="mark-top"') &&
    storyboard.includes('green="0.08627450980392157"'), 'Approved launch dimensions, placement and canvas remain');
}
console.log(`Static launch alpha guard: ${checks} checks passed${args[0] === '--source-only' ? ' (sources only; derivative and storyboard unverified)' : ''}`);

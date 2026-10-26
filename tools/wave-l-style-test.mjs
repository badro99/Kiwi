import assert from 'node:assert/strict';
import fs from 'node:fs';
const rule = (file, selector) => {
  const css = fs.readFileSync(file, 'utf8');
  const body = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim() === selector).map(m => m[2]).join(';');
  return Object.fromEntries(body.split(';').filter(s => s.includes(':')).map(s => { const i = s.indexOf(':'); return [s.slice(0,i).trim(), s.slice(i+1).trim()]; }));
};
if (process.argv[2] !== 'pressing') {
  const button = rule('assets/reservations.css', '.kr-more');
  const hit = rule('assets/reservations.css', '.kr-more::after');
  assert.equal(button.width, '36px', 'visible booking design stays unchanged');
  assert.equal(button.height, '36px');
  assert.equal(button.position, 'relative');
  assert.equal(hit.position, 'absolute');
  assert.equal(hit.inset, '-4px', '36 + 2 × 4 = 44 px in both axes, including phone');
  assert.equal(hit.content, '\'\'');
}
if (process.argv[2] !== 'booking') {
  const note = rule('assets/pressing-caisse.css', '.px-offline-note b');
  assert.equal(note['margin-inline-start'], 'auto');
  assert.equal(note['margin-left'], undefined);
}
console.log('✓ booking hit area / pressing logical alignment');

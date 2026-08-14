import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../assets/phone.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const booking = fs.readFileSync(new URL('../booking.html', import.meta.url), 'utf8');
const listeners = {};
class InputEvent {
  constructor(type, options) { this.type = type; this.bubbles = !!options?.bubbles; }
}
const context = {
  Event: InputEvent,
  document: { addEventListener: (name, fn) => { listeners[name] = fn; } },
  window: {},
};
context.window.window = context.window;
context.window.document = context.document;
context.window.Event = InputEvent;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'phone.js' });

const phone = context.window.KiwiPhone;
assert.ok(phone && Object.isFrozen(phone), 'one immutable phone API is published');
assert.match(source, /input\[type="tel"\]:not\(\[inputmode="numeric"\]\)/, 'employee PIN fields are excluded from the platform phone handler');
for (const [name, shell] of [['dashboard', dashboard], ['caisse', caisse], ['booking', booking]]) {
  assert.match(shell, /assets\/phone\.js\?v=1/, `${name} loads the shared phone rules`);
}

const accepted = new Map([
  ['0612345678', '06 12 34 56 78'],
  ['+212 6 12 34 56 78', '06 12 34 56 78'],
  ['00212-7-12-34-56-78', '07 12 34 56 78'],
  ['212539334455', '05 39 33 44 55'],
  ['612345678', '06 12 34 56 78'],
  ['+49 179 5241112', '+491795241112'],
  ['0044 7700 900123', '+447700900123'],
  ['+33 (0) 6 12 34 56 78', '+33612345678'],
  ['+1-202-555-0123', '+12025550123'],
]);
for (const [input, expected] of accepted) {
  assert.equal(phone.normalize(input), expected, `accepts ${input}`);
  assert.equal(phone.valid(input), true, `validates ${input}`);
}

for (const input of ['', '1234', '33 6 12 34 56 78', '0812345678', '06ABC345678', '061234567890', '+012345678', '+49+1795241112', '+1234567890123456']) {
  assert.equal(phone.normalize(input), '', `rejects ${input || 'empty input'}`);
  assert.equal(phone.valid(input), false, `does not validate ${input || 'empty input'}`);
}

assert.equal(phone.same('0612345678', '+212 6 12 34 56 78'), true, 'Moroccan local and international formats deduplicate');
assert.equal(phone.same('+49 179 5241112', '0049 179 5241112'), true, 'foreign formatting variants deduplicate');
assert.equal(phone.same('+49 1712345678', '+33 1712345678'), false, 'different countries never collide on trailing digits');
assert.equal(phone.whatsapp('0612345678'), '212612345678', 'Moroccan WhatsApp target includes country code');
assert.equal(phone.whatsapp('+49 179 5241112'), '491795241112', 'foreign WhatsApp target preserves country code');

let dispatched = null;
const telInput = {
  value: '+33 (0) 6 12 34 56 78',
  matches: (selector) => selector.includes('input[inputmode="tel"]'),
  dispatchEvent: (event) => { dispatched = event; },
};
listeners.focusout({ target: telInput });
assert.equal(telInput.value, '+33612345678', 'lazy-loaded telephone fields normalize on blur');
assert.equal(dispatched?.type, 'input', 'normalization updates each vertical state through its input handler');

const pin = {
  value: '1234',
  matches: () => false,
  dispatchEvent: () => { throw new Error('employee PIN must never be treated as a phone'); },
};
listeners.focusout({ target: pin });
assert.equal(pin.value, '1234', 'employee PIN remains untouched');

console.log(`✓ international phone rules (${accepted.size * 2 + 30} controls)`);

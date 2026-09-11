#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the shipped handler. The modal DOM and transport are doubles, not a
// second implementation of the deletion state machine. No network or real data.
const source = fs.readFileSync(new URL('../assets/interactive.js', import.meta.url), 'utf8');
const start = source.indexOf("'settings-delete-account': () => {");
const end = source.indexOf("    'glass-level':", start);
assert.ok(start > 0 && end > start);
const handler = source.slice(start, end).trim().replace(/,$/, '');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
let checks = 0;
function world(locale, responses) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', textContent: '', disabled: false, hidden: false, listeners: {},
      focus() { this.focused = true; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
    });
    return nodes.get(selector);
  };
  let modalConfig, closed = false;
  const calls = [];
  vm.runInNewContext('({' + handler + "})['settings-delete-account']()", {
    tr: (copy) => copy[locale],
    modal: (config) => {
      modalConfig = config;
      node('[data-delete-submit]').disabled = true;
      node('[data-delete-form]').hidden = true;
      return { el: { querySelector: node }, close: () => { closed = true; } };
    },
    document: { documentElement: { lang: locale } },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const value = responses.shift();
      if (value instanceof Error) throw value;
      if (typeof value === 'function') return value();
      return new Response(JSON.stringify(value.body), { status: value.status || 200 });
    },
    AbortController, setTimeout, clearTimeout,
  });
  return { node, calls, get config() { return modalConfig; }, get closed() { return closed; } };
}
const identity = { body: { account: { email: '<img src=x onerror=alert(1)>@example.test' }, request: null } };
const recorded = { body: { ok: true, request: { reference: 'D-TEST', createdAt: 1700000000000 } } };
for (const locale of ['fr', 'en', 'ar']) {
  const w = world(locale, [identity, recorded]);
  await flush();
  assert.equal(w.node('[data-delete-identity]').textContent, identity.body.account.email);
  assert.equal(w.node('[data-delete-submit]').disabled, false);
  assert.match(w.config.body, /type="password"/);
  w.node('[data-delete-password]').value = 'synthetic-é-ع';
  await w.node('[data-delete-submit]').listeners.click();
  assert.equal(w.calls.length, 2);
  assert.deepEqual(JSON.parse(w.calls[1].body), { confirm: true, password: 'synthetic-é-ع' });
  assert.equal(w.calls[1].credentials, 'include');
  assert.equal(w.node('[data-delete-password]').value, '');
  assert.equal(w.node('[data-delete-submit]').hidden, true);
  assert.match(w.node('[data-delete-status]').textContent, /D-TEST/);
  await w.node('[data-delete-submit]').listeners.click();
  assert.equal(w.calls.length, 2);
  checks++;
}
{
  const w = world('en', [{ status: 401, body: { error: 'unauthenticated' } }]);
  await flush();
  await w.node('[data-delete-submit]').listeners.click();
  assert.equal(w.calls.length, 1);
  assert.equal(w.node('[data-delete-submit]').disabled, true);
  assert.match(w.node('[data-delete-status]').textContent, /Sign in/);
  checks++;
}
{
  const w = world('en', [identity, { status: 401, body: { error: 'bad-creds' } }, recorded]);
  await flush();
  w.node('[data-delete-password]').value = 'wrong-fixture';
  await w.node('[data-delete-submit]').listeners.click();
  assert.match(w.node('[data-delete-status]').textContent, /Incorrect password/);
  assert.equal(w.node('[data-delete-submit]').disabled, false);
  w.node('[data-delete-password]').value = 'correct-fixture';
  w.node('[data-delete-password]').listeners.keydown({ key: 'Enter', preventDefault() {} });
  await flush();
  assert.match(w.node('[data-delete-status]').textContent, /D-TEST/);
  checks++;
}
{
  let respond;
  const w = world('en', [identity, () => new Promise(resolve => { respond = resolve; })]);
  await flush();
  w.node('[data-delete-password]').value = 'fixture';
  const pending = w.node('[data-delete-submit]').listeners.click();
  await w.node('[data-delete-submit]').listeners.click();
  assert.equal(w.calls.length, 2);
  assert.equal(w.node('[data-delete-password]').value, '');
  respond(new Response(JSON.stringify({ error: 'db-unavailable' }), { status: 503 }));
  await pending;
  assert.match(w.node('[data-delete-status]').textContent, /could not be recorded/);
  assert.equal(w.node('[data-delete-submit]').hidden, false);
  w.node('[data-delete-password]').value = 'unsent-fixture';
  w.node('[data-close]').listeners.click();
  assert.equal(w.node('[data-delete-password]').value, '');
  assert.equal(w.closed, true);
  checks++;
}
{
  const w = world('en', [{ body: { ...identity.body, request: recorded.body.request } }]);
  await flush();
  assert.equal(w.node('[data-delete-submit]').hidden, true);
  assert.match(w.node('[data-delete-status]').textContent, /D-TEST/);
  checks++;
}
console.log(`account-deletion-ui-test: ${checks} controls passed`);

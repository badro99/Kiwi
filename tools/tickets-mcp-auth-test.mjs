#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const source = fs.readFileSync(new URL('./tickets-mcp/server.js', import.meta.url), 'utf8');
const credential = randomBytes(24).toString('hex');
const requests = [];
const context = vm.createContext({
  require: createRequire(new URL('./tickets-mcp/server.js', import.meta.url)), Buffer, URL,
  process: { env: { KIWI_TICKETS_COOKIE: credential }, stdin: { setEncoding() {}, on() {} }, stdout: { write() {} } },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ tickets: [{ id: 1, number: '#1', images: [{ url: 'https://outside.invalid/private.png' }] }] }), headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => new ArrayBuffer(1) };
  },
});
vm.runInContext(source, context);
await assert.rejects(vm.runInContext('viewTicketImage({id:1,full:true})', context), /origin/);
assert.equal(requests.length, 1, 'no credential-bearing request may reach another origin');
assert.equal(requests[0].options.headers.Cookie, credential);
assert.equal(requests[0].options.redirect, 'error');
console.log('✓ ticket MCP credentials stay on the configured origin and redirects fail closed');

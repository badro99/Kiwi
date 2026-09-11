import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { source, workspace } from '../functions/api/admin/_workspace.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(schema);

const DB = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      all() { return { results: db.prepare(sql).all(...args) }; },
    };
    return stmt;
  },
};

const env = { DB };
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; }

const healthy = await workspace(env);
for (const [name, state] of Object.entries(healthy.sources)) {
  check(`${name} is readable against the current schema`, state.available);
  check(`${name} does not expose a failure on a healthy read`, !state.failure);
}
check('physical printing remains explicitly unverified', healthy.physical_print_verified === false);

const failing = await source({
  DB: { prepare() { throw new Error('no such table: telemetry_future'); } },
}, 'errors', 'SELECT * FROM telemetry_future');
check('failed telemetry is not reported as an empty healthy source', failing.available === false && failing.rows.length === 0);
check('schema failure is actionable', failing.failure.kind === 'schema' && failing.failure.code === 'schema-mismatch' && failing.failure.retryable === false);
check('failure reason identifies the source without leaking SQL', failing.reason === 'errors-schema-unavailable' && !JSON.stringify(failing).includes('telemetry_future'));

const workspaceSource = fs.readFileSync(new URL('../assets/admin-workspace.js', import.meta.url), 'utf8');
const identity = fs.readFileSync(new URL('../assets/identity.js', import.meta.url), 'utf8');
check('workspace renders route-level read failures as unavailable, not zero', workspaceSource.includes('Lecture opérationnelle indisponible') && workspaceSource.includes('Aucun zéro n’est déduit'));
check('workspace renders per-source failure action', workspaceSource.includes('Causes à vérifier') && workspaceSource.includes('failure.action'));
const noticeFunction = workspaceSource.match(/  function notice\(\)\s*\{[\s\S]*?\n  \}/)?.[0];
assert.ok(noticeFunction, 'production notice renderer is extractable');
const renderNotice = new Function('state', 'sources', 'available', 'esc', `${noticeFunction}; return notice();`);
const partialState = { live:true, data:{sources:{
  errors:{available:false,failure:{action:'Verify schema'}},
  print:{available:false},
}} };
const partialNotice = renderNotice(partialState, {errors:'Errors',print:'Print'}, ()=>false, String);
check('mixed legacy and structured source failures render without throwing',
  partialNotice.includes('Verify schema') && partialNotice.includes('Print'));
check('scoped identity does not trust another account business for first paint', identity.includes('accountStore') && identity.includes('var label = accountStore ? accountBusiness : prettifySlug(requestedStore)'));
check('scoped identity replaces the header with the exact selected-store name', identity.includes('id.name = scopeExtra.name'));

console.log(`operating-day-operator-test: ${checks} controls passed`);

#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/tickets/index.js';
import { onRequestPatch } from '../functions/api/tickets/[id].js';
import { TICKET_TAXONOMY, validateTicketClassification } from '../functions/api/tickets/_taxonomy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

function d1(sqlite) {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        run() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid || 0) } };
        },
        first() { return sqlite.prepare(sql).get(...args) || null; },
        all() { return { results: sqlite.prepare(sql).all(...args) }; },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

let passed = 0;
const failed = [];
function check(label, condition) {
  if (condition) { passed++; console.log('  ✓ ' + label); }
  else failed.push(label);
}

const unknown = validateTicketClassification({ kind: 'incident' });
check('unknown type ids are rejected with a precise error', !unknown.ok && unknown.error === 'invalid-kind');
const mismatch = validateTicketClassification({ kind: 'feature', subkind: 'wrong-figures' });
check('a sub-kind from another type is rejected', !mismatch.ok && mismatch.error === 'subkind-kind-mismatch');
const valid = validateTicketClassification({ kind: 'bug', area: 'reports-money', subkind: 'wrong-figures', money_at_risk: true });
check('a valid classification is normalised', valid.ok && valid.value.money_at_risk === true);
check('the taxonomy carries French and English labels', TICKET_TAXONOMY.kinds.every((item) => item.label.fr && item.label.en));

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await read('schema.sql'));
const DB = d1(sqlite);
const expiry = Date.now() + 987654;
sqlite.prepare(
  `INSERT INTO kiwi_tickets
   (body,status,kind,area,subkind,money_at_risk,created_ts,updated_ts,expires_ts)
   VALUES (?,?,?,?,?,?,?,?,?)`
).run('Keep status and expiry', 'testing', 'unsorted', null, null, 0, Date.now(), Date.now(), expiry);
const id = Number(sqlite.prepare('SELECT id FROM kiwi_tickets').get().id);
let response = await onRequestPatch({
  env: { DB }, params: { id: String(id) },
  request: new Request(`https://kiwi.test/api/tickets/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'classify', kind: 'bug', area: 'reports-money', subkind: 'wrong-figures', money_at_risk: true }),
  }),
});
const classifiedResponse = await response.json();
const classifiedRow = sqlite.prepare('SELECT * FROM kiwi_tickets WHERE id=?').get(id);
check('classify accepts a valid classification', response.status === 200 && classifiedResponse.classificationStored === true);
check('classify changes only classification fields', classifiedRow.status === 'testing' && classifiedRow.expires_ts === expiry
  && classifiedRow.kind === 'bug' && classifiedRow.area === 'reports-money' && classifiedRow.subkind === 'wrong-figures'
  && classifiedRow.money_at_risk === 1);

response = await onRequestPatch({
  env: { DB }, params: { id: String(id) },
  request: new Request(`https://kiwi.test/api/tickets/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'classify', kind: 'feature', subkind: 'wrong-figures' }),
  }),
});
check('classify rejects a sub-kind/type mismatch at the API boundary', response.status === 400 && (await response.json()).error === 'subkind-kind-mismatch');

const badForm = new FormData();
badForm.append('body', 'Invalid classification');
badForm.append('area', 'unknown-place');
response = await onRequestPost({
  env: { DB }, request: new Request('https://kiwi.test/api/tickets', { method: 'POST', body: badForm }),
});
check('ticket creation rejects an unknown area', response.status === 400 && (await response.json()).error === 'invalid-area');

const legacy = new DatabaseSync(':memory:');
legacy.exec(`
  CREATE TABLE kiwi_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, status TEXT NOT NULL,
    created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, completed_ts INTEGER, expires_ts INTEGER
  );
  CREATE TABLE kiwi_ticket_followups (id TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL, body TEXT NOT NULL, created_ts INTEGER NOT NULL);
  CREATE TABLE kiwi_ticket_images (
    id TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL, followup_id TEXT, object_key TEXT NOT NULL,
    filename TEXT, content_type TEXT, byte_size INTEGER, created_ts INTEGER NOT NULL
  );
  INSERT INTO kiwi_tickets (body,status,created_ts,updated_ts) VALUES ('Legacy ticket','problem',1,1);
`);
const legacyDB = d1(legacy);
response = await onRequestGet({ env: { DB: legacyDB } });
const legacyList = await response.json();
check('GET falls back on a database without classification columns', response.status === 200
  && legacyList.classificationSchemaReady === false && legacyList.tickets[0].kind === 'unsorted'
  && legacyList.tickets[0].moneyAtRisk === false && legacyList.taxonomy.version === TICKET_TAXONOMY.version);

response = await onRequestPatch({
  env: { DB: legacyDB }, params: { id: '1' },
  request: new Request('https://kiwi.test/api/tickets/1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'classify', kind: 'bug', area: 'sync', subkind: 'not-syncing' }),
  }),
});
const legacyClassify = await response.json();
check('classify stays rollout-safe before the columns arrive', response.status === 200
  && legacyClassify.classificationStored === false
  && legacy.prepare('SELECT status, expires_ts FROM kiwi_tickets WHERE id=1').get().status === 'problem');

const legacyForm = new FormData();
legacyForm.append('body', 'Created while schema is rolling out');
legacyForm.append('kind', 'bug');
response = await onRequestPost({
  env: { DB: legacyDB }, request: new Request('https://kiwi.test/api/tickets', { method: 'POST', body: legacyForm }),
});
const legacyCreated = await response.json();
check('POST still creates a ticket before the columns arrive', response.status === 201 && legacyCreated.classificationStored === false
  && legacy.prepare('SELECT COUNT(*) AS count FROM kiwi_tickets').get().count === 2);

const [html, client, mcp] = await Promise.all([
  read('tickets.html'), read('assets/tickets.js'), read('tools/tickets-mcp/server.js'),
]);
check('the board receives taxonomy from GET instead of embedding category ids', client.includes('state.taxonomy = data.taxonomy')
  && client.includes('state.taxonomy.kinds.forEach') && client.includes('state.taxonomy.areas.forEach')
  && client.includes('state.taxonomy.subkinds[kind]')
  && !html.includes('value="wrong-figures"') && !html.includes('value="caisse"'));
check('the board exposes quick composer classification and cross-column filters', html.includes('id="ticketKind"')
  && html.includes('id="kindFilters"') && html.includes('id="areaFilters"') && html.includes('id="moneyFilters"'));
check('the MCP derives validation from the API taxonomy and exposes classification', mcp.includes('validateClassification(taxonomy')
  && mcp.includes("name: 'classify_ticket'") && mcp.includes("case 'classify_ticket'"));

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} ticket taxonomy checks green`);

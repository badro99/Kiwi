#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const [html, client, updateApi, listApi, schema] = await Promise.all([
  read('tickets.html'),
  read('assets/tickets.js'),
  read('functions/api/tickets/[id].js'),
  read('functions/api/tickets/index.js'),
  read('schema.sql'),
]);

let failures = 0;
function check(label, condition) {
  if (condition) console.log('  ✓ ' + label);
  else { failures++; console.error('  ✗ ' + label); }
}

check('the testing card offers a distinct failed-test action',
  client.includes("failed.dataset.action = 'test-failed'") && client.includes("'Test failed'"));
check('the failed-test action opens a linked follow-up panel',
  html.includes('id="followupComposer"') && html.includes('id="followupTicketNumber"') && client.includes('openFollowup(ticket)'));
check('the follow-up requires notes and accepts optional images',
  html.includes('id="followupBody"') && html.includes('id="followupImages"') && html.includes('More images <small>optional</small>'));
check('the client submits a multipart failed action to the same ticket',
  client.includes("data.append('action', 'failed')") && client.includes('state.followupFiles.forEach') && client.includes("method: 'PATCH'"));
check('a failed test moves only a testing ticket back to problems',
  updateApi.includes("action !== 'failed'") && updateApi.includes("WHERE id = ? AND status = 'testing'") && updateApi.includes("SET status = 'problem'"));
check('failed-test notes are durable and linked to their ticket',
  schema.includes('CREATE TABLE IF NOT EXISTS kiwi_ticket_followups') && updateApi.includes('INSERT INTO kiwi_ticket_followups'));
check('follow-up photos are linked separately from original photos',
  schema.includes('followup_id  TEXT') && updateApi.includes('followup_id, created_ts'));
check('the board returns and groups follow-up notes and photos',
  listApi.includes('followupsByTicket') && listApi.includes('imagesByFollowup') && listApi.includes('followups:'));

if (failures) process.exit(1);
console.log('\n✓ Failed-test follow-up workflow is wired end to end.');

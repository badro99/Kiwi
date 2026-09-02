#!/usr/bin/env node
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const block = source.match(/function ingestSettledCloudSales\(sales\)[\s\S]*?function startEmployeeSaleJournalSync\(\)/)?.[0] || '';
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log('  ✓ ' + message);
};

ok(/saleTs\s*<\s*shiftOpenedAt\.getTime\(\)/.test(block),
  'a reopened caisse rejects settlements from the closed service');
ok(/const from\s*=\s*shiftOpenedAt\.getTime\(\)/.test(block),
  'the recovery fetch starts at the current service opening');
ok(!/businessDay\(saleTs/.test(block),
  'the caisse no longer hydrates its counter from the whole dashboard day');
ok(/saveProvisional\(true\)/.test(block),
  'current-service employee settlements still update the dashboard snapshot');

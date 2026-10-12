#!/usr/bin/env node
/* Kiwi · bug bash. Runs the charters of charters.json as `e2e explore`
 * sessions, a few at a time, then merges every finding into one file:
 *   .e2e/bash/<date>/findings.md
 *
 * A finding is a lead, not a bug. It becomes a bug only once a test in
 * tools/ fails because of it (README.md, « The proof rule »). The file
 * leaves a « Proof » line on each finding for exactly that.
 *
 *   node bug-bash.mjs                         every charter, 2 at a time
 *   node bug-bash.mjs --only till-ticket-totals,till-first-sale
 *   node bug-bash.mjs --jobs 1 --max-steps 4
 *
 * Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment
 * (Workers AI). Telemetry to the e2e authors is off for every session.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const jobs = Math.max(1, Number(opt('--jobs', 2)));
const maxSteps = String(opt('--max-steps', 6));

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set (Workers AI). See README.md.');
  process.exit(2);
}

const charters = JSON.parse(fs.readFileSync(path.join(here, 'charters.json'), 'utf8')).filter((c) => !only.length || only.includes(c.id));
if (!charters.length) { console.error('no charter matches --only'); process.exit(2); }
const day = new Date().toISOString().slice(0, 10);
const outRoot = path.join(here, '.e2e', 'bash', day);
fs.mkdirSync(outRoot, { recursive: true });
const bin = path.join(here, 'node_modules', '.bin', 'e2e');

function explore(c) {
  return new Promise((resolve) => {
    const output = path.join(outRoot, c.id);
    const argv = ['explore', c.goal, '--target', c.target, '--agent', c.agent, '--output', output, '--max-steps', maxSteps, '--reporter', 'list,markdown'];
    const t0 = Date.now();
    const child = spawn(bin, argv, { cwd: here, env: { ...process.env, E2E_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    console.log(`▶ ${c.id} (${c.target}, ${c.agent})`);
    child.on('close', (code) => {
      fs.writeFileSync(path.join(outRoot, `${c.id}.log`), log);
      let report = null;
      try { report = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')); } catch (_) {}
      const ex = report && report.run && report.run.explore;
      console.log(`■ ${c.id} exit ${code} · ${Math.round((Date.now() - t0) / 1000)} s · ${ex ? `${ex.findings.length} findings, ended ${ex.ended}` : 'no report'}`);
      resolve({ charter: c, code, explore: ex, output });
    });
  });
}

const queue = [...charters];
const results = [];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) results.push(await explore(queue.shift()));
}));

/* Merge, most severe issues first. */
const all = [];
for (const r of results) for (const f of (r.explore && r.explore.findings) || []) all.push({ ...f, charter: r.charter, output: r.output });
all.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'issue' ? -1 : 1) || b.severity - a.severity);
const SEV = ['', 'trivial', 'low', 'medium', 'high', 'critical'];
const L = [`# Bug bash · ${day}`, '', `${results.length} charters · ${all.length} findings (${all.filter((f) => f.kind === 'issue').length} issues). Model: ${process.env.KIWI_EXPLORE_MODEL || '@cf/zai-org/glm-5.3-flash'}.`, '',
  'Each finding is a lead. Before it is called a bug: rule out the known causes (demo data, the explorer itself, intended design), then write a test in tools/ that fails because of it, and fill in Proof. No failing test, no bug.', '',
  '| Charter | Exit | Ended | Findings |', '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.charter.id} | ${r.code} | ${r.explore ? r.explore.ended : 'no report'} | ${r.explore ? r.explore.findings.length : 0} |`), ''];
all.forEach((f, i) => {
  L.push(`## ${i + 1}. ${f.kind} · ${SEV[f.severity] || f.severity} · ${f.title}`, '');
  L.push(`Charter: ${f.charter.id} (${f.charter.target}, ${f.charter.agent})${f.path ? ` · at ${f.path}` : ''}`, '');
  L.push(`- Expected: ${f.expected}`, `- Observed: ${f.actual}`, '');
  if (f.reproduction && f.reproduction.length) { L.push('Steps:', ''); f.reproduction.forEach((s, j) => L.push(`${j + 1}. ${s}`)); L.push(''); }
  L.push(`Evidence: ${path.relative(outRoot, f.output)}/ (trace and screenshots under results/)`, '');
  L.push('Verdict: unreviewed · Proof: none yet', '');
});
const file = path.join(outRoot, 'findings.md');
fs.writeFileSync(file, L.join('\n') + '\n');
console.log(`\n${all.length} findings → ${path.relative(process.cwd(), file)}`);

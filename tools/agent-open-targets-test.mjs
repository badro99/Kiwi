import coreTestSource from './core-test-source.cjs';
/* Les boutons « Ouvrir … » de l'assistant appellent Kiwi.handlers[nom].
   Chaque nom doit exister, et le carnet clients doit ouvrir le carnet réel
   (clients-directory.js, qui lit KiwiClients), pas nav-clients : sur un compte
   réel celui-ci tombe sur une page d'attente vide, et en démo sur le CRM
   d'exemple du spa. Lecture statique, sans navigateur. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => coreTestSource.readFileSync(path.join(root, f), 'utf8');
const agentData = read('assets/agent-data.js');
const agent = read('assets/agent.js');
const shell = read('dashboard.html');

const targets = new Set();
for (const m of agentData.matchAll(/open1\(L, '([A-Za-z]+)', '([a-z0-9-]+)'\)/g)) targets.add(m[1] + ' ' + m[2]);
for (const m of agent.matchAll(/data-fa-open="([a-z0-9-]+)"/g)) targets.add('- ' + m[1]);
for (const src of [agent, agentData]) for (const m of src.matchAll(/\bhandler: '([a-z0-9-]+)'/g)) targets.add('- ' + m[1]);
assert.ok(targets.size >= 4, 'les cibles de l’assistant sont lues');

/* Scripts du tableau de bord, plus les sections chargées au premier usage. */
const scripts = [...shell.matchAll(/<script[^>]+src="(assets\/[^"?]+)/g)].map((m) => m[1]);
const lazy = fs.readdirSync(path.join(root, 'assets/pages-pro')).map((f) => 'assets/pages-pro/' + f);
const code = [...scripts, ...lazy].filter((f) => fs.existsSync(path.join(root, f))).map(read).join('\n');
/* handlers['x'] = …, h['x'] = …, ou une entrée « 'x': () => » d'une table d'actions. */
const defined = (name) => new RegExp(`\\[['"]${name}['"]\\]\\s*=(?!=)|['"]${name}['"]\\s*:\\s*(?:async\\s*)?(?:\\(|function\\b|[a-zA-Z_$][\\w$]*\\s*=>)`).test(code);
for (const t of targets) {
  const name = t.split(' ')[1];
  assert.ok(defined(name), `l’assistant ouvre « ${name} », qui doit être une action du tableau de bord`);
}

const clientBook = [...targets].filter((t) => t.startsWith('pClients '));
assert.ok(clientBook.length, 'l’assistant propose d’ouvrir le carnet clients');
for (const t of clientBook) assert.equal(t, 'pClients clients-directory', 'le carnet clients ouvre le carnet réel');
console.log(`✓ agent-open-targets · ${targets.size} cibles, toutes définies ; le carnet clients ouvre clients-directory`);

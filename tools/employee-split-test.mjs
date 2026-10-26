#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const route = fs.readFileSync(new URL('../functions/api/employee.js', import.meta.url), 'utf8');
for (const [name, handler] of [['attendance', 'handleAttendance'], ['leave', 'handleLeave']]) {
  const file = new URL(`../functions/api/employee/_${name}.js`, import.meta.url);
  assert.ok(fs.existsSync(file), `${name}: module privé requis`);
  assert.ok(file.pathname.split('/').at(-1).startsWith('_'), 'Pages ignore les modules privés');
  const mod = await import(file);
  assert.ok(!Object.keys(mod).some(key => key.startsWith('onRequest')), 'aucun export routable');
  for (const [action, roles] of Object.entries(mod.ACTION_ROLES)) {
    assert.deepEqual(roles, ['employee']);
    for (const role of ['owner', 'till', 'anonymous']) {
      const store = new Proxy({}, { get() { throw new Error('accès magasin avant autorisation'); } });
      const response = await mod[handler]({ actor: { role }, store, action, body: {} });
      assert.equal(response.status, 403, `${action}: rôle exclu`);
      assert.deepEqual(await response.json(), { error: 'employee-session-required' });
    }
  }
}
for (const logic of ['capturedAgoMs', 'presenceCode', 'planning.requests.push', 'planning.openShifts =', 'clockOutCodeTs', 'planning-date-invalid']) {
  assert.ok(!route.includes(logic), `logique extraite: ${logic}`);
}
console.log('✓ contrats employee: modules privés, refus des rôles exclus, route déléguée');

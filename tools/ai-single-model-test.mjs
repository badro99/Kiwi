import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = process.env.KIWI_VISION_TEST_ROOT || '..';
const dir = new URL(root + '/functions/api/ai/', import.meta.url);
assert.ok(fs.existsSync(new URL('_models.js', dir)), 'one shared model module exists');
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== '_models.js')) {
  assert.ok(!fs.readFileSync(new URL(name, dir), 'utf8').includes('@cf/'), name + ': no Workers AI literal outside the model module');
}
console.log('✓ all Workers AI literals have a single source');

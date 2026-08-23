import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(process.execPath, [fileURLToPath(new URL('./build-guides.mjs', import.meta.url)), '--check'], {
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

console.log('  ✓ guide HTML and sitemap match their source manifest');

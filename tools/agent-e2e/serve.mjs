#!/usr/bin/env node
/* Static server for the bug-bash pilot: the repo as shipped, on 127.0.0.1,
 * nothing else. There is no /api here, so every surface runs on its demo
 * data and no merchant's hosted books are reachable from an exploration.
 *   node serve.mjs <port>
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.argv[2] || 4300);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  let p;
  try { p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { res.writeHead(400); res.end(); return; }
  /* Hidden folders (.git, .env, .wrangler) are never served; the check runs on
     the path below the root, which itself may sit under .claude/worktrees. */
  if (!p.startsWith(root + path.sep) || path.relative(root, p).split(path.sep).some((seg) => seg.startsWith('.'))) { res.writeHead(403); res.end(); return; }
  if (p.endsWith(path.sep)) p += 'index.html';
  /* Cloudflare Pages serves /kiwi-serveur as kiwi-serveur.html: so do we. */
  else if (!path.extname(p) && fs.existsSync(p + '.html')) p += '.html';
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
}).listen(port, '127.0.0.1', () => console.log(`kiwi static on http://127.0.0.1:${port}`));

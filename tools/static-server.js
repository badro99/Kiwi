// Throwaway static server for local preview only (not committed).
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();

/* Même garde que tools/live-mock-server.js : `path.join(root, '/../..')`
 * remonte hors de la racine, et ce serveur écoute sur toutes les interfaces.
 * `resolve` + séparateur, sinon /kiwi-secrets passerait pour du /kiwi. */
function within(dir, file) {
  const base = path.resolve(dir);
  const target = path.resolve(file);
  return target === base || target.startsWith(base + path.sep);
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // Directory → its index. Both production hosts (Cloudflare Pages, GitHub
  // Pages) resolve `/fr/` to `/fr/index.html` on their own; this server did it
  // only for the bare root, so every locale of the exported site 404'd here
  // while being perfectly fine deployed. That gap reads as a broken build.
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!within(root, file)) { res.statusCode = 403; res.end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    // Never let the browser heuristically cache during a preview session —
    // a stale assets/*.css silently invalidates every visual check.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.end(buf);
  });
}).listen(process.env.PORT || 4178, function () { console.log('static on ' + this.address().port); });

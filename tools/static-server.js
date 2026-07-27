// Throwaway static server for local preview only (not committed).
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    // Never let the browser heuristically cache during a preview session —
    // a stale assets/*.css silently invalidates every visual check.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.end(buf);
  });
}).listen(process.env.PORT || 4178, function () { console.log('static on ' + this.address().port); });

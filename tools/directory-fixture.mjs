/* Annuaire Kiwi · un serveur local pour les suites navigateur.
 *
 * Sert les fichiers du dépôt comme Cloudflare Pages, et appelle les vraies
 * Pages Functions de l'annuaire (pages, inscription, signalement, sitemap) sur
 * une base SQLite en mémoire construite depuis schema.sql. Les fiches semées
 * ici sont des FIXTURES DE TEST : elles n'existent que dans ce processus et ne
 * touchent aucune base réelle (l'annuaire de production commence vide).
 *
 *   const srv = await startDirectoryServer();  // { base, sql, close() }
 * Utilisé par tools/directory-browser-test.mjs et tools/a11y-browser-test.mjs. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { directoryPage } from '../functions/api/_directory-page.js';
import { onRequestPost as submit } from '../functions/api/directory/submit.js';
import { onRequestPost as report } from '../functions/api/directory/report.js';
import { onRequest as sitemap } from '../functions/sitemap-annuaire.xml.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

export function directoryDb({ seed = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  class Statement {
    constructor(q) { this.q = q; this.args = []; }
    bind(...a) { this.args = a.map((x) => (x === undefined ? null : x)); return this; }
    async first() { return sql.prepare(this.q).get(...this.args) ?? null; }
    async all() { return { results: sql.prepare(this.q).all(...this.args) }; }
    async run() { const r = sql.prepare(this.q).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
  }
  if (seed) seedFixtures(sql);
  return { sql, DB: { prepare: (q) => new Statement(q) } };
}

function seedFixtures(sql) {
  const now = Date.UTC(2026, 10, 9, 10);
  sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?,?,?,?,?)")
    .run('fixture-cafe-atlas', '{"orderpro":true}', 'Café Atlas', 'cafe', now);
  sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)").run('fixture-cafe-atlas', 'hours', JSON.stringify({
    week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: true, periods: [{ from: '07:30', to: '22:00' }] }]).concat([['sun', { open: true, periods: [{ from: '09:00', to: '14:00' }] }]])),
  }), 1, now);
  sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)").run('fixture-cafe-atlas', 'reservations', '{"settings":{"published":true}}', 1, now);
  sql.prepare("INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?,?,?,?,?)").run('fixture-cafe-atlas', 'Café Atlas', 'cafe', '{"cats":[],"items":[{"id":"a","name":"Nous nous","price":12}]}', now);
  const rows = [
    ['client', 'fixture-cafe-atlas', 'Café Atlas', 'cafe', 'casablanca', '24 boulevard Ghandi, Maârif', 'Café de quartier depuis 2009 : petit-déjeuner marocain, pâtisseries maison et terrasse ombragée. Wi-Fi et prises pour travailler.', 'https://cafe-atlas.example.ma', '0522000101', 1, 1],
    ['public', null, 'Épicerie Al Baraka', 'epicerie', 'casablanca', '7 rue Ibn Toufail, Bourgogne', 'Produits du terroir, épices, huile d’argan et fruits secs. Livraison dans le quartier.', '', '0661000202', 1, 0],
    ['public', null, 'Pressing Lumière', 'pressing', 'rabat', '15 avenue de France, Agdal', 'Nettoyage à sec, repassage et retouches en 48 heures.', '', '', 0, 0],
    ['public', null, 'Riad Yasmine', 'hotel', 'marrakech', 'Derb Sidi Bouloukat, Médina', 'Six chambres autour d’un patio, hammam et terrasse sur les toits.', 'https://riad-yasmine.example.ma', '0524000303', 1, 1],
    ['public', null, 'مخبزة النور', 'bakery', 'fes', 'حي النرجس', 'خبز تقليدي وحلويات مغربية طازجة كل صباح.', '', '', 0, 0],
  ];
  rows.forEach(([kind, merchant, name, trade, city, address, description, website, phone, show, wa], i) => {
    const slug = (name === 'مخبزة النور' ? 'boulangerie' : name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '-' + city;
    sql.prepare(`INSERT INTO directory_listings (id, slug, kind, merchant, status, name, trade, city, address, description, website, show_phone, whatsapp,
      contact_name, contact_email, contact_phone, dedupe_key, lang, created_ts, updated_ts) VALUES (?,?,?,?,'approved',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('dl-fixture-' + i, slug, kind, merchant, name, trade, city, address, description, website, show, wa,
        'Contact Privé', 'prive@example.com', phone, slug, 'fr', now, now);
  });
}

async function toWeb(req, body) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('CF-Connecting-IP', '127.0.0.' + (1 + Math.floor(Math.random() * 200)));
  return new Request('http://' + req.headers.host + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

export async function startDirectoryServer(opts = {}) {
  const { sql, DB } = directoryDb(opts);
  const env = { DB };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    let handler = null;
    if (pathname.startsWith('/fr/annuaire')) handler = (c) => directoryPage(c, 'fr');
    else if (pathname.startsWith('/en/directory')) handler = (c) => directoryPage(c, 'en');
    else if (pathname.startsWith('/ar/annuaire')) handler = (c) => directoryPage(c, 'ar');
    else if (pathname === '/api/directory/submit') handler = submit;
    else if (pathname === '/api/directory/report') handler = report;
    else if (pathname === '/sitemap-annuaire.xml') handler = sitemap;
    if (handler) {
      const r = await handler({ env, request: await toWeb(req, Buffer.concat(chunks)) });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const file = path.resolve(ROOT, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      res.writeHead(err ? 404 : 200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(err ? '' : data);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, sql, close: () => new Promise((r) => server.close(r)) };
}

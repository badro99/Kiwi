import invoicingSourceHelper from './invoicing-test-source.cjs';
/* Facturation · une longue facture mêlant arabe et français s'imprime en PDF
 * lisible, page après page.
 *
 * invoicing-print-test.mjs lit le HTML du gabarit ; il ne dit rien de ce que
 * Chromium en fait sur papier A4. Ici le vrai printable() de
 * assets/invoicing.js produit une facture de 90 lignes (désignations mêlant
 * arabe et latin, références longues sans espace, une ligne de plusieurs
 * phrases) et une note longue, en français puis en arabe. Chromium l'imprime
 * en PDF (page.pdf, A4 du gabarit) et pdftotext -bbox-layout en relit chaque
 * mot avec sa page et sa position. On exige :
 *  · chaque ligne présente une fois, sa désignation entière sur une même page
 *    (une ligne de tableau n'est pas coupée entre deux feuilles) ;
 *  · l'en-tête du tableau répété sur chaque page qui porte des lignes ;
 *  · aucun mot hors de la feuille ;
 *  · le pied de page (vendeur · numéro) ne recouvre aucun mot du document ;
 *  · le bloc des totaux (HT, TVA, TTC) tient sur une seule page.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, PDF pagination not checked'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, PDF pagination not checked'); process.exit(process.env.CI ? 1 : 0); }
const PDFTOTEXT = ['/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext', '/usr/bin/pdftotext'].find(fs.existsSync);
if (!PDFTOTEXT) { console.log('○ skip: pdftotext (poppler) unavailable, PDF pagination not checked'); process.exit(process.env.CI ? 1 : 0); }

/* Le gabarit réel, extrait comme dans invoicing-print-test.mjs. */
const src = invoicingSourceHelper.invoicingTestSource(ROOT);
const slice = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error('repère introuvable : ' + from + ' … ' + to);
  return src.slice(a, b);
};
const code = [
  slice('  const VAT_RATES', '  /* ── erreurs d\'API'),
  slice('  function getSeller()', '  /* ── libellés de documents'),
  slice('  /* print:start */', '  /* print:end */'),
  'globalThis.__printable = printable;',
].join('\n');

const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let lang = 'fr';
const seller = { name: 'Atelier Test', legalName: 'Atelier Test SARL', ice: '001234567000089', if: '1234567', rc: '98765', patente: '4455', address: '12 rue des Tests', city: 'Casablanca', phone: '0522000000' };
const window = {
  KiwiI18n: { getLang: () => lang },
  KiwiMe: { business: 'Atelier Test' },
  KiwiInvoice: { html: () => '', getSellerBusiness: () => seller },
};
const ctx = vm.createContext({
  window, document: { documentElement: { lang: 'fr' }, baseURI: base },
  localStorage: { getItem: () => null }, Intl, Date, Math, Number, String, JSON, Set, Map, URLSearchParams, isFinite,
});
vm.runInContext(code, ctx);

/* 90 lignes : chaque désignation commence par Kxx et finit par Zxx, deux
 * repères latins que pdftotext relit quel que soit le sens d'écriture. */
const N = 90;
const pad = (i) => String(i).padStart(3, '0');
const arabic = ['طاجين دجاج بالليمون', 'شاي بالنعناع', 'كسكس بالخضر', 'حلويات مغربية تقليدية'];
const lines = Array.from({ length: N }, (_, i) => {
  const k = pad(i + 1);
  let mid = `${arabic[i % arabic.length]} Formule ${i % 7 + 1}`;
  if (i % 9 === 4) mid += ' REF-' + 'ABCDEFGHJKLMNPQRSTUVWXYZ'.repeat(3);
  if (i % 13 === 6) mid += ' ' + 'service traiteur livré sur place avec installation et reprise du matériel '.repeat(3) + 'خدمة كاملة';
  return { description: `K${k} ${mid} Z${k}`, qty: (i % 5) + 1, unitHT: 1250 + i * 37, discountPct: i % 4 === 0 ? 10 : 0, vatRate: [20, 10, 14, 7, 0][i % 5] };
});
const invoice = {
  type: 'invoice', status: 'issued', number: 'F-2026-0777', issueDate: '2026-10-13', dueDate: '2026-11-12', termsDays: 30, seller,
  customer: { name: 'رياض الاختبار Riad Test', address: '5 derb Test, Marrakech', ice: '001561191000066', if: '7654321', email: 'compta@riad.test' },
  lines, paymentMethod: 'transfer',
  note: ('Paiement par virement à réception. ' + 'شكرا لثقتكم. ').repeat(12),
  exemptionMention: 'Exonération de TVA, article 91 du CGI',
};

/* pdftotext -bbox-layout : <page width height> puis <word xMin yMin xMax yMax>. */
function readPdf(file) {
  const xml = execFileSync(PDFTOTEXT, ['-bbox-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const pages = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (let m; (m = pageRe.exec(xml));) {
    const words = [];
    for (let w; (w = wordRe.exec(m[3]));) words.push({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4], text: w[5].replace(/&amp;/g, '&') });
    pages.push({ width: +m[1], height: +m[2], words });
  }
  return pages;
}
const overlap = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
const s = suite('invoicing-pdf-pages', { browser });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-invoice-pdf-'));

for (const l of ['fr', 'ar']) {
  await s.run(`facture longue ${l.toUpperCase()} · pagination A4 lisible`, async (t) => {
    lang = l;
    const html = ctx.__printable(invoice, { paidCents: 0, balanceCents: 0 }).replace(/<script>[\s\S]*?<\/script>/, '');
    const page = t.watch(await browser.newPage());
    t.defer(() => page.close());
    await page.setContent(html, { waitUntil: 'load' });
    const file = path.join(tmp, `facture-${l}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const pages = readPdf(file);
    assert.ok(pages.length >= 3, `une facture de ${N} lignes tient sur plusieurs pages (${pages.length})`);

    const where = (text) => pages.flatMap((p, i) => p.words.filter((w) => w.text === text).map((w) => ({ ...w, page: i })));
    const headerWord = l === 'fr' ? 'Qté' : null;
    for (let i = 1; i <= N; i++) {
      const k = where('K' + pad(i)), z = where('Z' + pad(i));
      assert.equal(k.length, 1, `la ligne ${i} apparaît une fois (K${pad(i)} : ${k.length})`);
      assert.equal(z.length, 1, `la ligne ${i} se termine une fois (Z${pad(i)} : ${z.length})`);
      assert.equal(k[0].page, z[0].page, `la ligne ${i} n'est pas coupée entre les pages ${k[0].page + 1} et ${z[0].page + 1}`);
    }
    const rowPages = new Set(where('K001').concat(...Array.from({ length: N }, (_, i) => where('K' + pad(i + 1)))).map((w) => w.page));
    if (headerWord) for (const p of rowPages) assert.ok(pages[p].words.some((w) => w.text === headerWord), `l'en-tête du tableau est répété page ${p + 1}`);
    else for (const p of rowPages) assert.ok(pages[p].words.some((w) => w.text === '%'), `l'en-tête du tableau est répété page ${p + 1}`);

    pages.forEach((p, i) => p.words.forEach((w) => {
      assert.ok(w.x0 >= -0.5 && w.x1 <= p.width + 0.5 && w.y1 <= p.height + 0.5, `page ${i + 1} : « ${w.text} » sort de la feuille`);
    }));

    /* Le pied de page est répété sur chaque feuille : « F-2026-0777 » en bas. */
    pages.forEach((p, i) => {
      const foot = p.words.filter((w) => w.text.includes('F-2026-0777') && w.y0 > p.height * 0.85);
      assert.ok(foot.length, `page ${i + 1} : le pied de page porte le numéro`);
      const band = { x0: 0, x1: p.width, y0: Math.min(...foot.map((w) => w.y0)) - 1, y1: Math.max(...foot.map((w) => w.y1)) + 1 };
      const footLine = p.words.filter((w) => w.y0 >= band.y0 && w.y1 <= band.y1 && Math.abs(w.y0 - foot[0].y0) < 2);
      const hit = p.words.find((w) => !footLine.includes(w) && overlap(w, band));
      assert.ok(!hit, `page ${i + 1} : le pied de page recouvre « ${hit && hit.text} »`);
    });

    /* Les totaux : seuls les montants du bloc des totaux portent « MAD » (les
     * lignes impriment des montants nus). Tous sur une même page. */
    const mad = where('MAD');
    assert.ok(mad.length >= 3, `le bloc des totaux est imprimé (${mad.length} montants en MAD)`);
    const totalsPages = [...new Set(mad.map((w) => w.page))];
    assert.equal(totalsPages.length, 1, `le bloc des totaux tient sur une page (pages ${totalsPages.map((p) => p + 1).join(', ')})`);
    assert.ok(where('91').some((w) => w.page >= totalsPages[0]), 'la mention d’exonération suit les totaux');
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
server.close();
await s.finish();

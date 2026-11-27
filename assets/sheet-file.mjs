/* Kiwi · lire un fichier de tableur, quel qu'il soit (27 nov. 2026)
 * ---------------------------------------------------------------------------
 * « Quelqu'un essayait d'importer, ça ne marchait pas. » Les écrans d'import
 * (carte, catalogue boutique, liste de stock, heures du planning) ne prenaient
 * qu'un CSV : un commerçant qui a son fichier en .xlsx, ou un CSV enregistré
 * par Excel en français (Windows-1252), ou un export Numbers (tabulations),
 * tombait sur « fichier non reconnu ». Ce module lit les trois, dans le
 * navigateur, sans rien envoyer :
 *
 *   readSheetFile(file) → { ok, rows, sheet, error }
 *       rows : lignes de cellules, la première feuille non vide d'un .xlsx
 *       (nombres gardés en nombres : un numéro de série de date, un code-barres
 *       de 13 chiffres) ou le CSV / TSV décodé ;
 *       error : 'xls' (vieux format binaire), 'unreadable', 'empty'.
 *   textRows(text) → les lignes d'un CSV ou d'un collage (séparateur deviné).
 *
 * Chargé par import() : les écrans qui s'en servent ne gagnent aucun global.
 * Le lecteur .xlsx est celui du catalogue (pages-pro/catalog-bulk/xlsx.js).
 * ─────────────────────────────────────────────────────────────────────────── */

const XLSX_URL = './pages-pro/catalog-bulk/xlsx.js?v=3';

/* UTF-8 strict d'abord ; Excel FR sous Windows écrit encore en Windows-1252. */
export function decodeBytes(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {}
  try { return new TextDecoder('windows-1252').decode(bytes); } catch (_) {}
  try { return new TextDecoder().decode(bytes); } catch (_) { return ''; }
}

function rowsWith(text, delim) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      continue;
    }
    if (c === '"' && field.trim() === '') { quoted = true; field = ''; }
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Le séparateur qui donne le plus de colonnes à la ligne la plus large des
   dix premières (une ligne de titre au-dessus de l'en-tête n'en a qu'une). */
export function textRows(text) {
  text = String(text == null ? '' : text);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  let best = null, bestWidth = -1;
  for (const d of [',', ';', '\t', '|']) {
    const rows = rowsWith(text, d)
      .map((r) => r.map((c) => String(c).trim().replace(/^'(?=[=+\-@])/, '')))
      /* A line of bare separators (« ;; ») is empty whatever the guess. */
      .filter((r) => r.join('').replace(/[,;\t|\s"]/g, '') !== '');
    const width = Math.max(0, ...rows.slice(0, 10).map((r) => r.filter((c) => c !== '').length));
    if (width > bestWidth) { best = rows; bestWidth = width; }
  }
  return best || [];
}

let xlsxLoad = null;
function xlsx() {
  if (globalThis.KiwiXlsx) return Promise.resolve(globalThis.KiwiXlsx);
  if (!xlsxLoad) xlsxLoad = import(new URL(XLSX_URL, import.meta.url).href).then(() => globalThis.KiwiXlsx, () => { xlsxLoad = null; return null; });
  return xlsxLoad;
}

const filled = (rows) => rows.filter((r) => r && r.some((c) => String(c == null ? '' : c).trim() !== '')).length;

export async function readSheetFile(file) {
  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (_) { return { ok: false, error: 'unreadable', rows: [] }; }
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return { ok: false, error: 'xls', rows: [] };
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const X = await xlsx();
    if (!X) return { ok: false, error: 'unreadable', rows: [] };
    try {
      let book = await X.read(bytes, { sheet: 0, rows: 20001 });
      /* Un classeur dont la première feuille est vide (page de garde) : la
         première feuille qui a au moins une ligne d'en-tête et une donnée. */
      for (let i = 1; filled(book.rows) < 2 && i < (book.sheets || []).length; i++) book = await X.read(bytes, { sheet: i, rows: 20001 });
      const rows = book.rows.map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c)));
      return filled(rows) ? { ok: true, rows, sheet: book.sheet } : { ok: false, error: 'empty', rows: [] };
    } catch (e) {
      return { ok: false, error: /too-many-rows|too-big/.test(String(e && e.message)) ? 'too-big' : 'unreadable', rows: [] };
    }
  }
  const rows = textRows(decodeBytes(bytes));
  return filled(rows) ? { ok: true, rows, sheet: '' } : { ok: false, error: 'empty', rows: [] };
}

/* Les mots d'erreur, pour un toast. */
export function errorText(error, lang) {
  const T = {
    fr: { xls: 'Ce fichier est au vieux format .xls : ouvrez-le dans Excel et enregistrez-le en .xlsx ou .csv.', 'too-big': 'Fichier trop grand (20 000 lignes au plus).', empty: 'Ce fichier ne contient aucune ligne.', unreadable: 'Fichier illisible : enregistrez-le en .xlsx ou .csv.' },
    en: { xls: 'This file is in the old .xls format: open it in Excel and save it as .xlsx or .csv.', 'too-big': 'File too large (20,000 rows at most).', empty: 'This file has no rows.', unreadable: 'Unreadable file: save it as .xlsx or .csv.' },
    ar: { xls: 'هذا الملف بصيغة ‎.xls القديمة: افتحه في Excel واحفظه بصيغة ‎.xlsx أو ‎.csv.', 'too-big': 'الملف كبير جداً (20000 سطر على الأكثر).', empty: 'لا يحتوي هذا الملف على أي سطر.', unreadable: 'ملف غير مقروء: احفظه بصيغة ‎.xlsx أو ‎.csv.' },
  };
  return (T[lang] || T.fr)[error] || T.fr.unreadable;
}

/* Les types qu'un sélecteur de fichier doit proposer. */
export const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/tab-separated-values';

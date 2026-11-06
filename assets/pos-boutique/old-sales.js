/* Caisse boutique · retrouver une vente plus ancienne que le journal local.
 *
 * La fenêtre de retour du commerçant va jusqu'à 90 jours (return-window.js) ;
 * le journal local n'en garde que 30 au plus, pour ne pas dépasser le quota du
 * navigateur. Une vente de 31 à 90 jours se lit donc sur le serveur, UNE
 * JOURNÉE à la fois (lecture bornée `window=1` de /api/feed, qui pagine par
 * curseur), au moment où la caissière choisit cette date. Une lecture
 * incomplète (page manquante, forme inattendue, curseur répété) rend null :
 * jamais un début de journée présenté comme la journée entière. */
const PAGES = 12;
export async function readDayRows(merchant, from, to, get) {
  if (!merchant || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return null;
  const rows = [], seen = new Set();
  let after = '';
  for (let page = 0; page < PAGES; page++) {
    const url = '/api/feed?window=1&merchant=' + encodeURIComponent(merchant) + '&from=' + from + '&to=' + to + '&limit=500'
      + (after ? '&after=' + encodeURIComponent(after) : '');
    const data = await get(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!data || data.merchant !== merchant || !Array.isArray(data.sales) || typeof data.complete !== 'boolean') return null;
    for (const row of data.sales) rows.push(row);
    if (data.complete) return rows;
    if (typeof data.next !== 'string' || !data.next || !data.sales.length || seen.has(data.next)) return null;
    seen.add(data.next); after = data.next;
  }
  return null;
}

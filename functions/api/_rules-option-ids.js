/* Quelles options d'une ligne de vente sont reliées au stock : celles qui ont
 * une fiche `opt:<id du choix>` dans le document des coûts
 * (assets/menu-option-stock.js). Une règle, deux lecteurs : le décompte du
 * stock (assets/inventory-consumption.js) et le coût matière (assets/cost.js).
 * Les deux doivent voir les MÊMES options, sinon le stock sort une canette que
 * la marge ne compte pas.
 *
 * Le choix se trouve par son identifiant (caisse : opts[].c ou optionIds ;
 * vente rapide : options[].id ; app serveur : optionChoices[].choiceId). Une
 * commande venue d'ailleurs ne porte plus que le texte « Groupe : Choix » que
 * le serveur a validé : on le relit, et un nom ambigu ne rend rien. */
const fold = (v) => String(v == null ? '' : v).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
const listOf = (v) => (Array.isArray(v) ? v : []);

export function optionChoiceIds(line, recipes) {
  const book = recipes || {};
  const out = [];
  const seen = new Set();
  let structured = false;
  const add = (raw) => {
    const id = String(raw == null ? '' : raw);
    if (!id) return;
    structured = true;
    if (!seen.has(id) && book['opt:' + id]) { seen.add(id); out.push(id); }
  };
  if (!line) return out;
  listOf(line.opts).forEach((o) => { if (o) add(o.c || o.choiceId); });
  listOf(line.optionIds).forEach(add);
  listOf(line.options).forEach((o) => { if (o) add(typeof o === 'object' ? o.id : o); });
  listOf(line.optionChoices).forEach((o) => { if (o && (o.choiceId || o.id)) add(o.choiceId || o.id); });
  if (structured) return out;
  const wanted = [];
  listOf(line.optionChoices).forEach((o) => { if (o && o.label) wanted.push({ group: String(o.group || ''), name: fold(o.label) }); });
  const text = typeof line.optionText === 'string' ? line.optionText : (typeof line.options === 'string' ? line.options : '');
  if (!wanted.length && text) {
    text.split(/\s*·\s*/).forEach((part) => {
      const at = part.indexOf(':');
      if (at > 0) wanted.push({ groupName: fold(part.slice(0, at)), name: fold(part.slice(at + 1)) });
    });
  }
  const keys = Object.keys(book).filter((k) => k.indexOf('opt:') === 0 && book[k]);
  wanted.forEach((w) => {
    const hits = keys.filter((k) => {
      const r = book[k];
      if (fold(r.name) !== w.name) return false;
      return w.group ? String(r.group || '') === w.group : fold(r.groupName) === w.groupName;
    });
    const id = hits.length === 1 ? hits[0].slice(4) : '';
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  });
  return out;
}

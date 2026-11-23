// La catégorie d'une sortie de caisse (migration 0036, assets/till-categories.js).
//
// Les seize clés d'assets/expenses/engine.js › CATEGORIES, rien d'autre : la
// caisse les choisit, la page Dépenses les relit telles quelles. Une base qui
// n'a pas encore la colonne garde la sortie sans catégorie, jamais refusée :
// la page la devine alors d'après le motif, comme avant.
export const CASH_CATEGORIES = new Set(['meat', 'produce', 'grocery', 'drinks', 'hygiene', 'packaging', 'supplier', 'energy',
  'rent', 'repairs', 'transport', 'staff', 'marketing', 'equipment', 'taxes', 'other']);

/* Une colonne ajoutée ne disparaît pas : seul un « oui » est gardé (par base),
   un « non » se redemande (la migration peut arriver entre deux requêtes). */
const present = new WeakSet();
export async function hasCategoryColumn(env) {
  const db = env && env.DB;
  if (!db) return false;
  if (present.has(db)) return true;
  try {
    const columns = await db.prepare('PRAGMA table_info(cash_session_events)').all();
    if (((columns && columns.results) || []).some((column) => column.name === 'movement_category')) present.add(db);
  } catch (_) { /* base muette : sans catégorie */ }
  return present.has(db);
}

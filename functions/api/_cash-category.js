// La catégorie d'une sortie de caisse (migration 0036, assets/till-categories.js).
//
// Les seize clés d'assets/expenses/engine.js › CATEGORIES, rien d'autre : la
// caisse les choisit, la page Dépenses les relit telles quelles. La colonne
// existe en production depuis le 23 nov. 2026 : aucune sonde de schéma ici
// (tools/schema-minimum-test.mjs les refuse).
export const CASH_CATEGORIES = new Set(['meat', 'produce', 'grocery', 'drinks', 'hygiene', 'packaging', 'supplier', 'energy',
  'rent', 'repairs', 'transport', 'staff', 'marketing', 'equipment', 'taxes', 'other']);


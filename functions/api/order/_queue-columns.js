// Contrat : variantes de projection SQL et diagnostics de colonnes ; aucune écriture.
/* Les colonnes se sont ajoutées par vagues : `channel/ext_ref/customer` avec la
 * livraison, `session_id/server_name/paid_ts` avec la session de table. Une base
 * où une vague n'est pas passée fait échouer le SELECT qui la nomme, et un
 * SELECT qui échoue rendrait ici une file VIDE — le comptoir ne verrait plus
 * rien, sans que rien ne le signale. On essaie donc du plus riche au plus
 * pauvre, et on s'arrête au premier qui répond. */
const BASE = 'id, number, mode, table_no, total, lines, status, created_ts, updated_ts';
const COL_SETS = [
  BASE + ', channel, ext_ref, customer, session_id, server_name, paid_ts',
  BASE + ', channel, ext_ref, customer',
  BASE + ', session_id, server_name, paid_ts',
  BASE,
];
/* Ce que la base N'A PAS quand c'est cette forme-là qui a répondu.
 *
 * Le repli est volontaire — mieux vaut une file dégradée qu'une file vide —
 * mais il était MUET, et c'est ce qui coûtait cher : une base sans
 * `session_id` sert des commandes que l'app employé n'affichera jamais, une
 * base sans `client_ref` n'a plus aucune protection contre le doublon, et dans
 * les deux cas tout paraît sain. On le dit donc, dans la réponse, à chaque
 * sondage : c'est la différence entre « ça marche » et « ça marche encore ». */
const COL_SET_MISSING = [
  [],
  ['session_id', 'server_name', 'paid_ts'],
  ['channel', 'ext_ref', 'customer'],
  ['channel', 'ext_ref', 'customer', 'session_id', 'server_name', 'paid_ts'],
];


export { COL_SETS, COL_SET_MISSING };

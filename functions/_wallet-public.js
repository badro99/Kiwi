/* La carte Wallet des clients d'un commerce (functions/api/wallet/) : ce que la
 * porte du site laisse passer sans session. Chaque handler se défend lui-même :
 *   · /carte/<boutique>[/<carte>] : la page statique (aucune donnée dedans) ;
 *   · POST /api/wallet/enroll : n'émet une carte que pour un numéro NOUVEAU, un
 *     ticket réel de moins de 7 jours ou un jeton de caisse à usage unique, et
 *     plafonne 20 essais par heure et par adresse ;
 *   · /api/wallet/v1/... : le service web d'Apple, authentifié par le jeton de
 *     la carte (« ApplePass … »), et le premier téléchargement (?t=jeton) ;
 *   · /api/wallet/card : la carte web, au jeton de la carte ;
 *   · /api/wallet/strip/... : des images sans état (tampons, logo du programme).
 * /api/wallet/till-token reste derrière la porte normale. */
export function walletOpen(method, path) {
  const read = method === 'GET' || method === 'HEAD';
  if (read && (path === '/carte' || path === '/carte.html' || /^\/carte\/[a-z0-9-]{1,64}(\/[a-z0-9]{1,40})?$/.test(path))) return true;
  if (read && (path === '/api/wallet/card' || path.startsWith('/api/wallet/strip/'))) return true;
  if (method === 'POST' && path === '/api/wallet/enroll') return true;
  return path.startsWith('/api/wallet/v1/') && ['GET', 'HEAD', 'POST', 'DELETE'].includes(method);
}

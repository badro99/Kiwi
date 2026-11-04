/* Seau des créations publiques : une adresse IPv6 est un bloc entier, donc toute
   la /64 d'un client partage UN seau. Renvoie 'v6:<4 premiers groupes>' ou ''
   (le limiteur retombe alors sur l'adresse brute : IPv4, valeur illisible ou
   absente). Seul CF-Connecting-IP est lu : X-Forwarded-For est écrit par le
   client quand l'en-tête Cloudflare manque. */
export function sourceIdentity(request) {
  const ip = String(request.headers.get('CF-Connecting-IP') || '').trim().toLowerCase();
  if (!ip.includes(':') || ip.includes('.')) return '';
  const halves = ip.split('::');
  if (halves.length > 2) return '';
  const side = (text) => (text === '' ? [] : text.split(':'));
  const head = side(halves[0]), tail = halves.length === 2 ? side(halves[1]) : [];
  let groups;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return '';
    groups = head.concat(Array(fill).fill('0'), tail);
  } else groups = head;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return '';
  return 'v6:' + groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

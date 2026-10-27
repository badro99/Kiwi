// D'où vient une requête, à la maille qui compte pour un plafond d'abus.
//
// Une adresse IPv4 coûte cher : un client en a une, et le compteur par adresse
// exacte tient. Une adresse IPv6 ne coûte rien : un abonné reçoit au moins un
// /64, soit 2^64 adresses, et un script qui en change à chaque requête
// repartait à zéro sur chaque compteur tenu « par adresse ». On compte donc
// l'IPv6 par préfixe /64 (le réseau d'un abonné), et l'on garde une maille plus
// large (/48 en IPv6, /24 en IPv4) pour celui qui fait tourner ses réseaux.
//
// CF-Connecting-IP est posé par le bord Cloudflare et ne vient pas du client.

export function clientAddress(request) {
  return String(request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || '').split(',')[0].trim();
}

/* Huit groupes de 16 bits, ou null. Accepte « :: », la zone (« %eth0 ») et la
   forme mixte « ::ffff:1.2.3.4 ». */
function ipv6Groups(ip) {
  let s = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!s.includes(':')) return null;
  const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const p = v4[2].split('.').map(Number);
    if (p.some((n) => n > 255)) return null;
    s = v4[1] + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function ipv4Parts(ip) {
  const m = String(ip || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some((n) => n > 255) ? null : p;
}

/* `narrow` : la maille d'un client (IPv4 exacte, IPv6 /64).
   `wide`   : la maille d'un opérateur de réseaux (IPv4 /24, IPv6 /48).
   L'IPv4 garde sa clé historique (l'adresse nue) pour que les compteurs déjà
   posés en base continuent de compter. Rien d'identifiable → deux chaînes vides. */
export function sourceKeys(ip) {
  const groups = ipv6Groups(ip);
  if (groups) {
    // ::ffff:a.b.c.d est une adresse IPv4 vue par une pile IPv6.
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      const v4 = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
      return sourceKeys(v4);
    }
    const hex = groups.map((g) => g.toString(16));
    return { narrow: 'v6/64:' + hex.slice(0, 4).join(':'), wide: 'v6/48:' + hex.slice(0, 3).join(':') };
  }
  const p = ipv4Parts(ip);
  if (p) return { narrow: p.join('.'), wide: 'v4/24:' + p.slice(0, 3).join('.') };
  // Une valeur illisible garde le comportement d'avant : un compteur à son nom.
  return { narrow: String(ip || '').trim().slice(0, 64), wide: '' };
}

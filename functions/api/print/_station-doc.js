/* Le document « printstations » (copie serveur du routage des imprimantes par
 * poste, assets/printer/station-backup.js) est relu par d'AUTRES caisses du
 * commerce, qui l'appliquent quand le leur a disparu. Une caisse appairée peut
 * l'écrire : il ne doit donc porter que des imprimantes du magasin. Une
 * imprimante réseau est une adresse privée (10/8, 172.16/12, 192.168/16,
 * 169.254/16) ou un nom local (« imprimante », « cuisine.local », « bar.lan »),
 * jamais une adresse publique où partiraient les tickets. Le reste est borné. */
export const STATION_TYPES = new Set(['ip', 'os', 'usb', 'bt']);
const ID = /^[A-Za-z0-9_-]{1,60}$/;

export function localPrinterHost(value) {
  const s = String(value || '').trim().toLowerCase();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some((n) => n > 255)) return false;
    return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168) || (o[0] === 169 && o[1] === 254);
  }
  return /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.(local|lan|home|internal))?$/.test(s);
}

const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').slice(0, n);

/* Rend le document nettoyé : une imprimante hors règle est retirée, et le poste
   qui la visait perd sa liaison (il retombe sur l'imprimante par défaut). */
export function cleanStationDoc(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const profiles = [];
  for (const p of Array.isArray(src.profiles) ? src.profiles.slice(0, 40) : []) {
    if (!p || typeof p !== 'object' || !ID.test(String(p.id || '')) || !STATION_TYPES.has(p.type)) continue;
    const out = { id: String(p.id), name: text(p.name, 40), type: p.type };
    if (p.type === 'ip') {
      if (!localPrinterHost(p.ip)) continue;
      const port = Number(p.port);
      out.ip = String(p.ip).trim().toLowerCase();
      out.port = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 9100;
    }
    if (p.type === 'os') out.osPrinter = text(p.osPrinter, 120);
    if (p.paper != null) out.paper = text(p.paper, 8);
    profiles.push(out);
  }
  const ids = new Set(profiles.map((p) => p.id));
  const bindings = {};
  const b = src.bindings && typeof src.bindings === 'object' && !Array.isArray(src.bindings) ? src.bindings : {};
  for (const k of Object.keys(b).slice(0, 80)) {
    const key = text(k, 80);
    if (key && ids.has(String(b[k]))) bindings[key] = String(b[k]);
  }
  return { profiles, bindings };
}

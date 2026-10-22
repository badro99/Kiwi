import { DateTimeFormat } from './_zone-law.js';
// La météo du commerce, sans service payant.
//
// Source : MET Norway (api.met.no, Institut météorologique norvégien). Gratuit,
// usage commercial permis, deux conditions : citer la source (CC BY 4.0) et
// s'identifier par un User-Agent avec un contact. Pas de clé, pas de compte.
//
// Pas de géocodage payant non plus : la ville du commerce (fiche « business »,
// sinon merchant_config.city) est cherchée dans une table des villes marocaines
// ci-dessous. Une ville absente de la table ne donne aucune météo, jamais une
// météo approximative d'ailleurs.
//
// MET ne donne pas l'historique. Pour pouvoir dire un jour « les jours de
// pluie, vous faites −18 % », on garde donc, jour après jour, la prévision du
// jour même (la plus proche de ce qui a eu lieu) : `mergeLog`.

export const TIMEZONE = 'Africa/Casablanca';
export const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
export const USER_AGENT = 'KiwiOS/1.0 (+https://kiwi-os.com; contact@kiwi-os.com)';
export const LOG_KEEP_DAYS = 400;

// [nom affiché, latitude, longitude, alias…] · coordonnées du centre-ville,
// arrondies à deux décimales (≈ 1 km : la maille du modèle est plus large).
const CITIES = [
  ['Casablanca', 33.57, -7.59, 'casa', 'dar el beida', 'الدار البيضاء', 'كازا'],
  ['Rabat', 34.02, -6.84, 'الرباط'],
  ['Salé', 34.05, -6.80, 'sale', 'سلا'],
  ['Témara', 33.93, -6.91, 'temara', 'تمارة'],
  ['Kénitra', 34.26, -6.58, 'kenitra', 'القنيطرة'],
  ['Mohammedia', 33.69, -7.38, 'المحمدية'],
  ['Bouskoura', 33.45, -7.65, 'بوسكورة'],
  ['Dar Bouazza', 33.52, -7.82, 'دار بوعزة'],
  ['Berrechid', 33.27, -7.59, 'برشيد'],
  ['Settat', 33.00, -7.62, 'سطات'],
  ['El Jadida', 33.25, -8.51, 'الجديدة'],
  ['Marrakech', 31.63, -7.98, 'marrakesh', 'مراكش'],
  ['Benguerir', 32.24, -7.95, 'ben guerir', 'بنجرير'],
  ['Essaouira', 31.51, -9.77, 'الصويرة'],
  ['Safi', 32.30, -9.24, 'آسفي', 'اسفي'],
  ['Agadir', 30.43, -9.60, 'أكادير', 'اكادير'],
  ['Inezgane', 30.36, -9.54, 'إنزكان', 'انزكان'],
  ['Aït Melloul', 30.33, -9.50, 'ait melloul', 'أيت ملول'],
  ['Taroudant', 30.47, -8.88, 'تارودانت'],
  ['Tiznit', 29.70, -9.73, 'تيزنيت'],
  ['Guelmim', 28.99, -10.06, 'كلميم'],
  ['Laâyoune', 27.15, -13.20, 'laayoune', 'العيون'],
  ['Dakhla', 23.68, -15.96, 'الداخلة'],
  ['Fès', 34.03, -5.00, 'fes', 'fez', 'فاس'],
  ['Meknès', 33.90, -5.55, 'meknes', 'مكناس'],
  ['Ifrane', 33.53, -5.11, 'إفران', 'افران'],
  ['Azrou', 33.43, -5.22, 'أزرو', 'ازرو'],
  ['Khémisset', 33.82, -6.07, 'khemisset', 'الخميسات'],
  ['Taza', 34.21, -4.01, 'تازة'],
  ['Tanger', 35.76, -5.83, 'tangier', 'tangiers', 'طنجة'],
  ['Tétouan', 35.58, -5.37, 'tetouan', 'تطوان'],
  ['Martil', 35.62, -5.28, 'مرتيل'],
  ["M'diq", 35.69, -5.33, 'mdiq', 'المضيق'],
  ['Fnideq', 35.85, -5.36, 'الفنيدق'],
  ['Chefchaouen', 35.17, -5.27, 'chaouen', 'شفشاون'],
  ['Larache', 35.19, -6.16, 'العرائش'],
  ['Asilah', 35.47, -6.04, 'أصيلة', 'اصيلة'],
  ['Ksar El Kébir', 35.00, -5.90, 'ksar el kebir', 'القصر الكبير'],
  ['Al Hoceïma', 35.25, -3.94, 'al hoceima', 'alhucemas', 'الحسيمة'],
  ['Nador', 35.17, -2.93, 'الناظور'],
  ['Oujda', 34.68, -1.91, 'وجدة'],
  ['Saïdia', 35.09, -2.23, 'saidia', 'السعيدية'],
  ['Béni Mellal', 32.34, -6.35, 'beni mellal', 'بني ملال'],
  ['Khouribga', 32.88, -6.91, 'خريبكة'],
  ['Ouarzazate', 30.92, -6.89, 'ورزازات'],
  ['Errachidia', 31.93, -4.42, 'الرشيدية'],
  ['Midelt', 32.68, -4.74, 'ميدلت'],
  ['Zagora', 30.33, -5.84, 'زاكورة'],
];

export function normCity(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  return s.replace(/[’'`´-]/g, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

const INDEX = new Map();
CITIES.forEach(([name, lat, lon, ...aliases]) => {
  const row = { name, lat, lon };
  [name, ...aliases].forEach((alias) => INDEX.set(normCity(alias), row));
});

/* « Casablanca », « casa », « 20250 Casablanca », « Maarif, Casablanca » : la
 * ville peut être noyée dans une adresse. On essaie le tout, puis chaque
 * morceau séparé par une virgule, puis chaque suite de mots. */
export function cityCoords(value) {
  const whole = normCity(value);
  if (!whole) return null;
  if (INDEX.has(whole)) return INDEX.get(whole);
  const parts = String(value).split(/[,;/]/).map(normCity).filter(Boolean).reverse();
  for (const part of parts) if (INDEX.has(part)) return INDEX.get(part);
  const words = whole.split(' ').filter((w) => !/^\d+$/.test(w));
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = words.length - n; i >= 0; i--) {
      const hit = INDEX.get(words.slice(i, i + n).join(' '));
      if (hit) return hit;
    }
  }
  return null;
}

const DAY_FMT = new DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function localParts(ms) {
  const p = DAY_FMT.formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { day: `${g('year')}-${g('month')}-${g('day')}`, hour: +g('hour') };
}

/* Le pictogramme MET (« lightrainshowers_day ») ramené à ce qu'un commerçant
 * en fait : sec, couvert, pluie, orage, neige, brouillard. */
export function kindOf(symbol) {
  const s = String(symbol || '').replace(/_(day|night|polartwilight)$/, '');
  if (!s) return '';
  if (/thunder/.test(s)) return 'storm';
  if (/snow/.test(s)) return 'snow';
  if (/rain|sleet|drizzle/.test(s)) return 'rain';
  if (/fog/.test(s)) return 'fog';
  if (/cloudy/.test(s) && !/partly/.test(s)) return 'cloudy';
  return 'clear';
}

/* Les jours (heure de Casablanca) couverts par la prévision : minimum et
 * maximum de température, cumul de pluie, et le temps de la mi-journée.
 * La pluie : chaque échéance donne la pluie de l'heure (next_1_hours) ou des
 * six heures (next_6_hours) qui suivent. On avance sans jamais compter deux
 * fois la même heure. */
export function summarize(met, now) {
  const series = met && met.properties && Array.isArray(met.properties.timeseries) ? met.properties.timeseries : [];
  const today = localParts(now || Date.now()).day;
  const days = new Map();
  let coveredUntil = 0;
  for (const step of series) {
    const t = Date.parse(step && step.time);
    if (!Number.isFinite(t)) continue;
    const { day, hour } = localParts(t);
    if (day < today) continue;
    const data = step.data || {};
    const temp = data.instant && data.instant.details && data.instant.details.air_temperature;
    const row = days.get(day) || { day, tmin: null, tmax: null, precip: 0, noonGap: 99, symbol: '' };
    if (Number.isFinite(temp)) {
      row.tmin = row.tmin == null ? temp : Math.min(row.tmin, temp);
      row.tmax = row.tmax == null ? temp : Math.max(row.tmax, temp);
    }
    const h1 = data.next_1_hours, h6 = data.next_6_hours;
    if (t >= coveredUntil) {
      if (h1 && h1.details && Number.isFinite(h1.details.precipitation_amount)) {
        row.precip += h1.details.precipitation_amount; coveredUntil = t + 3600e3;
      } else if (h6 && h6.details && Number.isFinite(h6.details.precipitation_amount)) {
        row.precip += h6.details.precipitation_amount; coveredUntil = t + 6 * 3600e3;
      }
    }
    const symbol = (h6 && h6.summary && h6.summary.symbol_code) || (h1 && h1.summary && h1.summary.symbol_code) || '';
    const gap = Math.abs(hour - 12);
    if (symbol && gap < row.noonGap) { row.noonGap = gap; row.symbol = symbol; }
    days.set(day, row);
  }
  return Array.from(days.values()).sort((a, b) => (a.day < b.day ? -1 : 1)).slice(0, 3).map((r) => {
    const precip = Math.round(r.precip * 10) / 10;
    let kind = kindOf(r.symbol);
    /* Un jour annoncé « nuageux » qui cumule de la pluie est un jour de pluie. */
    if (precip >= 1 && (kind === 'clear' || kind === 'cloudy' || kind === 'fog')) kind = 'rain';
    return {
      day: r.day,
      tmin: r.tmin == null ? null : Math.round(r.tmin),
      tmax: r.tmax == null ? null : Math.round(r.tmax),
      precip, kind, symbol: r.symbol,
    };
  });
}

/* Le carnet des jours passés : la prévision du jour même. Lue le soir, elle
 * ne couvre plus que les heures qui restent : la pluie du matin en a disparu.
 * On ne remplace donc jamais une lecture par une plus pauvre, on les réunit :
 * la pluie la plus forte annoncée ce jour-là, la température la plus basse et
 * la plus haute. On ne garde que LOG_KEEP_DAYS jours. */
export function mergeLog(log, entry, keep) {
  const out = log && typeof log === 'object' && !Array.isArray(log) ? Object.assign({}, log) : {};
  if (entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.day)) {
    const old = out[entry.day];
    const num = (v) => (Number.isFinite(v) ? v : null);
    const pick = (a, b, f) => (a == null ? b : b == null ? a : f(a, b));
    out[entry.day] = old ? {
      tmin: pick(num(old.tmin), num(entry.tmin), Math.min),
      tmax: pick(num(old.tmax), num(entry.tmax), Math.max),
      precip: Math.max(num(old.precip) || 0, num(entry.precip) || 0),
      kind: (num(entry.precip) || 0) >= (num(old.precip) || 0) ? entry.kind : old.kind,
    } : { tmin: num(entry.tmin), tmax: num(entry.tmax), precip: num(entry.precip) || 0, kind: entry.kind };
  }
  const days = Object.keys(out).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const cut = days.length - (keep || LOG_KEEP_DAYS);
  const kept = {};
  days.slice(Math.max(0, cut)).forEach((d) => { kept[d] = out[d]; });
  return kept;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GET /order/basic?s=<slug>[&t=N] · the basic page (design 2027 §4.1)
 *
 * A guest browser below the guest minimum (Safari 14.1, Chrome and Edge 88,
 * Firefox 78, Samsung Internet 15) cannot run the 2027 guest app. Its boot
 * check (OrderPro.html, kiwiSkin2027:ordering) sends it here instead: the menu
 * as a plain list with its prices, and `ordering.basic`, "show this menu to
 * the staff to order". No script, no kit, nothing to fail.
 *
 * The menu is the public one, read through GET /api/menu itself, so a
 * suspended store, a hidden dish or an unpublished menu read exactly as they
 * do in the app. Every merchant string is escaped.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { onRequestGet as menuGet } from '../api/menu.js';

/* assets/kit/strings/ordering.*.js, `ordering.basic` and the page's own words;
   tools/order-basic-test.mjs holds the first equal to the bundle. */
export const STR = {
  en: { basic: "This browser can't place orders here. Show this menu to the staff to order.", menu: 'Menu', none: 'This menu is not published yet.', currency: 'MAD', table: 'Table' },
  fr: { basic: 'Ce navigateur ne permet pas de commander ici. Montrez ce menu au personnel pour commander.', menu: 'Carte', none: "Cette carte n'est pas encore publiée.", currency: 'MAD', table: 'Table' },
  ar: { basic: 'لا يتيح هذا المتصفح الطلب هنا. اعرض هذه القائمة على الموظفين للطلب.', menu: 'القائمة', none: 'هذه القائمة غير منشورة بعد.', currency: 'درهم', table: 'طاولة' },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The guest's first language among the three, as the app picks it. */
export function langOf(header) {
  for (const part of String(header || '').split(',')) {
    const l = part.trim().split(';')[0].toLowerCase().split('-')[0];
    if (STR[l]) return l;
  }
  return 'fr';
}

/* The app's amounts: whole dirhams bare, centimes after a comma (a point in English). */
export function amount(v, lang) {
  const c = Math.round((Number(v) || 0) * 100), a = Math.abs(c), frac = a % 100;
  return (c < 0 ? '-' : '') + Math.floor(a / 100) + (frac ? (lang === 'en' ? '.' : ',') + String(frac).padStart(2, '0') : '');
}

export function render(data, lang, table) {
  const s = STR[lang];
  const price = (v) => `<bdi dir="ltr">${esc(amount(v, lang))}</bdi> ${esc(s.currency)}`;
  const row = (name, desc, v) => `<li><div><b>${esc(name)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</div><span>${price(v)}</span></li>`;
  let body = '';
  const menu = data && data.menu;
  const shop = data && data.shop;
  if (menu && Array.isArray(menu.items)) {
    const items = menu.items.filter((it) => it && it.name && it.avail !== false);
    const cats = (Array.isArray(menu.cats) ? menu.cats : []).filter((c) => items.some((it) => it.catId === c.id));
    const loose = items.filter((it) => !cats.some((c) => c.id === it.catId));
    for (const c of cats) body += `<h2>${esc(c.name)}</h2><ul>${items.filter((it) => it.catId === c.id).map((it) => row(it.name, it.desc, it.price)).join('')}</ul>`;
    if (loose.length) body += `<ul>${loose.map((it) => row(it.name, it.desc, it.price)).join('')}</ul>`;
  } else if (shop && Array.isArray(shop.products)) {
    body = `<ul>${shop.products.map((p) => row(p.name, '', p.priceMAD)).join('')}</ul>`;
  }
  if (!body) body = `<p>${esc(s.none)}</p>`;
  const name = (data && data.name) || s.menu;
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}</title>
<style>
body{margin:0;background:#F7F5F0;color:#0A0F0D;font:16px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:24px;font-weight:600;margin:0 0 4px}
.t{color:#454B47;margin:0 0 16px}
.note{background:#E2EFE8;color:#08573E;border-radius:12px;padding:12px 14px;margin:0 0 20px;font-weight:600}
h2{font-size:15px;font-weight:600;color:#454B47;margin:24px 0 8px}
ul{list-style:none;margin:0;padding:0;border-top:1px solid #E2DDD2}
li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #E2DDD2}
li span{white-space:nowrap;font-variant-numeric:tabular-nums}
small{display:block;color:#666B65;font-size:14px}
</style>
</head>
<body>
<main>
<h1>${esc(name)}</h1>
${table ? `<p class="t">${esc(s.table)} ${esc(table)}</p>` : ''}
<p class="note">${esc(s.basic)}</p>
${body}
</main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = (url.searchParams.get('s') || url.searchParams.get('store') || '').trim().slice(0, 64);
  const table = (url.searchParams.get('t') || url.searchParams.get('table') || '').replace(/\D/g, '').slice(0, 4);
  const lang = langOf(context.request.headers.get('Accept-Language'));
  let data = null;
  if (slug && slug !== 'demo') {
    try {
      const res = await menuGet({ request: new Request(url.origin + '/api/menu?merchant=' + encodeURIComponent(slug)), env: context.env });
      data = res.ok ? await res.json() : null;
    } catch (_) { data = null; }
  }
  return new Response(render(data, lang, table), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Language': lang },
  });
}

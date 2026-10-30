/* La caisse boutique · « Livraisons » (propriétaire, 29 octobre 2026).
 *
 * Les commandes parties en livraison (contre-remboursement) et ce qu'il en
 * advient : le colis revient, en tout ou en partie, ou il ne revient pas.
 *
 *   · Une livraison compte 0 MAD le jour de la vente : l'argent n'est pas là.
 *     Un retour ne retire donc RIEN du chiffre d'affaires ; il réduit ce qui
 *     reste à recevoir et remet les articles en stock.
 *   · Sans retour après 15 jours, le serveur confirme la commande tout seul :
 *     le reste dû entre dans le chiffre d'affaires, daté du quinzième jour
 *     (functions/api/receivables.js, autoConfirm).
 *
 * L'écran demande le code d'un responsable à l'entrée, une fois : tant qu'on
 * reste sur la page, plusieurs retours s'enregistrent sans le redemander. En
 * quittant la page, elle se reverrouille.
 *
 * La valeur rendue est calculée par le serveur depuis le panier figé de la
 * vente, jamais par la tablette. La tablette ne remet en stock qu'un retour
 * que le serveur vient d'accepter pour la première fois (already === false) :
 * rejouer un retour ne recrédite jamais le stock deux fois. */
import { ozonParcels, ozonLine, ozonNote, ozonOpenSend, ozonMakeNote, ozonLabel as translate, ozonBoard } from './ozon.js?v=3';
/* translate : les phrases Ozon (ozon.js), en français, anglais ou arabe. */
const DAY = 86400000;
const OZON_EVERY = 15 * 60 * 1000;   // la caisse reste ouverte : le suivi Ozon se relit tout seul
/* Clés techniques (onglets, niveaux de toast), jamais du texte lu : en table, pour la garde i18n. */
const TAB = { open: 'open', returned: 'returned', collected: 'collected' };
const LEVEL = { warn: 'warn', success: 'success', nothingDue: 'nothing-due' };
/* Les filtres de la recherche (propriétaire, 30 octobre) : la fiche du
   destinataire saisie à l'encaissement (assets/pos-boutique/delivery-card.js). */
const BY = { all: 'all', name: 'name', city: 'city', phone: 'phone' };
/* Les phrases de cet écran, en anglais et en arabe. Elles vivent ici et non
   dans caisse-lang.js (fichier gelé en taille) ; le reste passe par le
   dictionnaire de la caisse. */
const PHRASES = {
  'Livraisons': ['Deliveries', 'التوصيلات'],
  'Livraisons · retours': ['Deliveries · returns', 'التوصيلات · المرتجعات'],
  'Aucune commande retournée.': ['No returned orders.', 'لا توجد طلبات مرتجعة.'],
  'Aucune livraison confirmée récemment.': ['No recently confirmed deliveries.', 'لا توجد توصيلات مؤكدة مؤخراً.'],
  'Aucune livraison en attente.': ['No pending deliveries.', 'لا توجد توصيلات قيد الانتظار.'],
  'Boutique non identifiée sur cette caisse.': ['This till is not linked to a shop.', 'هذا الصندوق غير مرتبط بمتجر.'],
  'Cette commande n’a plus rien en attente.': ['Nothing is pending on this order any more.', 'لم يعد في هذا الطلب شيء قيد الانتظار.'],
  'Chargement…': ['Loading…', 'جارٍ التحميل…'],
  'Code responsable indisponible sur cette caisse.': ['Manager code is not available on this till.', 'رمز المسؤول غير متاح في هذا الصندوق.'],
  'Code responsable requis': ['Manager code required', 'رمز المسؤول مطلوب'],
  'Commandes en cours': ['Orders out', 'الطلبات الجارية'],
  'Confirmer le retour complet': ['Confirm full return', 'تأكيد الإرجاع الكامل'],
  'Confirmée automatiquement': ['Confirmed automatically', 'مؤكد تلقائياً'],
  'Confirmées': ['Confirmed', 'المؤكدة'],
  'Enregistrer un retour': ['Record a return', 'تسجيل إرجاع'],
  'Impossible de charger les livraisons. Vérifiez la connexion.': ['Could not load deliveries. Check the connection.', 'تعذر تحميل التوصيلات. تحقق من الاتصال.'],
  'Le détail des articles n’est pas disponible pour cette commande. Seul le retour complet est possible.': ['Item details are not available for this order. Only a full return is possible.', 'تفاصيل المواد غير متاحة لهذا الطلب. الإرجاع الكامل فقط ممكن.'],
  'Les commandes en livraison d’une vraie boutique apparaissent ici.': ['Delivery orders from a real shop appear here.', 'تظهر هنا طلبات التوصيل لمتجر حقيقي.'],
  'Les retours de livraison sont enregistrés par un responsable.': ['Delivery returns are recorded by a manager.', 'يسجل المسؤول مرتجعات التوصيل.'],
  'Responsable': ['Manager', 'المسؤول'],
  'Retour enregistré': ['Return recorded', 'تم تسجيل الإرجاع'],
  'Retour non enregistré. Vérifiez la connexion et réessayez.': ['Return not recorded. Check the connection and try again.', 'لم يتم تسجيل الإرجاع. تحقق من الاتصال وأعد المحاولة.'],
  'Retournée': ['Returned', 'مرتجع'],
  'Retournées': ['Returned', 'المرتجعة'],
  'Reçue': ['Received', 'مستلمة'],
  'Saisir le code': ['Enter the code', 'أدخل الرمز'],
  'Toute la commande': ['Whole order', 'الطلب كاملاً'],
  'Une livraison ne compte dans le chiffre d’affaires qu’une fois confirmée. Sans retour après 15 jours, elle est confirmée automatiquement. Un retour remet les articles en stock et ne change pas le chiffre.': ['A delivery counts in revenue only once confirmed. With no return after 15 days, it is confirmed automatically. A return puts the items back in stock and does not change revenue.', 'لا يُحتسب التوصيل في رقم المعاملات إلا بعد تأكيده. إذا لم يُرجع بعد 15 يوماً، يُؤكد تلقائياً. الإرجاع يعيد المواد إلى المخزون ولا يغير رقم المعاملات.'],
  'Valider le retour': ['Confirm return', 'تأكيد الإرجاع'],
  'Tout': ['All', 'الكل'],
  'Nom': ['Name', 'الاسم'],
  'Ville': ['City', 'المدينة'],
  'Téléphone': ['Phone', 'الهاتف'],
  'Nom, ville, téléphone ou ticket': ['Name, city, phone or ticket', 'الاسم أو المدينة أو الهاتف أو التذكرة'],
  'Rechercher un nom': ['Search a name', 'ابحث عن اسم'],
  'Rechercher une ville': ['Search a city', 'ابحث عن مدينة'],
  'Rechercher un téléphone': ['Search a phone number', 'ابحث عن رقم هاتف'],
  'Rechercher par': ['Search by', 'البحث حسب'],
  'Aucune commande ne correspond à cette recherche.': ['No order matches this search.', 'لا يوجد طلب يطابق هذا البحث.'],
  'Effacer': ['Clear', 'مسح'],
  'Sans fiche client': ['No customer details', 'بدون بيانات الزبون'],
  'Vendue le': ['Sold on', 'بيع في'],
  'confirmée dans {n} j': ['confirmed in {n} d', 'يُؤكد بعد {n} ي'],
  'confirmée le': ['confirmed on', 'أُكد في'],
  'déjà revenu': ['already returned', 'أُرجع سابقاً'],
  'jour {d} sur {t}': ['day {d} of {t}', 'اليوم {d} من {t}'],
  'l’unité': ['each', 'للوحدة'],
  'revenu en partie': ['partly returned', 'أُرجع جزئياً'],
  'revenue le': ['returned on', 'أُرجع في'],
  '{n} article(s) remis en stock.': ['{n} item(s) back in stock.', 'أُعيدت {n} مادة إلى المخزون.'],
  '{n} dehors': ['{n} out', '{n} في الخارج'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return C && typeof C.tr === 'function' ? C.tr(s) : s;
};

const st = { unlocked: null, data: null, loading: false, error: '', tab: 'open', openRow: '', pick: {}, busy: false, asked: false, confirmAll: '', q: '', by: BY.all, ozon: null, ozonTimer: 0 };
let watchedD = null;
let watched = null;

function madC(cents, d) { return d.fmtMAD((Number(cents) || 0) / 100); }
function when(ts) {
  try { return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); } catch (_) { return ''; }
}
function retId() {
  try { if (crypto && crypto.randomUUID) return 'ret-' + crypto.randomUUID(); } catch (_) {}
  return 'ret-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/* La recherche ignore la casse et les accents ; un téléphone se compare en
   chiffres, +212 6… comme 06…. */
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const phoneDigits = (v) => { const n = String(v || '').replace(/\D/g, ''); return n.startsWith('212') ? '0' + n.slice(3) : n.startsWith('00212') ? '0' + n.slice(5) : n; };
function matches(x) {
  const q = fold(st.q);
  if (!q) return true;
  const c = x.customer || {};
  const name = () => fold(c.name).includes(q);
  const city = () => fold(c.city).includes(q);
  const phone = () => { const n = phoneDigits(q); return n.length >= 2 && phoneDigits(c.phone).includes(n.replace(/^0/, '')); };
  if (st.by === BY.name) return name();
  if (st.by === BY.city) return city();
  if (st.by === BY.phone) return phone();
  return name() || city() || phone() || fold(x.ref || x.saleId).includes(q);
}
/* Le destinataire en titre, puis ticket, ville et téléphone sur une ligne.
   Une livraison d'avant la fiche garde son numéro de ticket en titre. */
function title(x, esc) {
  const ticket = tr('Ticket') + ' ' + (x.ref || x.saleId);
  const c = x.customer;
  return c ? '<b>' + esc(c.name) + '</b><small class="bqd-who">' + [ticket, c.city, c.phone].filter(Boolean).map((v) => '<span>' + esc(v) + '</span>').join(' · ') + '</small>'
    : '<b>' + esc(ticket) + '</b><small>' + esc(tr('Sans fiche client')) + '</small>';
}

/* En quittant la page, le verrou revient. La vue est un <section> qui perd
   la classe is-on : on l'observe une fois, sans toucher à pos-boutique.js. */
function watch(panel) {
  if (watched === panel || typeof MutationObserver !== 'function') return;
  watched = panel;
  new MutationObserver(() => {
    if (!panel.classList.contains('is-on')) { st.unlocked = null; st.asked = false; st.openRow = ''; st.pick = {}; }
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  if (!st.ozonTimer && typeof setInterval === 'function') {
    st.ozonTimer = setInterval(() => { if (panel.classList.contains('is-on') && st.unlocked && watchedD) loadOzon(panel, watchedD, false); }, OZON_EVERY);
  }
}

function css() {
  if (document.getElementById('bqd-css')) return;
  const s = document.createElement('style');
  s.id = 'bqd-css';
  s.textContent = [
    '#pos-boutique .bqd{padding:22px 24px 24px;display:flex;flex-direction:column;gap:14px;min-width:0;overflow:auto;max-height:100%;}',
    '#pos-boutique .bqd-head h3{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em;}',
    '#pos-boutique .bqd-head span{display:block;margin-top:4px;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqd-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}',
    '#pos-boutique .bqd-kpi{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);min-width:0;}',
    '#pos-boutique .bqd-kpi span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqd-kpi b{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bqd-tabs{display:flex;gap:6px;flex-wrap:wrap;}',
    '#pos-boutique .bqd-tab{min-height:40px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:999px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;cursor:pointer;}',
    '#pos-boutique .bqd-tab.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);}',
    '#pos-boutique .bqd-list{display:flex;flex-direction:column;gap:8px;}',
    '#pos-boutique .bqd-row{border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);padding:12px 14px;display:flex;flex-direction:column;gap:10px;}',
    '#pos-boutique .bqd-top{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;}',
    '#pos-boutique .bqd-top b{font-size:15px;font-weight:600;}',
    '#pos-boutique .bqd-top small{display:block;margin-top:2px;font-size:12.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqd-amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:end;}',
    '#pos-boutique .bqd-amt small{font-weight:400;}',
    '#pos-boutique .bqd-bar{height:4px;border-radius:4px;background:var(--paper-soft,#F1EEE7);overflow:hidden;}',
    '#pos-boutique .bqd-bar i{display:block;height:100%;background:var(--atlas,#0B6E4F);}',
    '#pos-boutique .bqd-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;font-weight:600;color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}',
    '#pos-boutique .bqd-btn.go{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);}',
    '#pos-boutique .bqd-btn[disabled]{opacity:.45;cursor:default;}',
    '#pos-boutique .bqd-btn i,#pos-boutique .bqd-btn svg{width:18px;height:18px;}',
    '#pos-boutique .bqd-ret{border-top:1px solid var(--line,#E2DDD2);padding-top:10px;display:flex;flex-direction:column;gap:8px;}',
    '#pos-boutique .bqd-line{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;font-size:14px;}',
    '#pos-boutique .bqd-line small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    /* Largeur fixe : le montant qui apparaît ne déplace pas les boutons sous le doigt. */
    '#pos-boutique .bqd-line .bqd-amt{min-width:120px;}',
    '#pos-boutique .bqd-step{display:inline-flex;align-items:center;gap:6px;}',
    '#pos-boutique .bqd-step button{width:40px;height:40px;border-radius:10px;border:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);font:inherit;font-size:18px;color:inherit;cursor:pointer;}',
    '#pos-boutique .bqd-step b{min-width:22px;text-align:center;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bqd-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;}',
    '#pos-boutique .bqd-tag{display:inline-block;justify-self:start;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--paper-soft,#F1EEE7);color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqd-tag.ok{background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);}',
    '#pos-boutique .bqd-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:48px 16px;text-align:center;color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqd-empty i,#pos-boutique .bqd-empty svg{width:30px;height:30px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqd-note{font-size:12.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqd-search{display:flex;flex-direction:column;gap:8px;}',
    '#pos-boutique .bqd-q{position:relative;}',
    '#pos-boutique .bqd-q input{width:100%;box-sizing:border-box;min-height:46px;padding:10px 44px 10px 40px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:16px;color:inherit;}',
    '#pos-boutique .bqd-q input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none;}',
    '#pos-boutique .bqd-q input:focus{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px;border-color:var(--atlas,#0B6E4F);}',
    '#pos-boutique .bqd-q > i,#pos-boutique .bqd-q > svg{position:absolute;inset-inline-start:12px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--ink-3,#6F6C65);pointer-events:none;}',
    '#pos-boutique .bqd-q button{position:absolute;inset-inline-end:4px;top:50%;transform:translateY(-50%);width:38px;height:38px;border:0;border-radius:8px;background:none;color:var(--ink-3,#6F6C65);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}',
    '#pos-boutique .bqd-q button[hidden]{display:none;}',
    '#pos-boutique .bqd-q button i,#pos-boutique .bqd-q button svg{width:18px;height:18px;}',
    '#pos-boutique .bqd-by{display:flex;gap:6px;flex-wrap:wrap;}',
    '#pos-boutique .bqd-by button{min-height:36px;padding:0 12px;border:1px solid var(--line,#E2DDD2);border-radius:999px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:13.5px;color:inherit;cursor:pointer;}',
    '#pos-boutique .bqd-by button.on{background:var(--ink,#0A0F0D);border-color:var(--ink,#0A0F0D);color:var(--paper,#F7F5F0);}',
    '#pos-boutique .bqd-who{display:block;margin-top:2px;font-size:12.5px;color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqd-who span{white-space:nowrap;}',
    '#pos-boutique .bqd-addr{font-size:13px;color:var(--ink-2,#3D4441);line-height:1.45;}',
    '#pos-boutique .bqd-addr span{display:block;color:var(--ink-3,#6F6C65);}',
    '@media (max-width:760px){#pos-boutique .bqd-kpis{grid-template-columns:1fr;}#pos-boutique .bqd-top{grid-template-columns:1fr auto;}#pos-boutique .bqd-top .bqd-btn{grid-column:1 / -1;}}',
  ].join('\n');
  document.head.appendChild(s);
}

function load(panel, d) {
  const slug = d.slug && d.slug();
  if (!slug || typeof fetch !== 'function') { st.error = tr('Boutique non identifiée sur cette caisse.'); paint(panel, d); return; }
  st.loading = true; st.error = '';
  paint(panel, d);
  fetch('/api/receivables?lines=1&merchant=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http-' + r.status))))
    .then((data) => { st.data = data; })
    .catch(() => { st.error = tr('Impossible de charger les livraisons. Vérifiez la connexion.'); })
    .finally(() => { st.loading = false; if (panel.isConnected) paint(panel, d); loadOzon(panel, d, false); });
}

/* Ozon Express (ozon.js) : le suivi de chaque colis, relu au chargement, puis
   toutes les quinze minutes tant que la page reste ouverte. Un « Payé » relu
   ici est déjà dans le chiffre (le serveur l'a écrit) : on recharge la liste.
   Le tableau Ozon et la liste se repeignent seuls : la recherche garde son
   curseur. */
function loadOzon(panel, d, force) {
  const slug = d.slug && d.slug();
  if (!slug || d.demo) return Promise.resolve();
  return ozonParcels(slug, force ? { force: true } : { refresh: true }).then((o) => {
    const paidNow = o.refreshed && o.refreshed.paid;
    st.ozon = o;
    if (force) d.toast(translate('Suivi mis à jour'), 3000, LEVEL.success, paidNow ? translate('{n} vente(s) payée(s) par Ozon, ajoutée(s) au chiffre.').replace('{n}', String(paidNow)) : '');
    if (paidNow) { load(panel, d); return; }
    if (!panel.isConnected) return;
    const box = panel.querySelector('[data-bqd-oz]');
    if (!box) { paint(panel, d); return; }
    box.innerHTML = ozonHead(d.esc);
    paintResults(panel, d);
  }).catch(() => { /* Ozon absent ou hors ligne : la page reste celle d'avant */ });
}
function ozonOf(saleId) { return st.ozon && st.ozon.bySale ? st.ozon.bySale.get(saleId) : null; }
function ozonHead(esc) {
  if (!st.ozon || !st.ozon.connected) return '';
  return '<div class="bqd-acts"><button type="button" class="bqd-btn" data-bqd-ozon-refresh><i data-icon="refresh"></i>' + esc(translate('Actualiser le suivi')) + '</button>'
    + '<button type="button" class="bqd-btn" data-bqd-ozon-note><i data-icon="receipt_long"></i>' + esc(translate('Bon de livraison Ozon')) + '</button></div>'
    + ozonBoard(st.ozon.parcels);
}
/* Le formulaire Ozon reprend la fiche destinataire prise à l'encaissement :
   nom, téléphone, adresse, ville et commentaire sont déjà là. */
function sendOzon(panel, d, x) {
  const c = x.customer || {};
  ozonOpenSend({ slug: d.slug(), saleId: x.saleId, title: tr('Ticket') + ' ' + (x.ref || x.saleId), dueCents: x.dueCents,
    receiver: c.name || '', phone: c.phone || '', address: c.address || '', cityHint: c.city || '', note: c.note || '',
    toast: d.toast, onDone: () => loadOzon(panel, d, false) });
}

function rowOpen(x, d, esc) {
  const days = Math.max(0, Math.floor((Date.now() - x.ts) / DAY));
  const total = (st.data && st.data.confirmDays) || 15;
  const left = Math.max(1, total - days);
  const isOpen = st.openRow === x.saleId;
  const parcel = ozonOf(x.saleId);
  const sub = [tr('Vendue le') + ' ' + when(x.ts), tr('jour {d} sur {t}').replace('{d}', String(Math.min(days, total))).replace('{t}', String(total))];
  if (x.returnedCents > 0) sub.push(tr('déjà revenu') + ' ' + madC(x.returnedCents, d));
  let ret = '';
  if (isOpen && x.customer) {
    ret += '<div class="bqd-addr">' + esc(x.customer.address) + (x.customer.note ? '<span>' + esc(x.customer.note) + '</span>' : '') + '</div>';
  }
  if (isOpen) {
    const lines = (x.lines || []).filter((l) => l.qty - l.returnedQty > 0);
    const pickedCents = lines.reduce((n, l) => n + (st.pick[l.i] ? Math.round(l.totalCents * st.pick[l.i] / (l.qty || 1)) : 0), 0);
    const any = Object.values(st.pick).some((q) => q > 0);
    ret += '<div class="bqd-ret">'
      + (lines.length ? lines.map((l) => {
        const out = l.qty - l.returnedQty;
        const q = st.pick[l.i] || 0;
        return '<div class="bqd-line"><div>' + esc(l.name || tr('Article')) + '<small>' + esc(tr('{n} dehors').replace('{n}', String(out))) + ' · ' + esc(madC(Math.round(l.totalCents / (l.qty || 1)), d)) + ' ' + esc(tr('l’unité')) + '</small></div>'
          + '<div class="bqd-step"><button type="button" data-bqd-q="' + l.i + '" data-d="-1" aria-label="' + esc(tr('Moins')) + '">−</button><b>' + q + '</b><button type="button" data-bqd-q="' + l.i + '" data-d="1" data-max="' + out + '" aria-label="' + esc(tr('Plus')) + '">+</button></div>'
          + '<div class="bqd-amt">' + (q ? esc(madC(Math.round(l.totalCents * q / (l.qty || 1)), d)) : '') + '</div></div>';
      }).join('') : '<div class="bqd-note">' + esc(tr('Le détail des articles n’est pas disponible pour cette commande. Seul le retour complet est possible.')) + '</div>')
      + '<div class="bqd-acts">'
      + '<button type="button" class="bqd-btn" data-bqd-cancel>' + esc(tr('Annuler')) + '</button>'
      + '<button type="button" class="bqd-btn' + (st.confirmAll === x.saleId ? ' go' : '') + '" data-bqd-all="' + esc(x.saleId) + '"' + (st.busy ? ' disabled' : '') + '>'
      + esc(st.confirmAll === x.saleId ? tr('Confirmer le retour complet') + ' · ' + madC(x.dueCents, d) : tr('Toute la commande')) + '</button>'
      + (lines.length ? '<button type="button" class="bqd-btn go" data-bqd-send="' + esc(x.saleId) + '"' + (any && !st.busy ? '' : ' disabled') + '>' + esc(tr('Valider le retour')) + (any ? ' · ' + esc(madC(pickedCents, d)) : '') + '</button>' : '')
      + '</div></div>';
  }
  return '<div class="bqd-row" data-bqd-row="' + esc(x.saleId) + '">'
    + '<div class="bqd-top"><div>' + title(x, esc) + '<small>' + esc(sub.join(' · ')) + '</small></div>'
    + '<div class="bqd-amt">' + esc(madC(x.dueCents, d)) + '<small><br>' + esc(parcel ? ozonNote() : tr('confirmée dans {n} j').replace('{n}', String(left))) + '</small></div>'
    + (isOpen ? '' : '<button type="button" class="bqd-btn" data-bqd-open="' + esc(x.saleId) + '"><i data-icon="undo"></i>' + esc(tr('Enregistrer un retour')) + '</button>')
    + '</div>'
    + (parcel ? ozonLine(parcel) : '<div class="bqd-bar"><i style="width:' + Math.min(100, Math.round(days / total * 100)) + '%"></i></div>')
    + (!parcel && st.ozon && st.ozon.connected && !isOpen ? '<div class="bqd-acts"><button type="button" class="bqd-btn" data-bqd-ozon="' + esc(x.saleId) + '"><i data-icon="local_shipping"></i>' + esc(translate('Envoyer avec Ozon')) + '</button></div>' : '')
    + ret + '</div>';
}

function rowDone(x, d, esc, kind) {
  const tag = kind === 'returned'
    ? '<span class="bqd-tag">' + esc(tr('Retournée')) + '</span>'
    : '<span class="bqd-tag ok">' + esc(x.collected && x.collected.auto ? tr('Confirmée automatiquement') : tr('Reçue')) + '</span>';
  const at = kind === 'returned' ? (x.returned && x.returned.ts) : (x.collected && x.collected.ts);
  const amt = kind === 'returned' ? x.returnedCents : (x.collected && x.collected.amountCents);
  const sub = [tr('Vendue le') + ' ' + when(x.ts), (kind === 'returned' ? tr('revenue le') : tr('confirmée le')) + ' ' + when(at)];
  if (kind !== 'returned' && x.returnedCents > 0) sub.push(tr('revenu en partie') + ' ' + madC(x.returnedCents, d));
  return '<div class="bqd-row"><div class="bqd-top"><div>' + title(x, esc) + '<small>' + esc(sub.join(' · ')) + '</small></div>'
    + '<div class="bqd-amt">' + esc(madC(amt, d)) + '</div>' + tag + '</div>' + ozonLine(ozonOf(x.saleId)) + '</div>';
}

function paint(panel, d) {
  const esc = d.esc;
  if (d.demo) {
    panel.innerHTML = '<div class="bqd"><div class="bqd-empty"><i data-icon="local_shipping"></i><b>' + esc(tr('Livraisons')) + '</b><span>'
      + esc(tr('Les commandes en livraison d’une vraie boutique apparaissent ici.')) + '</span></div></div>';
    d.icons(); return;
  }
  if (!st.unlocked) {
    panel.innerHTML = '<div class="bqd"><div class="bqd-empty"><i data-icon="lock"></i><b>' + esc(tr('Code responsable requis')) + '</b><span>'
      + esc(tr('Les retours de livraison sont enregistrés par un responsable.')) + '</span>'
      + '<button type="button" class="bqd-btn go" data-bqd-unlock>' + esc(tr('Saisir le code')) + '</button></div></div>';
    d.icons(); return;
  }
  const data = st.data || { open: [], collected: [], returned: [] };
  const open = (data.open || []);
  const pending = open.reduce((n, x) => n + (x.dueCents || 0), 0);
  const kpi = (l, v) => '<div class="bqd-kpi"><span>' + esc(l) + '</span><b>' + v + '</b></div>';
  const by = (id, l) => '<button type="button" data-lens-item data-bqd-by="' + id + '" aria-pressed="' + (st.by === id) + '"' + (st.by === id ? ' class="on"' : '') + '>' + esc(l) + '</button>';
  panel.innerHTML = '<div class="bqd">'
    + '<div class="bqd-head"><h3>' + esc(tr('Livraisons')) + '</h3><span>' + esc(tr('Responsable') + ' : ' + (st.unlocked.name || '')) + '</span></div>'
    + '<div data-bqd-oz>' + ozonHead(esc) + '</div>'
    + '<div class="bqd-kpis">' + kpi(tr('En attente'), esc(madC(pending, d))) + kpi(tr('Commandes en cours'), String(open.length)) + kpi(tr('Retournées'), String((data.returned || []).length)) + '</div>'
    + searchBar(esc, by)
    + '<div data-bqd-results>' + results(d, esc) + '</div>'
    + '<div class="bqd-note">' + esc(tr('Une livraison ne compte dans le chiffre d’affaires qu’une fois confirmée. Sans retour après 15 jours, elle est confirmée automatiquement. Un retour remet les articles en stock et ne change pas le chiffre.')) + '</div>'
    + '</div>';
  d.icons();
}

/* La recherche et ses filtres. Le champ n'est jamais repeint pendant la
   frappe : seule la liste dessous l'est (paintResults). */
function searchBar(esc, by) {
  return '<div class="bqd-search" role="search">'
    + '<div class="bqd-q"><i data-icon="search"></i><input type="search" data-bqd-q-in enterkeyhint="search" autocomplete="off" aria-label="' + esc(placeholder()) + '" placeholder="' + esc(placeholder()) + '" value="' + esc(st.q) + '">'
    + '<button type="button" data-bqd-clear aria-label="' + esc(tr('Effacer')) + '"' + (st.q ? '' : ' hidden') + '><i data-icon="close"></i></button></div>'
    + '<div class="bqd-by" data-lens-demo role="group" aria-label="' + esc(tr('Rechercher par')) + '">' + by(BY.all, tr('Tout')) + by(BY.name, tr('Nom')) + by(BY.city, tr('Ville')) + by(BY.phone, tr('Téléphone')) + '</div>'
    + '</div>';
}

function placeholder() {
  return st.by === BY.name ? tr('Rechercher un nom') : st.by === BY.city ? tr('Rechercher une ville')
    : st.by === BY.phone ? tr('Rechercher un téléphone') : tr('Nom, ville, téléphone ou ticket');
}

/* Les onglets et la liste, filtrés par la recherche. Repeints seuls pendant
   la frappe : le champ garde le curseur. */
function results(d, esc) {
  const data = st.data || { open: [], collected: [], returned: [] };
  const lists = {
    open: (data.open || []).slice().sort((a, b) => a.ts - b.ts).filter(matches),
    returned: (data.returned || []).filter(matches),
    collected: (data.collected || []).filter(matches),
  };
  const tab = (id, l) => '<button type="button" class="bqd-tab' + (st.tab === id ? ' on' : '') + '" data-bqd-tab="' + id + '">' + esc(l) + ' · ' + lists[id].length + '</button>';
  const rows = lists[st.tab] || [];
  let body;
  if (st.error) body = '<div class="bqd-empty"><i data-icon="info"></i><span>' + esc(st.error) + '</span><button type="button" class="bqd-btn" data-bqd-reload>' + esc(tr('Réessayer')) + '</button></div>';
  else if (!st.data && st.loading) body = '<div class="bqd-empty"><span>' + esc(tr('Chargement…')) + '</span></div>';
  else if (!rows.length && st.q.trim()) body = '<div class="bqd-empty"><i data-icon="search"></i><span>' + esc(tr('Aucune commande ne correspond à cette recherche.')) + '</span></div>';
  else if (!rows.length) body = '<div class="bqd-empty"><i data-icon="local_shipping"></i><span>' + esc(st.tab === 'open' ? tr('Aucune livraison en attente.') : st.tab === 'returned' ? tr('Aucune commande retournée.') : tr('Aucune livraison confirmée récemment.')) + '</span></div>';
  else body = '<div class="bqd-list">' + rows.map((x) => (st.tab === 'open' ? rowOpen(x, d, esc) : rowDone(x, d, esc, st.tab))).join('') + '</div>';
  return '<div class="bqd-tabs">' + tab(TAB.open, tr('En cours')) + tab(TAB.returned, tr('Retournées')) + tab(TAB.collected, tr('Confirmées')) + '</div>' + body;
}

function paintResults(panel, d) {
  const box = panel.querySelector('[data-bqd-results]');
  if (!box) { paint(panel, d); return; }
  box.innerHTML = results(d, d.esc);
  d.icons();
}

function unlock(panel, d) {
  if (typeof window.requireManager !== 'function') { d.toast(tr('Code responsable indisponible sur cette caisse.'), 5000, LEVEL.warn); return; }
  try { if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'refund', key: 'act.refund', args: { amount: '' } }); } catch (_) {}
  window.requireManager(tr('Livraisons · retours'), (mgr) => {
    let who = mgr;
    if (!who || !who.name) { try { who = window.KiwiCaissePairing && window.KiwiCaissePairing.lastManager(); } catch (_) { who = null; } }
    st.unlocked = { id: String((who && who.id) || ''), name: String((who && who.name) || tr('Responsable')) };
    st.tab = 'open';
    load(panel, d);
  }, null, { needsServer: true, onCancel: () => paint(panel, d) });
}

function send(panel, d, saleId, all) {
  const x = ((st.data && st.data.open) || []).find((r) => r.saleId === saleId);
  if (!x || st.busy) return;
  const lines = all ? null : Object.entries(st.pick).filter(([, q]) => q > 0).map(([i, q]) => ({ i: Number(i), q }));
  if (!all && !lines.length) return;
  st.busy = true; paintResults(panel, d);
  const body = { merchant: d.slug(), saleId, action: 'return', id: retId(), returnedBy: st.unlocked };
  if (all) body.all = true; else body.lines = lines;
  fetch('/api/receivables', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json().then((res) => ({ ok: r.ok, res })))
    .then(({ ok, res }) => {
      if (!ok) throw new Error((res && res.error) || 'failed');
      /* Le stock ne revient qu'une fois : sur un retour que le serveur vient
         d'accepter. Les lignes viennent de sa réponse, pas de la sélection. */
      let pieces = 0;
      if (!res.already) {
        (res.lines || []).forEach((l) => {
          const line = (x.lines || []).find((y) => y.i === l.i);
          const parts = String(line && line.variant || '').split(':');
          if (parts.length < 3 || !parts[0]) return;
          d.persistStock(parts[0], parts[1], parts.slice(2).join(':'), l.q, x.ref || x.saleId, 'retour');
          pieces += l.q;
        });
      }
      st.openRow = ''; st.pick = {};
      d.toast(tr('Retour enregistré') + ' · ' + madC(res.returnedCents, d), 4000, LEVEL.success,
        pieces ? tr('{n} article(s) remis en stock.').replace('{n}', String(pieces)) : '');
      load(panel, d);
    })
    .catch((e) => {
      const code = e && e.message;
      d.toast(code === LEVEL.nothingDue ? tr('Cette commande n’a plus rien en attente.') : tr('Retour non enregistré. Vérifiez la connexion et réessayez.'), 6000, LEVEL.warn);
    })
    .finally(() => { st.busy = false; if (panel.isConnected) paintResults(panel, d); });
}

/* d : { esc, icons, toast, fmtMAD, persistStock, slug, demo } : les outils de
   pos-boutique.js, rien de copié. */
export function bqLivraisons(panel, d) {
  if (!panel) return;
  css();
  watch(panel);
  watchedD = d;
  if (!panel.dataset.bqdWired) {
    panel.dataset.bqdWired = '1';
    panel.addEventListener('click', (e) => {
      const t = (sel) => e.target.closest(sel);
      let b;
      if (t('[data-bqd-unlock]')) { unlock(panel, d); return; }
      if (t('[data-bqd-reload]')) { load(panel, d); return; }
      if (t('[data-bqd-ozon-refresh]')) { loadOzon(panel, d, true); return; }
      if (t('[data-bqd-ozon-note]')) { ozonMakeNote(d.slug(), d.toast).then(() => loadOzon(panel, d, false)); return; }
      if ((b = t('[data-bqd-ozon]'))) {
        const x = ((st.data && st.data.open) || []).find((r) => r.saleId === b.dataset.bqdOzon);
        if (x) sendOzon(panel, d, x);
        return;
      }
      if ((b = t('[data-bqd-by]'))) {
        st.by = b.dataset.bqdBy; st.openRow = ''; st.pick = {};
        panel.querySelectorAll('[data-bqd-by]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        const inp = panel.querySelector('[data-bqd-q-in]');
        if (inp) { inp.placeholder = placeholder(); inp.setAttribute('aria-label', placeholder()); inp.focus(); }
        paintResults(panel, d); return;
      }
      if (t('[data-bqd-clear]')) {
        st.q = ''; st.openRow = ''; st.pick = {};
        const inp = panel.querySelector('[data-bqd-q-in]');
        if (inp) { inp.value = ''; inp.focus(); }
        const x = panel.querySelector('[data-bqd-clear]'); if (x) x.hidden = true;
        paintResults(panel, d); return;
      }
      if ((b = t('[data-bqd-tab]'))) { st.tab = b.dataset.bqdTab; st.openRow = ''; st.pick = {}; paintResults(panel, d); return; }
      if ((b = t('[data-bqd-open]'))) { st.openRow = b.dataset.bqdOpen; st.pick = {}; st.confirmAll = ''; paintResults(panel, d); return; }
      if (t('[data-bqd-cancel]')) { st.openRow = ''; st.pick = {}; st.confirmAll = ''; paintResults(panel, d); return; }
      if ((b = t('[data-bqd-q]'))) {
        const i = b.dataset.bqdQ, dir = Number(b.dataset.d), max = Number(b.dataset.max || Infinity);
        const next = Math.max(0, (st.pick[i] || 0) + dir);
        st.pick[i] = dir > 0 ? Math.min(next, max) : next;
        paintResults(panel, d); return;
      }
      /* Toute la commande : un second geste confirme, un doigt qui glisse ne
         renvoie pas un colis entier. */
      if ((b = t('[data-bqd-all]'))) {
        if (st.confirmAll !== b.dataset.bqdAll) { st.confirmAll = b.dataset.bqdAll; paintResults(panel, d); return; }
        st.confirmAll = ''; send(panel, d, b.dataset.bqdAll, true); return;
      }
      if ((b = t('[data-bqd-send]'))) { send(panel, d, b.dataset.bqdSend, false); }
    });
    panel.addEventListener('input', (e) => {
      if (!e.target || !e.target.matches('[data-bqd-q-in]')) return;
      st.q = e.target.value; st.openRow = ''; st.pick = {}; st.confirmAll = '';
      const x = panel.querySelector('[data-bqd-clear]'); if (x) x.hidden = !st.q;
      paintResults(panel, d);
    });
  }
  paint(panel, d);
  if (d.demo) return;
  if (!st.unlocked && !st.asked) { st.asked = true; unlock(panel, d); return; }
  if (st.unlocked) load(panel, d);
}

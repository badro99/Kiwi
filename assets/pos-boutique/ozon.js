/* La caisse boutique · Ozon Express (propriétaire, 30 octobre 2026).
 *
 * Une vente partie en livraison peut partir comme colis Ozon Express : le
 * formulaire prend le destinataire, la ville (liste et tarifs d'Ozon) et
 * l'adresse ; le prix du colis est ce qui reste dû sur la vente, décidé par le
 * serveur (functions/api/ozon/parcels.js), jamais saisi ici. Ensuite :
 *   · le suivi Ozon s'affiche sur chaque commande de « Livraisons » ;
 *   · « Payé » chez Ozon fait entrer la vente dans le chiffre d'affaires
 *     (côté serveur, une seule fois) ;
 *   · « Retourné » ou « Refusé » signale la commande : un responsable vérifie
 *     le colis et enregistre le retour, comme pour toute livraison ;
 *   · « Bon de livraison » regroupe les colis du jour et ouvre les étiquettes.
 * La clé API Ozon ne passe jamais par cette caisse : elle se règle au tableau de
 * bord et reste chiffrée sur le serveur. Sans compte Ozon relié, rien de ce
 * fichier ne s'affiche. */
const PHRASES = {
  'Envoyer avec Ozon Express': ['Send with Ozon Express', 'إرسال عبر أوزون إكسبريس'],
  'Envoyer avec Ozon': ['Send with Ozon', 'إرسال عبر أوزون'],
  'Colis Ozon Express': ['Ozon Express parcel', 'طرد أوزون إكسبريس'],
  'Destinataire': ['Recipient', 'المستلم'],
  'Téléphone': ['Phone', 'الهاتف'],
  'Ville': ['City', 'المدينة'],
  'Chercher une ville': ['Search a city', 'ابحث عن مدينة'],
  'Adresse': ['Address', 'العنوان'],
  'Note pour le livreur': ['Note for the courier', 'ملاحظة لعامل التوصيل'],
  'Le client peut ouvrir le colis': ['The customer may open the parcel', 'يمكن للزبون فتح الطرد'],
  'Fragile': ['Fragile', 'قابل للكسر'],
  'Échange (le livreur reprend un article)': ['Exchange (the courier takes an item back)', 'استبدال (يسترجع عامل التوصيل قطعة)'],
  'Ozon encaisse': ['Ozon collects', 'أوزون يحصّل'],
  'Frais de livraison Ozon': ['Ozon delivery fee', 'رسوم توصيل أوزون'],
  'Le colis part chez Ozon, suivi dans Livraisons': ['The parcel is going to Ozon, track it in Deliveries', 'الطرد في طريقه إلى أوزون، تابعه في التوصيلات'],
  'Annuler': ['Cancel', 'إلغاء'],
  'Créer le colis': ['Create the parcel', 'إنشاء الطرد'],
  'Envoi…': ['Sending…', 'جارٍ الإرسال…'],
  'Colis créé': ['Parcel created', 'تم إنشاء الطرد'],
  'Colis non créé': ['Parcel not created', 'لم يُنشأ الطرد'],
  'Remplissez le destinataire, un téléphone marocain, la ville et l’adresse.': ['Fill in the recipient, a Moroccan phone number, the city and the address.', 'أدخل المستلم ورقم هاتف مغربي والمدينة والعنوان.'],
  'Ozon ne répond pas. Réessayez dans un instant.': ['Ozon is not answering. Try again in a moment.', 'أوزون لا يستجيب. أعد المحاولة بعد قليل.'],
  'La clé Ozon n’est plus acceptée. Reliez le compte à nouveau depuis le tableau de bord.': ['The Ozon key is no longer accepted. Reconnect the account from the dashboard.', 'لم يعد مفتاح أوزون مقبولاً. أعد ربط الحساب من لوحة التحكم.'],
  'Cette vente n’est pas encore arrivée au serveur. Réessayez quand la caisse est en ligne.': ['This sale has not reached the server yet. Try again when the till is online.', 'لم تصل هذه البيعة إلى الخادم بعد. أعد المحاولة عند الاتصال.'],
  'Plus rien à encaisser sur cette vente.': ['Nothing left to collect on this sale.', 'لم يبق شيء للتحصيل في هذه البيعة.'],
  'Actualiser le suivi': ['Refresh tracking', 'تحديث التتبع'],
  'Bon de livraison Ozon': ['Ozon delivery note', 'وصل تسليم أوزون'],
  'Aucun nouveau colis à mettre sur un bon.': ['No new parcel to put on a note.', 'لا يوجد طرد جديد لإضافته إلى وصل.'],
  'Bon de livraison créé': ['Delivery note created', 'تم إنشاء وصل التسليم'],
  'Bon de livraison non créé': ['Delivery note not created', 'لم يُنشأ وصل التسليم'],
  'Bon complet (PDF)': ['Full note (PDF)', 'الوصل كاملاً (PDF)'],
  'Étiquettes A4': ['A4 labels', 'ملصقات A4'],
  'Étiquettes 10 × 10 cm': ['10 × 10 cm labels', 'ملصقات 10 × 10 سم'],
  'Fermer': ['Close', 'إغلاق'],
  'Les étiquettes s’ouvrent en PDF, prêtes à imprimer.': ['The labels open as a PDF, ready to print.', 'تُفتح الملصقات بصيغة PDF، جاهزة للطباعة.'],
  'Imprimer l’étiquette': ['Print label', 'طباعة الملصق'],
  'Étiquette prête': ['Label ready', 'الملصق جاهز'],
  'Étiquette non créée': ['Label not created', 'لم يُنشأ الملصق'],
  'En attente de ramassage': ['Waiting for pickup', 'في انتظار الاستلام'],
  'En route': ['On the way', 'في الطريق'],
  'Livré, en attente du paiement Ozon': ['Delivered, waiting for Ozon payment', 'سُلّم، في انتظار دفع أوزون'],
  'Payé par Ozon': ['Paid by Ozon', 'دفعه أوزون'],
  'Retourné par Ozon : vérifiez le colis, puis enregistrez le retour': ['Returned by Ozon: check the parcel, then record the return', 'أرجعه أوزون: تحقق من الطرد ثم سجّل الإرجاع'],
  'Refusé par le client : vérifiez le colis au retour, puis enregistrez le retour': ['Refused by the customer: check the parcel when it is back, then record the return', 'رفضه الزبون: تحقق من الطرد عند عودته ثم سجّل الإرجاع'],
  'Annulé chez Ozon': ['Cancelled at Ozon', 'أُلغي لدى أوزون'],
  'confirmée quand Ozon indique Payé': ['confirmed when Ozon says Paid', 'تُؤكد عندما يشير أوزون إلى مدفوع'],
  'Suivi mis à jour': ['Tracking updated', 'تم تحديث التتبع'],
  '{n} vente(s) payée(s) par Ozon, ajoutée(s) au chiffre.': ['{n} sale(s) paid by Ozon, added to revenue.', 'أُضيفت {n} بيعة دفعها أوزون إلى رقم المعاملات.'],
  'Aucune ville trouvée.': ['No city found.', 'لم يتم العثور على مدينة.'],
  'Vous recevrez': ['You will receive', 'ستتوصل بـ'],
  'Chez Ozon': ['At Ozon', 'لدى أوزون'],
  'Ozon vous doit': ['Ozon owes you', 'أوزون مدين لك بـ'],
  'livrés, pas encore payés, frais déduits': ['delivered, not paid yet, fees deducted', 'سُلّمت ولم تُدفع بعد، بعد خصم الرسوم'],
  'À ramasser': ['To pick up', 'للاستلام'],
  'Livrés': ['Delivered', 'مُسلّمة'],
  'Payés · 30 j': ['Paid · 30 d', 'مدفوعة · 30 يوماً'],
  '{n} colis à vérifier au retour': ['{n} parcel(s) to check on return', '{n} طرد للتحقق عند العودة'],
  'Créé': ['Created', 'أُنشئ'],
  'Livré': ['Delivered', 'سُلّم'],
  'Payé': ['Paid', 'مدفوع'],
  'Envoyer le suivi au client': ['Send tracking to the customer', 'إرسال التتبع للزبون'],
  'Copier le numéro': ['Copy the number', 'نسخ الرقم'],
  'Numéro copié': ['Number copied', 'تم نسخ الرقم'],
  'Bonjour {name}, votre commande est partie avec Ozon Express. Numéro de suivi : {code}. Le livreur vous appellera avant de passer.':
    ['Hello {name}, your order is on its way with Ozon Express. Tracking number: {code}. The courier will call you before coming.',
     'مرحباً {name}، طلبك في الطريق مع أوزون إكسبريس. رقم التتبع: {code}. سيتصل بك عامل التوصيل قبل الوصول.'],
  'Ville trouvée dans l’adresse': ['City found in the address', 'المدينة مأخوذة من العنوان'],
  'Modifier': ['Edit', 'تعديل'],
  'Repris de la fiche de livraison': ['From the delivery card', 'من بطاقة التوصيل'],
  'Le client paie au livreur': ['The customer pays the courier', 'يدفع الزبون لعامل التوصيل'],
  'Le client paie la livraison': ['The customer pays for delivery', 'الزبون يدفع ثمن التوصيل'],
  'Articles': ['Items', 'المنتجات'],
  'Livraison': ['Delivery', 'التوصيل'],
  'Refusé': ['Refused', 'مرفوض'],
  'Retourné': ['Returned', 'مُرجع'],
  'Annulé': ['Cancelled', 'ملغى'],
  'valeur des colis, payée par vos clients': ['parcel value, paid by your customers', 'قيمة الطرود التي يدفعها زبناؤك'],
  'encaissés par Ozon': ['collected by Ozon', 'حصّلها أوزون'],
  'frais de livraison': ['delivery fees', 'رسوم التوصيل'],
  'Voir': ['Show', 'عرض'],
};
const tr = (s) => {
  const C = window.KiwiCaisseLang;
  let lang = 'fr';
  try { lang = (C && C.get && C.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  return s;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mad = (cents) => {
  const v = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v) + ' MAD';
};
const KIND = { ok: 'ok', warn: 'warn', bad: 'bad', none: '' };

const status = new Map();      // slug → Promise<{connected}>
let labelSlug = '';            // la boutique dont la page Livraisons montre les colis
/* L'étiquette 10 × 10 d'un bon de livraison : un PDF public d'Ozon, ouvert par
   sa référence, sans connexion à TrackyOzon (vérifié le 30 oct. 2026). */
const LABEL_PDF = 'https://client.ozoneexpress.ma/pdf-delivery-note-tickets-4-4?dn-ref=';
let citiesP = null;

async function getJSON(url) {
  const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || 'http-' + r.status); e.body = body; throw e; }
  return body;
}
async function postJSON(url, payload) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || 'http-' + r.status); e.body = body; throw e; }
  return body;
}

export function ozonConnected(slug) {
  if (!slug || typeof fetch !== 'function') return Promise.resolve(false);
  if (!status.has(slug)) {
    status.set(slug, getJSON('/api/ozon/account?merchant=' + encodeURIComponent(slug)).then((s) => !!s.connected).catch(() => { status.delete(slug); return false; }));
  }
  return status.get(slug);
}

/* Les colis de la boutique, par vente. `refresh` relit le suivi chez Ozon
   (au plus toutes les cinq minutes côté serveur), `force` sans délai. */
export async function ozonParcels(slug, opts = {}) {
  labelSlug = slug;
  const q = opts.force ? '&force=1' : opts.refresh ? '&refresh=1' : '';
  const data = await getJSON('/api/ozon/parcels?merchant=' + encodeURIComponent(slug) + q);
  const bySale = new Map((data.parcels || []).map((p) => [p.saleId, p]));
  return { connected: !!data.connected, bySale, parcels: data.parcels || [], refreshed: data.refreshed };
}

const LINE = {
  pending: ['En attente de ramassage', KIND.none],
  in_transit: ['En route', KIND.none],
  delivered: ['Livré, en attente du paiement Ozon', KIND.none],
  paid: ['Payé par Ozon', KIND.ok],
  returned: ['Retourné par Ozon : vérifiez le colis, puis enregistrez le retour', KIND.bad],
  refused: ['Refusé par le client : vérifiez le colis au retour, puis enregistrez le retour', KIND.bad],
  cancelled: ['Annulé chez Ozon', KIND.warn],
};
/* Le trajet d'un colis en quatre étapes ; un retour, un refus ou une
   annulation arrête la barre là où le colis en était. */
const STEPS = ['Créé', 'En route', 'Livré', 'Payé'];
const REACHED = { pending: 1, in_transit: 2, delivered: 3, paid: 4, returned: 2, refused: 2, cancelled: 1 };

/* Un numéro marocain au format international, pour wa.me : 06… → 2126… */
function waNumber(phone) {
  let n = String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (/^0[5-7]\d{8}$/.test(n)) n = '212' + n.slice(1);
  return /^212[5-7]\d{8}$/.test(n) ? n : '';
}

/* Une ligne d'état sous la commande : numéro, trajet, mots d'Ozon, et, tant
   que le colis roule, le message de suivi à envoyer au client. */
export function ozonLine(p) {
  if (!p) return '';
  css();
  const [text, kind] = LINE[p.status] || LINE.in_transit;
  const ozonWords = p.statusLabel && !/^(livr|pay|retour|refus|annul)/i.test(p.statusLabel) ? ' (' + p.statusLabel + ')' : '';
  const reached = REACHED[p.status] || 2;
  const stopWord = { returned: 'Retourné', refused: 'Refusé', cancelled: 'Annulé' }[p.status];
  const steps = STEPS.map((k, i) => {
    if (stopWord && i === reached) return '<span class="stop"><i></i>' + esc(tr(stopWord)) + '</span>';
    return '<span class="' + (i < reached ? 'on' : '') + '"><i></i>' + esc(tr(k)) + '</span>';
  }).join('');
  const wa = waNumber(p.phone);
  const rolling = p.status === 'pending' || p.status === 'in_transit';
  const msg = tr('Bonjour {name}, votre commande est partie avec Ozon Express. Numéro de suivi : {code}. Le livreur vous appellera avant de passer.')
    .replace('{name}', String(p.receiver || '').split(' ')[0] || '').replace('{code}', p.tracking).replace(/\s+,/, ',');
  return '<div class="ozs-line' + (kind ? ' is-' + kind : '') + '">'
    + '<div class="ozs-lt"><button type="button" class="ozs-code" data-ozs-copy="' + esc(p.tracking) + '" title="' + esc(tr('Copier le numéro')) + '">Ozon <code>' + esc(p.tracking) + '</code><i data-icon="content_copy"></i></button>'
    + '<span>' + esc(tr(text) + ozonWords + (p.city ? ' · ' + p.city : '')) + '</span></div>'
    + '<div class="ozs-steps" aria-hidden="true">' + steps + '</div>'
    + (rolling ? '<button type="button" class="ozs-wa" data-ozs-label="' + esc(p.tracking) + '" data-ozs-bl="' + esc(p.blRef || '') + '"><i data-icon="print"></i>' + esc(tr('Imprimer l’étiquette')) + '</button>' : '')
    + (rolling && wa ? '<a class="ozs-wa" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '"><i data-icon="chat"></i>' + esc(tr('Envoyer le suivi au client')) + '</a>' : '')
    + '</div>';
}

/* « Chez Ozon » : où en sont les colis de la boutique, et l'argent qu'Ozon
   doit encore (livrés mais pas encore payés, frais de livraison déduits). */
export function ozonBoard(parcels) {
  const list = (parcels || []).filter((p) => p && !String(p.tracking).startsWith('pending:'));
  if (!list.length) return '';
  css();
  const month = Date.now() - 30 * 86400000;
  const pick = (f) => list.filter(f);
  const sum = (l, f) => l.reduce((n, p) => n + f(p), 0);
  const net = (p) => Math.max(0, (p.priceCents || 0) - ((p.fees && p.fees.deliveredCents) || 0));
  const st = [
    ['À ramasser', pick((p) => p.status === 'pending')],
    ['En route', pick((p) => p.status === 'in_transit')],
    ['Livrés', pick((p) => p.status === 'delivered')],
    ['Payés · 30 j', pick((p) => p.status === 'paid' && (p.paidTs || p.statusTs || 0) >= month)],
  ];
  const owed = sum(st[2][1], net);
  const owedGross = sum(st[2][1], (p) => p.priceCents || 0);
  const stop = pick((p) => p.status === 'returned' || p.status === 'refused').length;
  const moving = st[0][1].length + st[1][1].length;
  return '<section class="ozs-board" aria-label="' + esc(tr('Chez Ozon')) + '">'
    + '<div class="ozs-owe"><div><span>' + esc(tr('Ozon vous doit')) + '</span>'
      + '<small>' + (owedGross ? esc(mad(owedGross) + ' ' + tr('encaissés par Ozon') + ' \u2212 ' + mad(owedGross - owed) + ' ' + tr('frais de livraison')) : esc(tr('livrés, pas encore payés, frais déduits'))) + '</small></div>'
      + '<b>' + esc(mad(owed)) + '</b></div>'
    + '<div class="ozs-track' + (moving ? ' is-moving' : '') + '">'
    + st.map(([label, l], i) => '<div class="ozs-st' + (l.length ? ' has' : '') + (i === 3 ? ' paid' : '') + '"><i></i><b>' + l.length + '</b><span>' + esc(tr(label)) + '</span>'
      + '<small>' + (l.length ? esc(mad(sum(l, (p) => p.priceCents || 0))) : '') + '</small></div>').join('')
    + '<em class="ozs-run" aria-hidden="true"></em></div>'
    + '<p class="ozs-basis">' + esc(tr('valeur des colis, payée par vos clients')) + '</p>'
    + (stop ? '<button type="button" class="ozs-stop" data-ozs-stop><i data-icon="warning"></i><span>' + esc(tr('{n} colis à vérifier au retour').replace('{n}', String(stop))) + '</span><em>' + esc(tr('Voir')) + '<i data-icon="chevron_right"></i></em></button>' : '')
    + '</section>';
}
export const ozonNote = () => tr('confirmée quand Ozon indique Payé');
export const ozonLabel = (k) => tr(k);

function css() {
  if (document.getElementById('ozs-css')) return;
  const s = document.createElement('style');
  s.id = 'ozs-css';
  s.textContent = [
    '.ozs-line{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;font-size:13px;padding:8px 10px;border-radius:10px;background:var(--paper-soft,#F1EEE7);color:var(--ink-2,#3D4441);}',
    '.ozs-line b{font-weight:600;font-variant-numeric:tabular-nums;}',
    '.ozs-line.is-ok{background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);}',
    '.ozs-line.is-bad{background:color-mix(in srgb,var(--danger,#C94A3A) 12%,transparent);color:var(--danger,#C94A3A);}',
    '.ozs-line.is-warn{background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210);}',
    '.ozs-veil{position:fixed;inset:0;z-index:9000;background:rgba(10,15,13,.42);display:flex;align-items:center;justify-content:center;padding:16px;}',
    '.ozs-card{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 24px 60px rgba(10,15,13,.28);font-family:inherit;}',
    '.ozs-card h3{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;}',
    '.ozs-card h3+p{margin-top:-10px;}',
    '.ozs-card p{margin:0;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '.ozs-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.ozs-f{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;min-width:0;}',
    '.ozs-f.full{grid-column:1 / -1;}',
    '.ozs-f input,.ozs-f textarea{font:inherit;font-weight:400;font-size:15px;min-height:44px;padding:10px 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);color:inherit;}',
    '.ozs-f textarea{min-height:64px;resize:none;}',
    '.ozs-card :focus{outline:none;box-shadow:none;}',
    '.ozs-f input:focus-visible,.ozs-f textarea:focus-visible,.ozs-btn:focus-visible,.ozs-city:focus-visible,.ozs-edit:focus-visible,.ozs-stop:focus-visible,.ozs-code:focus-visible{outline:2px solid color-mix(in srgb,var(--atlas,#0B6E4F) 45%,transparent);outline-offset:2px;}',
    '.ozs-f input:focus,.ozs-f textarea:focus{border-color:var(--atlas,#0B6E4F);}',
    '.ozs-cities[hidden]{display:none;}',
    '.ozs-fee{font-size:12.5px;font-weight:500;color:var(--atlas,#0B6E4F);}',
    '.ozs-fee:empty{display:none;}',
    '.ozs-cities{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto;}',
    '.ozs-city{display:flex;justify-content:space-between;gap:8px;min-height:40px;padding:0 12px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;cursor:pointer;align-items:center;text-align:start;}',
    '.ozs-city.on{border-color:var(--atlas,#0B6E4F);background:var(--mint-tint,#E6F6EE);}',
    '.ozs-city small{color:var(--ink-3,#6F6C65);white-space:nowrap;}',
    '.ozs-checks{display:flex;flex-direction:column;gap:8px;font-size:14px;}',
    '.ozs-checks label{display:flex;gap:10px;align-items:center;min-height:36px;cursor:pointer;}',
    '.ozs-checks input{width:20px;height:20px;accent-color:var(--atlas,#0B6E4F);}',
    '.ozs-sum{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;background:var(--paper-soft,#F1EEE7);font-size:14px;color:var(--ink-2,#3D4441);}',
    '.ozs-sum .net{margin-top:4px;padding-top:10px;border-top:1px solid var(--line,#E2DDD2);align-items:baseline;color:var(--ink,#0A0F0D);}',
    '.ozs-sum .net span{font-weight:600;}',
    '.ozs-sum .net b{font-size:20px;font-weight:600;letter-spacing:-.01em;color:var(--atlas,#0B6E4F);}',
    '.ozs-sum div{display:flex;justify-content:space-between;gap:10px;}',
    '.ozs-sum b{font-variant-numeric:tabular-nums;}',
    '.ozs-sum b.plus::before{content:"+";}',
    '.ozs-err{font-size:13px;color:var(--danger,#C94A3A);}',
    '.ozs-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;position:sticky;bottom:-22px;margin:0 -22px -22px;padding:12px 22px 22px;background:var(--paper,#F7F5F0);}',
    '.ozs-links~.ozs-acts{position:static;margin:0;padding:0;}',
    '.ozs-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line,#E2DDD2);background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;font-weight:600;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;}',
    '.ozs-btn.go{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);}',
    '.ozs-btn[disabled]{opacity:.45;cursor:default;}',
    '.ozs-links{display:flex;flex-direction:column;gap:8px;}',
    '.ozs-line{flex-direction:column;align-items:stretch;gap:8px;}',
    '.ozs-lt{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;}',
    '.ozs-code{display:inline-flex;align-items:center;gap:5px;border:0;background:none;padding:0;font:inherit;font-weight:600;color:inherit;cursor:copy;}',
    '.ozs-code code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12.5px;font-weight:500;letter-spacing:0;}',
    '.ozs-code svg{width:14px;height:14px;opacity:.55;}',
    '.ozs-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:11px;}',
    '.ozs-steps span{display:flex;flex-direction:column;gap:4px;color:var(--ink-3,#6F6C65);}',
    '.ozs-steps span i{height:4px;border-radius:2px;background:color-mix(in srgb,var(--ink,#0A0F0D) 10%,transparent);}',
    '.ozs-steps span.on{color:var(--ink-2,#3D4441);}',
    '.ozs-steps span.on i{background:var(--atlas,#0B6E4F);}',
    '.ozs-steps span.stop{color:var(--danger,#C94A3A);font-weight:600;}',
    '.ozs-steps span.stop i{background:var(--danger,#C94A3A);}',
    '.ozs-line.is-bad .ozs-steps span:not(.stop){color:var(--ink-2,#3D4441);}',
    '.ozs-wa{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;background:var(--paper-elev,#FFFDFA);border:1px solid var(--line,#E2DDD2);color:var(--atlas,#0B6E4F);font-size:13px;font-weight:600;text-decoration:none;}',
    '.ozs-wa svg{width:16px;height:16px;}',
    '.ozs-board{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border-radius:16px;background:var(--paper-elev,#FFFDFA);border:1px solid var(--line,#E2DDD2);margin:0 0 12px;}',
    '.ozs-owe{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;}',
    '.ozs-owe span{display:block;font-size:13px;font-weight:600;}',
    '.ozs-owe small{display:block;font-size:12px;color:var(--ink-3,#6F6C65);}',
    '.ozs-owe b{font-size:28px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--atlas,#0B6E4F);white-space:nowrap;}',
    '.ozs-track{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}',
    '.ozs-track::before{content:"";position:absolute;top:8px;inset-inline:12.5%;height:2px;border-radius:2px;background:var(--line,#E2DDD2);}',
    '.ozs-st{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;min-width:0;}',
    '.ozs-st>i{width:18px;height:18px;border-radius:50%;background:var(--paper-elev,#FFFDFA);border:2px solid var(--line,#E2DDD2);z-index:1;margin-bottom:6px;}',
    '.ozs-st.has>i{border-color:var(--atlas,#0B6E4F);background:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);}',
    '.ozs-st.paid.has>i{background:var(--mint,#7DF2B0);border-color:var(--atlas,#0B6E4F);}',
    '.ozs-st b{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1;}',
    '.ozs-st span{font-size:12px;font-weight:600;}',
    '.ozs-st small{font-size:11.5px;color:var(--ink-3,#6F6C65);font-variant-numeric:tabular-nums;min-height:14px;}',
    /* Un colis qui roule : un point parcourt la ligne, du ramassage à la livraison. */
    '.ozs-run{position:absolute;top:5px;inset-inline-start:12.5%;width:8px;height:8px;border-radius:50%;background:var(--atlas,#0B6E4F);opacity:0;z-index:2;}',
    '.ozs-track.is-moving .ozs-run{animation:ozs-run 4.2s cubic-bezier(.45,0,.25,1) infinite;}',
    '@keyframes ozs-run{0%{opacity:0;inset-inline-start:12.5%;}10%{opacity:1;}80%{opacity:1;}100%{opacity:0;inset-inline-start:62.5%;}}',
    '.ozs-basis{margin:-6px 0 0;font-size:11.5px;text-align:center;color:var(--ink-3,#6F6C65);}',
    '.ozs-stop{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;font:inherit;font-size:13px;font-weight:600;padding:8px 12px;border:0;border-radius:10px;cursor:pointer;text-align:start;background:color-mix(in srgb,var(--danger,#C94A3A) 10%,transparent);color:var(--danger,#C94A3A);}',
    '.ozs-stop span{flex:1;}',
    '.ozs-stop em{display:inline-flex;align-items:center;gap:2px;font-style:normal;}',
    '.ozs-stop svg{width:16px;height:16px;}',
    'html[dir="rtl"] .ozs-stop em svg{transform:scaleX(-1);}',
    '.ozs-flash{animation:ozs-flash 1.4s ease;}',
    '@keyframes ozs-flash{0%,40%{box-shadow:0 0 0 3px color-mix(in srgb,var(--danger,#C94A3A) 40%,transparent);}100%{box-shadow:0 0 0 0 transparent;}}',
    '.ozs-hint{font-size:12px;color:var(--atlas,#0B6E4F);font-weight:600;}',
    '.ozs-ready{display:none;}',
    '.ozs-card.is-ready .ozs-ready{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px;border-radius:14px;background:var(--paper-elev,#FFFDFA);border:1px solid var(--line,#E2DDD2);}',
    '.ozs-card.is-ready .ozs-grid{display:none;}',
    '.ozs-rcpt{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:14px;}',
    '.ozs-rcpt b{font-size:17px;font-weight:600;letter-spacing:-.01em;}',
    '.ozs-from{font-size:12px;font-weight:600;color:var(--atlas,#0B6E4F);margin-bottom:4px;}',
    '.ozs-tel{font-variant-numeric:tabular-nums;color:var(--ink-2,#3D4441);}',
    '.ozs-addr{color:var(--ink-2,#3D4441);overflow-wrap:anywhere;}',
    '.ozs-dest{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-weight:600;}',
    '.ozs-dest svg{width:16px;height:16px;color:var(--atlas,#0B6E4F);}',
    '.ozs-edit{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 6px;border:0;border-radius:8px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--atlas,#0B6E4F);cursor:pointer;}',
    '.ozs-edit svg{width:16px;height:16px;}',
    '@media (prefers-reduced-motion:reduce){.ozs-track.is-moving .ozs-run,.ozs-flash{animation:none;}}',
    '@media (max-width:560px){.ozs-grid{grid-template-columns:1fr;}.ozs-owe b{font-size:22px;}}',
  ].join('\n');
  document.head.appendChild(s);
  /* Le numéro de suivi se copie d'un tap (pour le coller chez Ozon ou ailleurs). */
  document.addEventListener('click', (e) => {
    const stop = e.target && e.target.closest && e.target.closest('[data-ozs-stop]');
    if (stop) {
      const row = document.querySelector('.ozs-line.is-bad');
      const host = row && (row.closest('[data-bqd-row]') || row);
      if (host) { host.scrollIntoView({ behavior: 'smooth', block: 'center' }); host.classList.add('ozs-flash'); setTimeout(() => host.classList.remove('ozs-flash'), 1400); }
      return;
    }
    const lab = e.target && e.target.closest && e.target.closest('[data-ozs-label]');
    if (lab) { e.stopPropagation(); printLabel(lab); return; }
    const b = e.target && e.target.closest && e.target.closest('[data-ozs-copy]');
    if (!b) return;
    e.stopPropagation();
    const done = () => { b.classList.add('is-copied'); b.setAttribute('title', tr('Numéro copié')); };
    try { navigator.clipboard.writeText(b.getAttribute('data-ozs-copy')).then(done, () => {}); } catch (_) {}
  }, true);
}

/* « Imprimer l'étiquette » : l'étiquette officielle d'Ozon, en PDF. Un colis
   pas encore sur un bon de livraison en reçoit un à lui seul (Ozon n'imprime
   les étiquettes que par bon) ; ensuite le même bouton rouvre la même. La
   fenêtre s'ouvre au toucher, avant l'appel, pour que le navigateur la laisse
   passer. */
function printLabel(btn) {
  const tracking = btn.getAttribute('data-ozs-label'), bl = btn.getAttribute('data-ozs-bl');
  const w = window.open('', '_blank');
  const show = (ref) => {
    const url = LABEL_PDF + encodeURIComponent(ref);
    btn.setAttribute('data-ozs-bl', ref);
    if (w && !w.closed) { w.location.href = url; return; }
    veil('<h3>' + esc(tr('Étiquette prête')) + '</h3><div class="ozs-links"><a class="ozs-btn go" target="_blank" rel="noopener" href="' + esc(url) + '">' + esc(tr('Imprimer l’étiquette')) + '</a></div>'
      + '<div class="ozs-acts"><button type="button" class="ozs-btn" data-ozs-close>' + esc(tr('Fermer')) + '</button></div>');
  };
  if (bl) { show(bl); return; }
  if (!labelSlug) { if (w) w.close(); return; }
  btn.disabled = true;
  postJSON('/api/ozon/notes', { merchant: labelSlug, trackings: [tracking] })
    .then((res) => show(res.ref))
    .catch((e) => {
      if (w) w.close();
      veil('<h3>' + esc(tr('Étiquette non créée')) + '</h3><p>' + esc((e && e.body && e.body.message) || tr('Ozon ne répond pas. Réessayez dans un instant.')) + '</p>'
        + '<div class="ozs-acts"><button type="button" class="ozs-btn" data-ozs-close>' + esc(tr('Fermer')) + '</button></div>');
    })
    .finally(() => { btn.disabled = false; });
}

/* La liste des villes Ozon, pour la fiche de livraison de la caisse
   (delivery-card.js) : [{ id, name }]. */
export const ozonCities = (slug) => loadCities(slug);
function loadCities(slug) {
  if (!citiesP) citiesP = getJSON('/api/ozon/cities?merchant=' + encodeURIComponent(slug)).then((d) => d.cities || []).catch((e) => { citiesP = null; throw e; });
  return citiesP;
}
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function veil(html, onClose) {
  css();
  const v = document.createElement('div');
  v.className = 'ozs-veil';
  v.innerHTML = '<div class="ozs-card" role="dialog" aria-modal="true">' + html + '</div>';
  const close = () => { v.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('[data-ozs-close]')) close(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(v);
  return { el: v.firstElementChild, close };
}

const REFUSAL = {
  'not-a-delivery': 'Cette vente n’est pas encore arrivée au serveur. Réessayez quand la caisse est en ligne.',
  'nothing-due': 'Plus rien à encaisser sur cette vente.',
  'ozon-key-refused': 'La clé Ozon n’est plus acceptée. Reliez le compte à nouveau depuis le tableau de bord.',
  'ozon-unreachable': 'Ozon ne répond pas. Réessayez dans un instant.',
  'bad-phone': 'Remplissez le destinataire, un téléphone marocain, la ville et l’adresse.',
};

/* Le formulaire d'envoi. o : { slug, saleId, title, receiver, phone, address,
   dueCents, toast, onDone(parcel) } */
export function ozonOpenSend(o) {
  /* Qui paie la livraison (Santos, 30 oct. 2026 : le client, en plus de
     l'article). Retenu par boutique, coché par défaut. */
  const CUSTOMER_FEE = 5000;   // 50 MAD, en centimes
  const FEE_PREF = 'kiwiOzonFeeOnCustomer:' + (o && o.slug);
  let feeOnCustomer = true;
  try { feeOnCustomer = localStorage.getItem(FEE_PREF) !== '0'; } catch (_) {}
  const v = veil(
    '<h3>' + esc(tr('Colis Ozon Express')) + '</h3>'
    + (o.title ? '<p>' + esc(o.title) + '</p>' : '')
    + '<div class="ozs-ready" data-ozs="ready"></div>'
    + '<div class="ozs-grid">'
    + '<label class="ozs-f">' + esc(tr('Destinataire')) + '<input data-ozs="receiver" autocomplete="off" maxlength="80" value="' + esc(o.receiver || '') + '"></label>'
    + '<label class="ozs-f">' + esc(tr('Téléphone')) + '<input data-ozs="phone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" value="' + esc(o.phone || '') + '"></label>'
    + '<label class="ozs-f full">' + esc(tr('Ville')) + '<input data-ozs="city-q" type="text" enterkeyhint="search" role="combobox" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="' + esc(tr('Chercher une ville')) + '"><span class="ozs-fee" data-ozs="fee"></span></label>'
    + '<div class="ozs-cities full" data-ozs="cities" role="listbox" aria-label="' + esc(tr('Ville')) + '"></div>'
    + '<label class="ozs-f full">' + esc(tr('Adresse')) + '<textarea data-ozs="address" maxlength="240">' + esc(o.address || '') + '</textarea></label>'
    + '<label class="ozs-f full">' + esc(tr('Note pour le livreur')) + '<input data-ozs="note" maxlength="240" value="' + esc(o.note || '') + '"></label>'
    + '</div>'
    + '<div class="ozs-checks">'
    + '<label><input type="checkbox" data-ozs="feeOnCustomer"' + (feeOnCustomer ? ' checked' : '') + '>' + esc(tr('Le client paie la livraison')) + '</label>'
    + '<label><input type="checkbox" data-ozs="open" checked>' + esc(tr('Le client peut ouvrir le colis')) + '</label>'
    + '<label><input type="checkbox" data-ozs="fragile">' + esc(tr('Fragile')) + '</label>'
    + '<label><input type="checkbox" data-ozs="replace">' + esc(tr('Échange (le livreur reprend un article)')) + '</label>'
    + '</div>'
    + '<div class="ozs-sum" data-ozs="sum"></div>'
    + '<div class="ozs-err" data-ozs="err" role="alert"></div>'
    + '<div class="ozs-acts"><button type="button" class="ozs-btn" data-ozs-close>' + esc(tr('Annuler')) + '</button>'
    + '<button type="button" class="ozs-btn go" data-ozs="send">' + esc(tr('Créer le colis')) + '</button></div>');
  const $ = (k) => v.el.querySelector('[data-ozs="' + k + '"]');
  let list = [], city = null, busy = false;
  let guessed = false;
  const LAST = 'kiwiOzonLastCity:' + o.slug;
  const feeOn = () => { const box = $('feeOnCustomer'); return box ? box.checked : feeOnCustomer; };
  const sum = () => {
    const fee = city ? city.deliveredCents : 0;
    /* Le client paie toujours 50 MAD de livraison, quelle que soit la ville
       (Santos, 30 oct. 2026) ; Ozon garde ses propres frais sur ce qu'il
       encaisse. Même règle côté serveur : functions/api/ozon/parcels.js. */
    const custRows = () => (o.dueCents ? '<div><span>' + esc(tr('Articles')) + '</span><b>' + esc(mad(o.dueCents)) + '</b></div>' : '')
        + '<div><span>' + esc(tr('Livraison')) + '</span><b class="plus">' + esc(mad(CUSTOMER_FEE)) + '</b></div>'
        + (o.dueCents ? '<div><span>' + esc(tr('Le client paie au livreur')) + '</span><b>' + esc(mad(o.dueCents + CUSTOMER_FEE)) + '</b></div>' : '')
        + (city ? '<div><span>' + esc(tr('Frais de livraison Ozon')) + ' · ' + esc(city.name) + '</span><b>\u2212' + esc(mad(fee)) + '</b></div>' : '')
        + (city && o.dueCents ? '<div class="net"><span>' + esc(tr('Vous recevrez')) + '</span><b>' + esc(mad(Math.max(0, o.dueCents + CUSTOMER_FEE - fee))) + '</b></div>' : '');
    const shopRows = () => (o.dueCents ? '<div><span>' + esc(tr('Le client paie au livreur')) + '</span><b>' + esc(mad(o.dueCents)) + '</b></div>' : '')
        + (city ? '<div><span>' + esc(tr('Frais de livraison Ozon')) + ' · ' + esc(city.name) + '</span><b>\u2212' + esc(mad(fee)) + '</b></div>' : '')
        + (city && o.dueCents ? '<div class="net"><span>' + esc(tr('Vous recevrez')) + '</span><b>' + esc(mad(Math.max(0, o.dueCents - fee))) + '</b></div>' : '');
    $('sum').innerHTML = (feeOn() ? custRows() : shopRows())
      + (guessed && city ? '<div class="ozs-hint">' + esc(tr('Ville trouvée dans l’adresse')) + '</div>' : '');
    $('sum').hidden = !o.dueCents && !city;
    /* Les villes ne montrent plus les frais d'Ozon : le client paie 50 MAD
       partout, et ce qu'Ozon garde se lit dans le résumé ci-dessous. */
    $('fee').textContent = '';
  };
  const paintCities = () => {
    const q = fold($('city-q').value).trim();
    let last = 0;
    try { last = Number(localStorage.getItem(LAST)) || 0; } catch (_) {}
    const big = list.filter((c) => /casablanca|rabat|marrakech|tanger|fes|agadir/i.test(fold(c.name)));
    const top = last ? list.filter((c) => c.id === last).concat(big.filter((c) => c.id !== last)) : big;
    const hits = (q ? list.filter((c) => fold(c.name).includes(q)) : top).slice(0, 8);
    $('cities').innerHTML = hits.length
      ? hits.map((c) => '<button type="button" role="option" class="ozs-city' + (city && city.id === c.id ? ' on' : '') + '" aria-selected="' + (city && city.id === c.id) + '" data-ozs-city="' + c.id + '"><span>' + esc(c.name) + '</span></button>').join('')
      : (q ? '<p>' + esc(tr('Aucune ville trouvée.')) + '</p>' : '');
  };
  /* La ville déjà écrite dans l'adresse est choisie d'office (le nom le plus
     long qui y figure, pour préférer « Ain Sebaa » à « Ain »). */
  const words = (t) => fold(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const guess = () => {
    if (city || !list.length) return;
    /* La ville de la fiche d'abord (« Fès » = « Fes »), puis l'adresse. */
    const hint = words(o.cityHint);
    const same = hint && list.find((c) => words(c.name) === hint);
    if (same) { city = same; $('city-q').value = same.name; paintCities(); $('cities').hidden = true; sum(); ready(); return; }
    const a = ' ' + words($('address').value) + ' ';
    let best = null;
    for (const c of list) {
      const n = fold(c.name).replace(/[^a-z0-9]+/g, ' ').trim();
      if (n.length > 2 && a.includes(' ' + n + ' ') && (!best || n.length > fold(best.name).length)) best = c;
    }
    if (best) { city = best; guessed = true; $('city-q').value = best.name; paintCities(); $('cities').hidden = true; sum(); ready(); }
  };
  /* Fiche complète et ville reconnue : le formulaire se résume au colis à
     confirmer. « Modifier » rouvre les champs. */
  const ready = () => {
    const r = $('ready');
    const full = $('receiver').value.trim() && $('phone').value.trim() && $('address').value.trim() && city;
    if (!full || v.el.classList.contains('is-editing')) { v.el.classList.remove('is-ready'); return; }
    r.innerHTML = '<div class="ozs-rcpt"><span class="ozs-from">' + esc(tr('Repris de la fiche de livraison')) + '</span>'
      + '<b>' + esc($('receiver').value.trim()) + '</b><span class="ozs-tel">' + esc($('phone').value.trim()) + '</span>'
      + '<span class="ozs-addr">' + esc($('address').value.trim()) + '</span>'
      + '<span class="ozs-dest"><i data-icon="local_shipping"></i>' + esc(city.name) + ($('note').value.trim() ? ' · ' + esc($('note').value.trim()) : '') + '</span></div>'
      + '<button type="button" class="ozs-edit" data-ozs="edit"><i data-icon="edit"></i>' + esc(tr('Modifier')) + '</button>';
    v.el.classList.add('is-ready');
    try { window.lucide && window.lucide.createIcons && window.lucide.createIcons(); } catch (_) {}
    $('edit').addEventListener('click', () => { v.el.classList.add('is-editing'); v.el.classList.remove('is-ready'); $('receiver').focus(); });
    setTimeout(() => { const b = $('send'); if (b) b.focus(); }, 30);
  };
  $('address').addEventListener('change', guess);
  loadCities(o.slug).then((c) => { list = c; paintCities(); guess(); }).catch(() => { $('err').textContent = tr('Ozon ne répond pas. Réessayez dans un instant.'); });
  $('city-q').addEventListener('input', () => { if (city && $('city-q').value !== city.name) { city = null; sum(); } $('cities').hidden = false; paintCities(); });
  v.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ozs-city]');
    if (b) { city = list.find((c) => c.id === Number(b.dataset.ozsCity)) || null; guessed = false; $('city-q').value = city ? city.name : ''; paintCities(); $('cities').hidden = !!city; sum(); }
  });
  $('feeOnCustomer').addEventListener('change', () => {
    try { localStorage.setItem(FEE_PREF, $('feeOnCustomer').checked ? '1' : '0'); } catch (_) {}
    sum();
  });
  sum();
  $('send').addEventListener('click', () => {
    if (busy) return;
    const receiver = $('receiver').value.trim(), phone = $('phone').value.trim(), address = $('address').value.trim();
    if (!receiver || !phone || !address || !city) { $('err').textContent = tr('Remplissez le destinataire, un téléphone marocain, la ville et l’adresse.'); return; }
    busy = true; $('send').disabled = true; $('send').textContent = tr('Envoi…'); $('err').textContent = '';
    postJSON('/api/ozon/parcels', {
      merchant: o.slug, saleId: o.saleId, receiver, phone, address, cityId: city.id, note: $('note').value.trim(),
      open: $('open').checked ? 1 : 2, fragile: $('fragile').checked, replace: $('replace').checked,
      feeOnCustomer: $('feeOnCustomer').checked,
    }).then((res) => {
      try { localStorage.setItem(LAST, String(city.id)); } catch (_) {}
      v.close();
      if (o.toast) o.toast(tr('Colis créé') + ' · ' + res.parcel.tracking);
      if (o.onDone) o.onDone(res.parcel);
    }).catch((e) => {
      const code = e && e.message;
      const msg = REFUSAL[code] ? tr(REFUSAL[code]) : (e && e.body && e.body.message) || tr('Colis non créé');
      $('err').textContent = msg;
    }).finally(() => { busy = false; const b = $('send'); if (b) { b.disabled = false; b.textContent = tr('Créer le colis'); } });
  });
  setTimeout(() => { const f = $(o.receiver ? (o.phone ? 'city-q' : 'phone') : 'receiver'); if (f) f.focus(); }, 30);
}

const noParcels = (e) => !!e && e.message === 'no-parcels';
/* Bon de livraison : tous les colis pas encore sur un bon. */
export function ozonMakeNote(slug, toast) {
  return postJSON('/api/ozon/notes', { merchant: slug }).then((res) => {
    const v = veil('<h3>' + esc(tr('Bon de livraison créé')) + ' · ' + esc(res.ref) + '</h3>'
      + '<p>' + esc(tr('Les étiquettes s’ouvrent en PDF, prêtes à imprimer.')) + '</p>'
      + '<div class="ozs-links">'
      + '<a class="ozs-btn go" target="_blank" rel="noopener" href="' + esc(res.pdf.labels10x10) + '">' + esc(tr('Étiquettes 10 × 10 cm')) + '</a>'
      + '<a class="ozs-btn" target="_blank" rel="noopener" href="' + esc(res.pdf.labelsA4) + '">' + esc(tr('Étiquettes A4')) + '</a>'
      + '<a class="ozs-btn" target="_blank" rel="noopener" href="' + esc(res.pdf.standard) + '">' + esc(tr('Bon complet (PDF)')) + '</a>'
      + '</div><div class="ozs-acts"><button type="button" class="ozs-btn" data-ozs-close>' + esc(tr('Fermer')) + '</button></div>');
    return v;
  }).catch((e) => {
    if (toast) toast(noParcels(e) ? tr('Aucun nouveau colis à mettre sur un bon.') : tr('Bon de livraison non créé'), 5000, KIND.warn,
      e && e.body && e.body.message ? e.body.message : '');
  });
}

/* L'écran « Livraison enregistrée » : un bouton de plus, seulement si la
   boutique a relié son compte Ozon. */
export function ozonOffer(card, o) {
  if (!card || !o || !o.slug || !o.saleId) return;
  ozonConnected(o.slug).then((yes) => {
    if (!yes || !card.isConnected || card.querySelector('[data-ozs-offer]')) return;
    css();
    const row = document.createElement('div');
    row.className = 'modal-actions is-visible';
    row.style.marginTop = '10px';
    row.innerHTML = '<button class="ma-btn secondary" data-ozs-offer>' + esc(tr('Envoyer avec Ozon Express')) + '</button>';
    const done = card.querySelector('#bq-pay-done');
    const host = done && done.closest('.modal-actions');
    if (host) host.parentNode.insertBefore(row, host); else card.appendChild(row);
    row.firstElementChild.addEventListener('click', () => ozonOpenSend({ ...o, onDone: () => { row.remove(); if (o.onDone) o.onDone(); } }));
    /* Le destinataire ne se saisit plus à l'encaissement : le colis s'ouvre
       tout seul, c'est là qu'on l'écrit. Fermé, le bouton reste pour y revenir. */
    if (o.auto) row.firstElementChild.click();
  });
}

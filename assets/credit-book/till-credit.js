/* Caisses · le carnet de crédit au comptoir (épicerie : l'ardoise ; Maison et
 * boutique : « Compte client »).
 *
 * 1. Plafond. Avant une vente à crédit, la caisse demande au serveur
 *    (POST /api/credit/till, action 'check') si elle dépasse le plafond que le
 *    patron a posé. Dépasser demande l'accord d'un responsable : le même pavé à
 *    code que les remises du pressing (k-pin-pad), le code est comparé au
 *    serveur (verifyStaffPin), seul un rôle de responsable accorde, et l'accord
 *    est journalisé. Hors ligne, la caisse juge avec le dernier plafond connu ;
 *    dépasser hors ligne est refusé (le code ne peut pas être vérifié).
 * 2. « Paiera le … ». Après la vente, la caissière peut noter la date promise
 *    (dans 7 jours, fin du mois, une autre date) : une ligne d'échéancier, avec
 *    son id, rejouée jusqu'à ce que le serveur l'ait (petite file locale).
 * La démo ne parle jamais au serveur. */
const PHRASES = {
  'Plafond de crédit dépassé': ['Credit limit exceeded', 'تم تجاوز سقف الكريدي'],
  '{n} doit déjà {a}. Avec cette vente : {b}, pour un plafond de {c}.': ['{n} already owes {a}. With this sale: {b}, against a limit of {c}.', '{n} عليه {a}. مع هذا البيع: {b}، والسقف {c}.'],
  'Accord d’un responsable': ['Manager approval', 'موافقة المسؤول'],
  'Entrez le code responsable à 4 chiffres.': ['Enter the 4-digit manager code.', 'أدخل رمز المسؤول المكوّن من 4 أرقام.'],
  'Code responsable': ['Manager code', 'رمز المسؤول'],
  'Accordé par {n}': ['Approved by {n}', 'وافق عليه {n}'],
  'Code refusé': ['Code refused', 'الرمز مرفوض'],
  'Seul un responsable peut dépasser le plafond': ['Only a manager can go over the limit', 'وحده المسؤول يمكنه تجاوز السقف'],
  'Hors ligne : dépasser le plafond demande la connexion': ['Offline: going over the limit needs a connection', 'دون اتصال: تجاوز السقف يحتاج إلى الإنترنت'],
  'Vente à crédit non enregistrée': ['Credit sale not recorded', 'لم يُسجَّل البيع بالكريدي'],
  'Paiera le…': ['Will pay on…', 'سيدفع يوم…'],
  '{n} · {a} sur le carnet': ['{n} · {a} on the book', '{n} · {a} في دفتر الديون'],
  'Dans 7 jours': ['In 7 days', 'بعد 7 أيام'],
  'Fin du mois': ['End of month', 'آخر الشهر'],
  'Autre date': ['Other date', 'تاريخ آخر'],
  'Sans date': ['No date', 'بدون تاريخ'],
  'Promesse notée : {d}': ['Promise noted: {d}', 'تم تسجيل الموعد: {d}'],
};
const DAY = 86400000;
const lang = () => { try { return window.KiwiCaisseLang?.get?.() || 'fr'; } catch (_) { return 'fr'; } };
export const tr = (s, vars) => {
  const own = PHRASES[s];
  const l = lang();
  let out = own && (l === 'en' || l === 'ar') ? own[l === 'en' ? 0 : 1] : s;
  for (const [k, v] of Object.entries(vars || {})) out = out.split('{' + k + '}').join(String(v));
  return out;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mad = (cents) => {
  const n = (Number(cents) || 0) / 100;
  try { return new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 2 }).format(n) + ' MAD'; } catch (_) { return n.toFixed(2) + ' MAD'; }
};
const fmtDay = (day) => {
  try { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-MA-u-nu-latn' : lang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z')); } catch (_) { return day; }
};
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
};

export function tillMerchant() {
  try {
    const pv = window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    return String((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant') || window.KiwiCloudDoc?.currentSlug?.() || '');
  } catch (_) { return ''; }
}
export function tillIsReal() {
  try { return !!window.KiwiEnv?.isReal?.() || !!window.KiwiPlatform?.isPaired?.() || !!localStorage.getItem('kiwiPairedVenue'); } catch (_) { return true; }
}
async function post(body, ms = 4000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
  try {
    const res = await fetch('/api/credit/till', { method: 'POST', credentials: 'same-origin', signal: ctl?.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json || {} };
  } finally { clearTimeout(timer); }
}

/* ── le plafond ── */
const limitsKey = (m) => 'kiwiCreditLimits:' + m;
export async function refreshLimits(merchant) {
  try {
    const res = await fetch('/api/credit/till?merchant=' + encodeURIComponent(merchant), { credentials: 'same-origin' });
    const j = await res.json();
    if (res.ok && j && j.limits) store.set(limitsKey(merchant), j.limits);
  } catch (_) { /* hors ligne : on garde le dernier connu */ }
}

function ensureCss() {
  if (!document.getElementById('kc-credit-css')) {
    const style = document.createElement('style');
    style.id = 'kc-credit-css';
    style.textContent = `.kc-credit-veil{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(10,15,13,.42)}
  .kc-credit-card{width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:20px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);padding:20px;font-family:var(--font-ui,'Inter Tight',system-ui,sans-serif);box-shadow:0 24px 60px -24px rgba(5,59,44,.45)}
  .kc-credit-card h3{margin:0 0 6px;font-size:18px;font-weight:600}
  .kc-credit-card p{margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--ink-2,#3a4440)}
  .kc-credit-opts{display:grid;gap:8px}
  .kc-credit-opts button,.kc-credit-foot button{min-height:48px;border-radius:12px;border:1px solid var(--line,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:inherit;font:inherit;font-size:15px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 14px;cursor:pointer}
  .kc-credit-opts button span{color:var(--ink-3,#667);font-variant-numeric:tabular-nums}
  .kc-credit-opts input{min-height:48px;border-radius:12px;border:1px solid var(--line,rgba(10,15,13,.14));padding:0 12px;font:inherit;background:var(--surface,#FDFCF9);color:inherit}
  .kc-credit-foot{display:flex;gap:8px;margin-top:14px}.kc-credit-foot button{flex:1;justify-content:center}
  .kc-credit-foot .go{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
  .kc-credit-warn{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210);margin-bottom:12px;font-size:14px;line-height:1.45}`;
    document.head.appendChild(style);
  }
}
/* Un petit panneau à part, posé sur la caisse (les deux caisses n'ont pas les
   mêmes fenêtres). Rend { close, el }. */
function sheet(html) {
  const wrap = document.createElement('div');
  wrap.className = 'kc-credit-veil';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'kc-credit-card';
  card.dir = lang() === 'ar' ? 'rtl' : 'ltr';
  card.innerHTML = html;
  wrap.appendChild(card);
  ensureCss();
  document.body.appendChild(wrap);
  const prev = document.activeElement;
  const close = () => { wrap.remove(); try { prev && prev.focus && prev.focus(); } catch (_) {} };
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') wrap.dispatchEvent(new CustomEvent('kc-dismiss')); });
  return { el: wrap, close };
}

/* Le code du responsable, comparé par le serveur. Rend la réponse d'accord ou null. */
/* L'accord d'un responsable : le pavé du kit (<k-pin-pad>, assets/kit/pin.js)
 * dans une feuille du kit (<k-sheet>), comme les remises du pressing
 * (assets/pressing/manager-approval.js). Le pavé ne garde jamais le code : il
 * le passe à onsubmit, la caisse l'envoie au serveur qui le compare
 * (verifyStaffPin), et le pavé est vidé à chaque réponse. Sans le kit chargé,
 * pas d'accord possible : la vente à crédit est refusée. */
/* La caisse classique (sans la peau 2027) ne charge pas le kit : le pavé et
 * la feuille se chargent à la demande, les fichiers que la caisse 2027 écrit
 * dans sa tête (mêmes adresses, déjà dans le cache hors ligne de kiwi-sw.js),
 * dans le même ordre. tokens-2027.css ne déclare que des --k-* : rien de la
 * caisse classique ne change. */
const KIT_SCRIPTS = ['assets/kit/strings/kit.fr.js?v=2', 'assets/kit/strings/kit.en.js?v=2', 'assets/kit/strings/kit.ar.js?v=2',
  'assets/kit/strings.js?v=2', 'assets/kit/format.js?v=3', 'assets/kit/core.js?v=2', 'assets/kit/overlays.js?v=3', 'assets/kit/pin.js?v=6'];
const KIT_TOKENS = 'assets/kit/tokens-2027.css?v=2';
const KIT_SPRITE = 'assets/icons/material/sprite.till.svg?v=17';
const kitReady = () => !!(window.customElements && customElements.get('k-pin-pad') && customElements.get('k-sheet'));
let kitLoading = null;
export function ensureKit() {
  if (kitReady()) return Promise.resolve(true);
  if (!window.customElements || typeof document === 'undefined') return Promise.resolve(false);
  if (!kitLoading) {
    kitLoading = (async () => {
      if (!document.querySelector('link[href*="kit/tokens-2027.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = KIT_TOKENS;
        document.head.appendChild(link);
      }
      if (!document.querySelector('meta[name="kiwi-sprite"]')) {
        const meta = document.createElement('meta');
        meta.name = 'kiwi-sprite'; meta.content = KIT_SPRITE;
        document.head.appendChild(meta);
      }
      for (const src of KIT_SCRIPTS) {
        const file = src.split('?')[0];
        if ([...document.scripts].some((el) => (el.getAttribute('src') || '').split('?')[0].replace(/^\//, '') === file)) continue;
        await new Promise((ok, fail) => {
          const el = document.createElement('script');
          el.src = src; el.async = false;
          el.onload = ok; el.onerror = fail;
          document.head.appendChild(el);
        });
      }
      return kitReady();
    })().catch(() => false).then((ready) => { if (!ready) kitLoading = null; return ready; });
  }
  return kitLoading;
}

/* Une phrase traduite dont les noms et montants sont isolés (<bdi>) : en
 * arabe, « 500 MAD » ou un nom latin ne déplacent plus le point final. Écrit
 * en nœuds, jamais en HTML. */
function fillIsolated(el, phrase, vars) {
  const parts = tr(phrase).split(/(\{[a-z]\})/);
  for (const part of parts) {
    const m = /^\{([a-z])\}$/.exec(part);
    if (m && vars && m[1] in vars) {
      const b = document.createElement('bdi');
      b.textContent = String(vars[m[1]]);
      el.appendChild(b);
    } else if (part) el.appendChild(document.createTextNode(part));
  }
  return el;
}

async function askManager({ merchant, base, text }) {
  const ready = await ensureKit();
  return new Promise((resolve) => {
    if (!ready) { resolve(null); return; }
    ensureCss();
    const sheetEl = document.createElement('k-sheet');
    const pad = document.createElement('k-pin-pad');
    const warn = document.createElement('div');
    warn.className = 'kc-credit-warn';
    fillIsolated(warn, text.phrase, text.vars);
    sheetEl.setAttribute('heading', tr('Plafond de crédit dépassé'));
    sheetEl.setAttribute('data-kc-credit-approval', '');
    pad.setAttribute('heading', tr('Code responsable'));
    pad.setAttribute('sub', tr('Entrez le code responsable à 4 chiffres.'));
    pad.setAttribute('size', 'ipad');
    let busy = false, settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      pad.onsubmit = null; sheetEl.removeAttribute('open'); sheetEl.remove();
      resolve(v);
    };
    pad.onsubmit = async (code) => {
      if (busy) return;
      busy = true;
      let r;
      try { r = await post({ ...base, merchant, action: 'approve', pin: String(code || '') }); } catch (_) { r = null; }
      busy = false;
      if (r && r.status === 200 && (r.body.approved || !r.body.over)) return done(r.body);
      pad.answer({ clear: true, shake: true, dots: 'danger', assertive: true, haptic: 'Failed',
        message: !r || r.status >= 500 ? tr('Hors ligne : dépasser le plafond demande la connexion')
          : r.body.error === 'not-manager' ? tr('Seul un responsable peut dépasser le plafond') : tr('Code refusé') });
    };
    sheetEl.addEventListener('kiwi:action', (e) => { if (e.detail && e.detail.action === 'k.sheet.close') done(null); });
    sheetEl.appendChild(warn);
    sheetEl.appendChild(pad);
    document.body.appendChild(sheetEl);
    sheetEl.setAttribute('open', '');
    try { pad.shadowRoot && pad.shadowRoot.querySelector('[data-key="1"]') && pad.shadowRoot.querySelector('[data-key="1"]').focus(); } catch (_) {}
  });
}

/* { ok: true } quand la vente à crédit peut passer, { ok: false, reason } sinon.
 * `toast(title, desc)` est celui de la caisse. */
/* Une seule question à la fois : un second appui pendant qu'elle est posée
 * (réseau lent, pavé à code ouvert) est ignoré, jamais un second pavé. */
let gateBusy = false;
export async function creditGate(args) {
  if (gateBusy) return { ok: false, reason: 'busy' };
  gateBusy = true;
  try { return await gateOnce(args || {}); } finally { gateBusy = false; }
}
async function gateOnce({ merchant = tillMerchant(), source, customer, name = '', amountCents, localOwedCents = 0, toast = () => {} }) {
  if (!tillIsReal() || !merchant || !customer || !(amountCents > 0)) return { ok: true };
  const base = { source, customer: String(customer), addCents: Math.round(amountCents), localOwedCents: Math.max(0, Math.round(localOwedCents || 0)) };
  let decision = null, offline = false;
  try {
    const r = await post({ ...base, merchant, action: 'check' }, 2500);
    if (r.status === 200) decision = r.body; else offline = r.status >= 500;
  } catch (_) { offline = true; }
  if (!decision && offline) {
    const limit = store.get(limitsKey(merchant), {})[source + ':' + customer];
    if (!Number.isSafeInteger(limit)) return { ok: true };
    const after = base.localOwedCents + base.addCents;
    if (after <= limit) return { ok: true };
    toast(tr('Vente à crédit non enregistrée'), tr('Hors ligne : dépasser le plafond demande la connexion'));
    return { ok: false, reason: 'offline' };
  }
  if (!decision) return { ok: true };               /* refus d'accès (rare) : la vente reste au comptoir */
  if (decision.limited) {
    const all = store.get(limitsKey(merchant), {});
    all[source + ':' + customer] = decision.limitCents;
    store.set(limitsKey(merchant), all);
  }
  if (!decision.over) return { ok: true };
  const owed = decision.afterCents - base.addCents;
  const text = { phrase: '{n} doit déjà {a}. Avec cette vente : {b}, pour un plafond de {c}.', vars: { n: name || '·', a: mad(owed), b: mad(decision.afterCents), c: mad(decision.limitCents) } };
  const approved = await askManager({ merchant, base, text });
  if (!approved) { toast(tr('Vente à crédit non enregistrée'), ''); return { ok: false, reason: 'cancelled' }; }
  if (approved.approvedBy) toast(tr('Accordé par {n}', { n: approved.approvedBy.name || '' }), '');
  return { ok: true, approvedBy: approved.approvedBy || null };
}

/* « Compte client » de la caisse Maison : plafond, puis la note, puis la date
 * promise. `commit()` écrit la vente et rend true quand elle est écrite. Un
 * second appui pendant ce temps ne fait rien : le bouton reste désactivé
 * jusqu'au bout, et pour de bon une fois la vente écrite. */
export async function accountCheckout(btn, credit, commit) {
  if (!btn || btn.disabled) return false;
  btn.disabled = true;
  let done = false;
  try {
    if (!credit.demo && !(await creditGate(credit)).ok) return false;
    done = !!(await commit());
    if (done) promiseAfterSale({ ...credit, merchant: credit.demo ? '' : credit.merchant });
    return done;
  } finally { if (!done) btn.disabled = false; }
}

/* ── « paiera le … » ── */
const queueKey = (m) => 'kiwiCreditPromises:' + m;
export async function flushPromises(merchant = tillMerchant()) {
  if (!merchant) return;
  const list = store.get(queueKey(merchant), []);
  if (!Array.isArray(list) || !list.length) return;
  const left = [];
  for (const p of list) {
    try {
      const r = await post({ ...p, merchant, action: 'promise' });
      /* Une cliente encore dans la file des fiches (404) revient plus tard,
         une semaine au plus ; une ligne refusée (400) ne se rejoue pas. */
      if (r.status >= 500 || (r.status === 404 && Date.now() - (p.at || 0) < 7 * DAY)) left.push(p);
    } catch (_) { left.push(p); }
  }
  store.set(queueKey(merchant), left);
}
const todayLocal = () => { const d = new Date(Date.now() - 5 * 3600000); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); };
const plus = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const monthEnd = (day) => { const d = new Date(day + 'T00:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };

/* Le choix de la date, puis la ligne envoyée (ou gardée pour plus tard). */
let promiseOpen = false;
export function promiseAfterSale({ merchant = tillMerchant(), source, customer, name = '', amountCents, toast = () => {} }) {
  if (!customer || !(amountCents > 0) || promiseOpen) return Promise.resolve(null);
  promiseOpen = true;
  const today = todayLocal();
  const week = plus(today, 7), eom = monthEnd(today) <= today ? monthEnd(plus(today, 1)) : monthEnd(today);
  return new Promise((resolve) => {
    let s;
    try {
      s = sheet(`<h3>${esc(tr('Paiera le…'))}</h3>
        <p data-kc-credit-who></p>
        <div class="kc-credit-opts">
          <button type="button" data-day="${week}">${esc(tr('Dans 7 jours'))}<span>${esc(fmtDay(week))}</span></button>
          <button type="button" data-day="${eom}">${esc(tr('Fin du mois'))}<span>${esc(fmtDay(eom))}</span></button>
          <label class="kc-credit-other">${esc(tr('Autre date'))}</label>
          <input type="date" min="${plus(today, 1)}" max="${plus(today, 365)}" aria-label="${esc(tr('Autre date'))}">
        </div>
        <div class="kc-credit-foot"><button type="button" data-no>${esc(tr('Sans date'))}</button></div>`);
    } catch (_) { promiseOpen = false; resolve(null); return; }
    const who = s.el.querySelector('[data-kc-credit-who]');
    if (who) fillIsolated(who, '{n} · {a} sur le carnet', { n: name || '·', a: mad(amountCents) });
    const done = (day) => {
      if (!promiseOpen) return;
      promiseOpen = false;
      s.close();
      if (!day) return resolve(null);
      toast(tr('Promesse notée : {d}', { d: fmtDay(day) }), '');
      if (tillIsReal() && merchant) {
        const row = { source, customer: String(customer), id: 'tp' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(16).slice(2)), amountCents: Math.round(amountCents), dueDate: day, note: '', at: Date.now() };
        const list = store.get(queueKey(merchant), []);
        store.set(queueKey(merchant), (Array.isArray(list) ? list : []).concat([row]).slice(-200));
        flushPromises(merchant);
      }
      resolve(day);
    };
    s.el.addEventListener('kc-dismiss', () => done(null));
    s.el.querySelector('[data-no]').onclick = () => done(null);
    s.el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => done(b.dataset.day); });
    const input = s.el.querySelector('input[type=date]');
    input.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(input.value) && input.value > today) done(input.value); });
    setTimeout(() => s.el.querySelector('[data-day]')?.focus(), 30);
  });
}

/* Au chargement : les plafonds connus, et les promesses restées en file. */
try { const m = tillMerchant(); if (m && tillIsReal()) { refreshLimits(m); flushPromises(m); } } catch (_) {}

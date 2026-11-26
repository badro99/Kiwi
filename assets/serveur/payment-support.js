/* Pure centime allocation and durable, merchant-scoped loyalty delivery.
   Plus, tout en bas : les lots « Lancer » laissés sur la tablette (svOrphanBatches), annoncés et jamais rejoués. */
function serveurPaymentSupport() {
  if (serveurPaymentSupport.instance) return serveurPaymentSupport.instance;
  function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = weights.map(w => sum ? Math.floor(total * w / sum) : 0);
    let left = total - out.reduce((a, b) => a + b, 0);
    if (sum > 0) for (let j = 0; left > 0; j = (j + 1) % out.length) {
      if (weights[j] > 0) { out[j]++; left--; }
    }
    return out;
  }
  function equal(cents, n, pct) {
    const base = Math.floor(cents / n);
    const bases = Array.from({ length: n }, (_, i) => i === n - 1 ? cents - base * (n - 1) : base);
    const tips = allocate(Math.round(cents * pct / 100 + 1e-9), bases);
    return bases.map((amountCents, i) => ({ amountCents, tipCents: tips[i] }));
  }
  const authNeeded = new Set();
  function announce(kind, merchant) {
    try {
      if (typeof toast !== 'function' || typeof employeePick !== 'function') return;
      toast(kind === 'auth'
        ? employeePick('Points fidélité en attente · reconnectez-vous pour les envoyer', 'Loyalty points pending · sign in again to send them', 'نقاط الولاء قيد الانتظار · سجّل الدخول من جديد لإرسالها')
        : employeePick('Points fidélité refusés par le serveur pour un achat', 'Loyalty points refused by the server for a purchase', 'رفض الخادم نقاط الولاء لعملية شراء'), 7000);
    } catch (_) {}
  }
  function status(merchant) { return { pending: Object.keys(read(merchant)).length, authNeeded: authNeeded.has(merchant) }; }
  const memory = new Map(), busy = new Set(), prefix = 'kiwi:serveur:loyalty:';
  function report() { console.warn('[serveur] loyalty storage unavailable; retry kept in memory'); }
  function read(merchant) {
    const entries = memory.get(merchant) || {};
    try { Object.assign(entries, JSON.parse(localStorage.getItem(prefix + merchant) || '{}')); } catch (_) { report(); }
    memory.set(merchant, entries);
    return entries;
  }
  function persist(merchant, entries) {
    memory.set(merchant, entries);
    try { localStorage.setItem(prefix + merchant, JSON.stringify(entries)); } catch (_) { report(); }
  }
  async function flush(merchant) {
    if (!merchant || busy.has(merchant) || navigator.onLine === false) return;
    busy.add(merchant);
    try {
      const entries = read(merchant);
      persist(merchant, entries);
      for (const [ref, body] of Object.entries(entries)) {
        try {
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          let timer, response, data;
          // Promise-race deadline: a transport or body that ignores abort cannot keep this merchant busy forever.
          const deadline = new Promise((_, reject) => { timer = setTimeout(() => { if (ctl) ctl.abort(); reject(new Error('request-timeout')); }, 12000); });
          try {
            await Promise.race([deadline, (async () => {
              response = await fetch('/api/employee-clients', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
              });
              data = response.ok && await response.json();
            })()]);
          } finally { clearTimeout(timer); }
          // An expired session (401) is not a refusal of the purchase: keep it under the same key until the employee signs in again.
          if (response.status === 401) { authNeeded.add(merchant); announce('auth', merchant); break; }
          // A definitive refusal (4xx other than 401/408/429) will never succeed: drop it instead of retrying forever, and say so.
          const refused = !response.ok && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
          if (data && data.ok) { authNeeded.delete(merchant); delete entries[ref]; persist(merchant, entries); }
          else if (refused) { delete entries[ref]; persist(merchant, entries); announce('refused', merchant); }
        } catch (_) { break; }
      }
    } finally { busy.delete(merchant); }
  }
  function enqueue(body) {
    const entries = read(body.merchant);
    const ref = body.saleId ? 'employee-sale:' + body.saleId : body.ref;
    entries[ref] = { ...body, ref };
    persist(body.merchant, entries);
    void flush(body.merchant);
  }
  function retry() {
    const merchant = (typeof liveEmployeeState !== 'undefined' && liveEmployeeState && liveEmployeeState.merchant)
      || (typeof svSlug === 'function' ? svSlug() : '');
    if (merchant) void flush(merchant);
  }
  serveurPaymentSupport.instance = { allocate, equal, enqueue, flush, status };
  window.addEventListener('online', retry);
  setInterval(retry, 30000);
  setTimeout(retry, 0);
  return serveurPaymentSupport.instance;
}
serveurPaymentSupport();

/* Lots « Lancer » non confirmés laissés sur cette tablette par un AUTRE serveur
   (déconnecté, téléphone changé), ou par celui-ci mais trop anciens pour être
   rejoués : le balayage ne les envoie jamais, donc personne ne les voyait.
   On les annonce une fois, avec les tables concernées, sans rien rejouer. */
function svOrphanBatches() {
  const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
  const me = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
  const prefix = 'kiwi:service-pending-v1:' + merchant + ':';
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf(prefix) !== 0) continue;
      const rest = key.slice(prefix.length), cut = rest.indexOf(':');
      if (cut < 1) continue;
      let pending = null;
      try { pending = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { continue; }
      if (!pending || !pending.ref || !Array.isArray(pending.lines) || !pending.lines.length) continue;
      const stale = Date.now() - Number(pending.createdAt || 0) > SV_DRAFT_TTL;
      const operator = rest.slice(0, cut);
      if (operator !== String(me) || stale) found.push({ operator, table: rest.slice(cut + 1), stale, ref: pending.ref });
    }
  } catch (_) {}
  return found;
}
const svOrphanAnnounced = new Set();
function svAnnounceOrphans() {
  const fresh = svOrphanBatches().filter((o) => !svOrphanAnnounced.has(o.ref));
  if (!fresh.length) return 0;
  fresh.forEach((o) => svOrphanAnnounced.add(o.ref));
  const tables = Array.from(new Set(fresh.map((o) => o.table))).join(', ');
  toast(employeePick('Commandes non envoyées en cuisine, laissées sur cette tablette · voyez avec le responsable', 'Orders not sent to the kitchen were left on this tablet · check with your manager', 'طلبات لم تُرسل إلى المطبخ بقيت على هذا الجهاز · راجع المسؤول') + ' (' + tables + ')', 9000);
  return fresh.length;
}

/* ── Feuilles et brouillons (chasse du 26 nov. 2026) ──────────────────────
   Les feuilles (options, formule, couverts, paiement…) sont posées sur TOUS
   les écrans. Ce qui suit les garde justes quand le sol bouge sous elles. */

/* Fin de session : aucune feuille, aucun brouillon ne passe à la personne
   suivante. Une feuille d'options restée ouverte couvrait l'écran du code
   (vidéo iPad d'un client) et avalait le premier chiffre. Chaque remise à
   zéro est isolée : au tout premier appel, certaines variables du noyau ne
   sont pas encore déclarées. */
function svResetSheets() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.modal-veil.is-open').forEach((el) => el.classList.remove('is-open'));
  [() => { clearTimeout(cardSuccessTimer); clearTimeout(cardFootTimer); },
    () => { optDraft = null; }, () => { fmlDraft = null; }, () => { newTableId = null; },
    () => { voidLineTarget = null; }, () => { trfFromId = null; trfSelectedToId = null; },
    () => { mrgSourceId = null; mrgSelectedTargetId = null; }, () => { payTableId = null; },
    () => { splitPayCallback = null; cashAmountOverride = null; cashPay = null; cashSettled = false; },
  ].forEach((reset) => { try { reset(); } catch (_) {} });
}

/* Ce qu'une feuille ouverte lit dans la carte : le plat, ses groupes
   d'options et, pour une formule, chaque plat proposé. svApplyCarte la prend
   avant d'échanger la carte et la compare après. */
function svSheetSig() {
  try { if (!optDraft && !fmlDraft) return null; } catch (_) { return null; }   // aucune feuille ouverte (ou noyau pas encore chargé)
  const groupsOf = (ids) => (ids || []).map((g) => [g, optionGroups[g] || null]);
  const dish = (id) => { const it = menuItems.find((m) => m.id === id); return it ? [it, groupsOf(itemOptions[id])] : null; };
  const formula = (id) => {
    const it = menuItems.find((m) => m.id === id);
    if (!it || !it.formula) return null;
    const pool = (typeof svFormulaItems !== 'undefined' && svFormulaItems.length) ? svFormulaItems : menuItems;
    const parts = (it.formula.slots || []).flatMap((s) => (s.choices || []).map((c) => {
      const part = pool.find((x) => x.id === c.itemId);
      return part ? [part, groupsOf(part.opts && part.opts.length ? part.opts : itemOptions[c.itemId])] : null;
    }));
    return [it, groupsOf(itemOptions[id]), parts];
  };
  return { opt: optDraft ? JSON.stringify(dish(optDraft.itemId)) : '', fml: fmlDraft ? JSON.stringify(formula(fmlDraft.itemId)) : '' };
}
/* Le patron retire le plat ou change ses options pendant que sa feuille est
   ouverte : elle lisait la nouvelle carte avec l'ancien brouillon, les
   touchers ne faisaient plus rien et « Ajouter » était mort. On la ferme et
   on le dit ; un changement ailleurs sur la carte ne la touche pas. */
function svSheetsAfterCarte(before) {
  if (!before || (!before.opt && !before.fml)) return;
  const after = svSheetSig();
  let closed = false;
  if (before.opt && optDraft && after.opt !== before.opt) { closeOptionsSheet(); closed = true; }
  if (before.fml && fmlDraft && after.fml !== before.fml) { closeFormulaSheet(); closed = true; }
  if (closed) toast(employeePick('La carte vient de changer · reprenez ce plat', 'The menu just changed · pick this dish again', 'تغيّرت القائمة للتو · اختر هذا الطبق من جديد'), 4200);
}

/* Feuille d'options : un toucher ne reconstruit plus la feuille. Les pastilles
   et le prix changent sur place, et le sous-titre réserve dès l'ouverture la
   hauteur de sa version la plus longue : rien ne bouge sous le doigt. */
function svOptSubtitle(price, extra) {
  return `${price} MAD${extra ? ` · +${extra} MAD d'options` : ''} · personnalisez avant d'ajouter à la commande`;
}
function svOptReserve() {
  const sub = document.querySelector('#opt-modal-body .modal-subtle');
  const item = optDraft && menuItems.find((m) => m.id === optDraft.itemId);
  if (!sub || !item || !sub.offsetHeight) return;
  const most = (itemOptions[optDraft.itemId] || []).reduce((sum, g) => {
    const def = optionGroups[g], prices = ((def && def.vals) || []).map((v) => Number(v.p) || 0);
    return sum + (def && def.kind === 'multi' ? prices.reduce((a, b) => a + b, 0) : Math.max(0, ...prices));
  }, 0);
  if (!most) return;
  const shown = sub.textContent;
  sub.style.minHeight = '';
  sub.textContent = svOptSubtitle(item.price, most);
  const tall = sub.offsetHeight;
  sub.textContent = shown;
  if (tall > sub.offsetHeight) sub.style.minHeight = tall + 'px';
}
function svOptSync() {
  const body = document.getElementById('opt-modal-body');
  const item = optDraft && menuItems.find((m) => m.id === optDraft.itemId);
  if (!body || !item) return;
  body.querySelectorAll('.opt-pill').forEach((pill) => {
    const g = pill.dataset.optGroup, def = optionGroups[g], sel = optDraft.sel[g];
    const on = !def ? false : def.kind === 'multi' ? !!(sel && sel.has(pill.dataset.optVal)) : def.kind === 'toggle' ? sel === true : sel === pill.dataset.optVal;
    pill.classList.toggle('on', on);
  });
  const extra = optsExtra(optsFromSel(optDraft.itemId, optDraft.sel));
  const sub = body.querySelector('.modal-subtle'), confirm = body.querySelector('#opt-confirm');
  if (sub) sub.textContent = svOptSubtitle(item.price, extra);
  /* Seul le prix change : le libellé du bouton, déjà traduit par la feuille, reste tel quel. */
  const priceAt = confirm ? confirm.textContent.lastIndexOf(' · ') : -1;
  if (priceAt >= 0) confirm.textContent = confirm.textContent.slice(0, priceAt + 3) + fmtMAD(item.price + extra);
}

/* Vitrine (?demo=1) : pas de commerce derrière, donc pas de vente à écrire.
   La table se libère comme après un paiement confirmé, pour qu'un prospect
   voie espèces, carte et partage aller jusqu'au bout. */
function svDemoSettle(id) {
  const t = tables[id];
  if (!t) return false;
  tableClients.delete(id);
  t.status = 'khawya'; t.covers = 0; t.elapsed = 0;
  delete t.orderNo;
  tableOrders[id] = [];   // vide, pas absent : la commande d'exemple ne revient pas sur la table libérée
  dirtyOrders.delete(id);
  tableSplits.delete(id);
  tablesPaid++;
  if (activeTableId === id) returnToFloor();
  if (currentTab === 'tables') renderTables();
  if (currentTab === 'notifications') renderNotifications();
  if (currentTab === 'profil') renderProfil();
  toast(employeePick(`Table ${id} · réglée ✓`, `Table ${id} · paid ✓`, `الطاولة ${id} · مدفوعة ✓`));
  return true;
}

/* « Montant reçu » : un montant en dirhams tel qu'on le tape, virgule ou
   point, deux décimales au plus. Tout le reste (« 1e3 », lettres) vaut 0 :
   le champ était un type=number qui lisait « 1e3 » comme 1 000 et ne
   laissait pas saisir 132,50. */
function svMoneyInput(text) {
  const clean = String(text == null ? '' : text).replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d{0,2})?$/.test(clean) ? Math.round(parseFloat(clean) * 100) / 100 : 0;
}
function svMoneyText(amount) {
  const cents = Math.max(0, Math.round((Number(amount) || 0) * 100));
  return cents % 100 ? (cents / 100).toFixed(2).replace('.', ',') : String(cents / 100);
}

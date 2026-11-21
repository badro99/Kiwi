/* Chèques et effets · le portefeuille (Inyad « gestion des chèques », en mieux).
 * Chargé à la première ouverture (LAZY_SECTIONS, assets/pages-pro.js) depuis
 * la barre latérale (« Chèques et effets », sous Fournisseurs) et depuis la
 * page Fournisseurs.
 *
 *   · cartes : en portefeuille, à remettre cette semaine (dont en retard),
 *     remis à la banque, rejetés et contentieux, émis non débités (patron) ;
 *   · ancienneté des chèques EN MAIN : en retard 1-30 / 31-60 / 61-90 / 90+
 *     jours par échéance, à venir mois par mois sur six mois ;
 *   · clients qui ont des chèques en main (nombre et somme), un toucher filtre ;
 *   · liste triée par échéance, filtres par statut (lentille liquide), client,
 *     dates et recherche ; export CSV (cellules neutralisées contre les
 *     formules) ;
 *   · fiche d'un chèque : ce qu'il règle, l'historique, et SEULEMENT les
 *     passages permis par le serveur (functions/api/_cheques.js TRANSITIONS),
 *     chacun avec ce qu'il fera à l'argent avant de confirmer ;
 *   · bordereau de remise : les chèques à porter à la banque aujourd'hui, le
 *     total, imprimable (et réimprimable depuis chaque chèque remis).
 *
 * Données réelles : /api/cheques, /api/cheques/detail, /move, /edit. Rôles :
 * patron tout ; gérant les chèques reçus (le serveur cache les émis) ; aucun
 * autre rôle n'ouvre la page. Une session de démonstration voit des chèques
 * d'exemple, en mémoire, jamais un vrai commerçant (isReal()).
 */
(() => {
  'use strict';
  const K = window.Kiwi;
  if (!K || !K.handlers) return;
  const handlers = K.handlers;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const LX = (lg, fr, en, ar) => (lg === 'en' ? en : lg === 'ar' ? ar : fr);
  const L = (fr, en, ar) => LX(lang(), fr, en, ar);
  const pl = (n, one, many) => (Number(n) === 1 ? one : many);
  const arPl = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Un seul format pour toute la page (cartes, fiche, bandeau, bordereau) : « 1 500,00 ». */
  const num = (n) => { try { return new Intl.NumberFormat(locale(lang()), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); } catch (_) { return (Math.round(n * 100) / 100).toFixed(2); } };
  const madX = (lg, cents) => num((Number(cents) || 0) / 100) + ' ' + LX(lg, 'MAD', 'MAD', 'درهم');
  const mad = (cents) => madX(lang(), cents);
  const pad = (v) => String(v).padStart(2, '0');
  const localYmd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayYmd = () => (S.data && S.data.today) || localYmd(new Date());
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  const dmy = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const locale = (lg) => (lg === 'ar' ? 'ar-MA-u-nu-latn' : lg === 'en' ? 'en-GB' : 'fr-FR');
  const shortDate = (ymd, lg) => { try { return new Date(ymd + 'T12:00:00Z').toLocaleDateString(locale(lg || lang()), { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch (_) { return dmy(ymd); } };
  const monthName = (ym) => { try { return new Date(ym + '-15T12:00:00Z').toLocaleDateString(locale(lang()), { month: 'short', year: '2-digit', timeZone: 'UTC' }); } catch (_) { return ym; } };
  const idem = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const slug = () => { try { return (window.KiwiStore && window.KiwiStore.slugFor && window.KiwiStore.slugFor()) || ''; } catch (_) { return ''; } };
  const role = () => String(window.__kiwiRole || 'owner');
  const canOpen = () => role() === 'owner' || role() === 'manager';
  const isOwner = () => role() === 'owner';
  const isReal = () => {
    try { if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true; } catch (_) {}
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  };
  const shopName = () => { try { const v = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); return (v && v.name) ? String(v.name) : ''; } catch (_) { return ''; } };
  const daysTxt = (n) => L(pl(n, `${n} jour`, `${n} jours`), pl(n, `${n} day`, `${n} days`), arPl(n, 'نهار واحد', 'جوج أيام', `${n} أيام`, `${n} يوم`));
  const countTxt = (n) => L(pl(n, `${n} chèque`, `${n} chèques`), pl(n, `${n} cheque`, `${n} cheques`), arPl(n, 'شيك واحد', 'جوج شيكات', `${n} شيكات`, `${n} شيك`));

  /* Material Symbols, Outlined 400 (assets/icons/material/), tels quels. */
  const P = {
    search: 'M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z',
    account_balance: 'M200-280v-280h80v280h-80Zm240 0v-280h80v280h-80ZM80-120v-80h800v80H80Zm600-160v-280h80v280h-80ZM80-640v-80l400-200 400 200v80H80Zm178-80h444-444Zm0 0h444L480-830 258-720Z',
    download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    lock: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z',
    refresh: 'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z',
    warning: 'm40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z',
    receipt_long: 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z',
    print: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
    edit: 'M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z',
  };
  const icon = (k, cls) => `<svg class="cq-i${cls ? ' ' + cls : ''}" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  /* La table des passages, recopiée du serveur pour la démo seulement : en vrai,
     chaque chèque arrive avec `allowed`, calculé par functions/api/_cheques.js. */
  const DEMO_TRANSITIONS = {
    received: { received: ['deposited', 'replaced', 'cancelled'], deposited: ['collected', 'rejected', 'received'], rejected: ['deposited', 'in_litigation', 'replaced'], in_litigation: ['deposited', 'replaced'] },
    issued: { issued: ['debited', 'rejected', 'cancelled'], rejected: ['issued', 'replaced'] },
  };
  const BANKS = ['Attijariwafa bank', 'Bank of Africa (BMCE)', 'Banque Populaire', 'CIH Bank', 'Société Générale Maroc', 'Crédit du Maroc', 'BMCI', 'Crédit Agricole du Maroc', 'Al Barid Bank', 'CFG Bank', 'Bank Assafa', 'Umnia Bank', 'Al Akhdar Bank', 'Arab Bank'];
  const REPLACE_METHODS = ['cash', 'transfer', 'card', 'other'];
  const RECEIVED_METHODS = ['till', 'cash', 'transfer', 'card'];
  const DIRS = ['received', 'issued'], PAPERS = ['cheque', 'lcn'];
  const TO = { cancel: 'cancelled' };
  const SEG = { methods: 'data-cq-methods', dir: 'data-cq-dir', kind: 'data-cq-kind' };
  const methodLabel = (m) => ({ till: L('Réglé à la caisse', 'Paid at the till', 'تخلّص فالكاسة'), cash: L('Espèces', 'Cash', 'كاش'), transfer: L('Virement', 'Transfer', 'تحويل'), card: L('Carte', 'Card', 'بطاقة'), other: L('Autre', 'Other', 'طريقة أخرى'), cheque: L('Chèque', 'Cheque', 'شيك') }[m] || m);

  const kindLabel = (k, lg) => (k === 'lcn' ? LX(lg || lang(), 'LCN', 'LCN', 'كمبيالة') : LX(lg || lang(), 'Chèque', 'Cheque', 'شيك'));
  function statusLabel(st, dir, lg) {
    const g = lg || lang();
    return ({
      received: LX(g, 'En portefeuille', 'In hand', 'فاليد'),
      deposited: LX(g, 'Remis à la banque', 'At the bank', 'فالبنكة'),
      collected: LX(g, 'Encaissé', 'Collected', 'دخل للحساب'),
      rejected: dir === 'issued' ? LX(g, 'Rejeté chez le fournisseur', 'Bounced at the supplier', 'رجع عند المورد') : LX(g, 'Impayé, rejeté', 'Bounced', 'رجع بلا رصيد'),
      in_litigation: LX(g, 'Contentieux', 'In dispute', 'فالنزاع'),
      replaced: LX(g, 'Réglé autrement', 'Paid another way', 'تخلّص بطريقة أخرى'),
      cancelled: LX(g, 'Annulé', 'Cancelled', 'ملغي'),
      issued: LX(g, 'Émis, pas encore débité', 'Issued, not yet debited', 'عطيناه، مازال ما تقطع'),
      debited: LX(g, 'Débité', 'Debited', 'تقطع من الحساب'),
    }[st] || st);
  }
  const chipClass = (st) => ({ received: 'hand', deposited: 'bank', collected: 'ok', debited: 'ok', rejected: 'bad', in_litigation: 'bad', replaced: 'muted', cancelled: 'muted', issued: 'bank' }[st] || 'muted');
  const chip = (c) => `<span class="cq-chip ${chipClass(c.status)}">${esc(statusLabel(c.status, c.direction))}</span>`;
  function actionLabel(c, to) {
    if (to === 'deposited') return c.status === 'received' ? L('Remettre à la banque', 'Deposit at the bank', 'دفعو للبنكة') : L('Représenter à la banque', 'Present again', 'عاود دفعو للبنكة');
    return ({
      collected: L('Encaissé sur le compte', 'Collected', 'دخل للحساب'),
      rejected: c.direction === 'issued' ? L('Rejeté chez le fournisseur', 'Bounced at the supplier', 'رجع عند المورد') : L('Rejeté, impayé', 'Bounced', 'رجع بلا رصيد'),
      in_litigation: L('Passer en contentieux', 'Move to dispute', 'دوزو للنزاع'),
      replaced: L('Réglé autrement', 'Paid another way', 'تخلّص بطريقة أخرى'),
      cancelled: L('Annuler ce chèque', 'Cancel this cheque', 'ألغي هاد الشيك'),
      received: L('Annuler la remise', 'Undo the deposit', 'رجعو من البنكة'),
      debited: L('Débité de notre compte', 'Debited from our account', 'تقطع من الحساب ديالنا'),
      issued: L('Représenté par le fournisseur', 'Presented again', 'المورد عاود قدّمو'),
    }[to] || to);
  }
  const who = (c) => c.partyName || c.drawerName || L('Sans nom', 'No name', 'بلا اسم');
  /* Qui a fait le geste : le serveur signe en français (« Gérant · Salma ») ; le rôle se traduit, le prénom reste. */
  function actorLabel(a) {
    const [roleWord, ...rest] = String(a || '').split(' · ');
    const role = ({ 'Propriétaire': L('Propriétaire', 'Owner', 'مول المحل'), 'Gérant': L('Gérant', 'Manager', 'المسيّر'), 'Opérateur Kiwi': L('Opérateur Kiwi', 'Kiwi operator', 'فريق Kiwi'),
      'Caisse': L('Caisse', 'Till', 'الكاسة'), 'Vous': L('Vous', 'You', 'نتا') }[roleWord]) || roleWord;
    return [role, ...rest].filter(Boolean).join(' · ');
  }

  /* Les fiches clientes du carnet (KiwiClients) : un chèque rattaché à une
     fiche porte sa dette au compte de la cliente si jamais il revient. */
  function clientCards() {
    try {
      const KC = window.KiwiClients;
      return ((KC && KC.list && KC.list()) || []).filter((x) => x && x.id && !x.deleted && (x.name || x.fullName))
        .map((x) => ({ id: String(x.id), name: String(x.name || x.fullName), phone: String(x.phone || '') }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (_) { return []; }
  }
  function clientSelect(current) {
    const list = clientCards();
    if (current && !list.some((x) => x.id === current)) list.unshift({ id: current, name: L('Fiche actuelle', 'Current card', 'البطاقة الحالية'), phone: '' });
    return `<select name="client" data-cq-client><option value="">${esc(L('Sans fiche, nom libre', 'No card, free name', 'بلا بطاقة، سمية حرة'))}</option>${list.map((x) => `<option value="${esc(x.id)}"${x.id === current ? ' selected' : ''}>${esc(x.name)}${x.phone ? ' · ' + esc(x.phone) : ''}</option>`).join('')}</select>`;
  }
  /* Un brouillon WhatsApp (wa.me, rien n'est envoyé sans le patron). Un 06/07 marocain devient +212. */
  function waHref(phone, text) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (/^0[5-7]\d{8}$/.test(d)) d = '212' + d.slice(1);
    return 'https://wa.me/' + (d.length >= 9 ? d : '') + '?text=' + encodeURIComponent(text);
  }
  function waText(c) {
    const shop = shopName(), name = c.partyName || c.drawerName || '';
    const owed = c.debt && c.debt.onAccount ? c.debt.remainingCents : c.amountCents;
    const no = c.number ? (lang() === 'ar' ? ` رقم ${c.number}` : ` n° ${c.number}`) : '';
    if (c.debtOpen) return L(`Bonjour ${name}, votre chèque${no} de ${mad(c.amountCents)} nous est revenu impayé. Il reste ${mad(owed)} à régler. Vous pouvez passer en boutique ou nous dire quand vous préférez. Merci. ${shop}`,
      `Hello ${name}, your cheque${no} for ${mad(c.amountCents)} came back unpaid. ${mad(owed)} is still due. You can stop by the shop or tell us what suits you. Thank you. ${shop}`,
      `السلام عليكم ${name}، الشيك${no} ديال ${mad(c.amountCents)} رجع لينا بلا رصيد. باقي ${mad(owed)} خاصها تتخلّص. مرحبا بيك فالمحل ولا قول لينا شنو يناسبك. شكرا. ${shop}`).trim();
    return L(`Bonjour ${name}, petit rappel : votre chèque${no} de ${mad(c.amountCents)} arrive à échéance le ${dmy(c.dueDate || c.receptionDate)}. Nous le remettons à la banque, merci de prévoir la provision. ${shop}`,
      `Hello ${name}, a quick reminder: your cheque${no} for ${mad(c.amountCents)} is due on ${dmy(c.dueDate || c.receptionDate)}. We are depositing it, please make sure the funds are there. ${shop}`,
      `السلام عليكم ${name}، غير تذكير: الشيك${no} ديال ${mad(c.amountCents)} حلّ الأجل ديالو نهار ${dmy(c.dueDate || c.receptionDate)}. غادي ندفعوه للبنكة، الله يخليك وجّد الرصيد. ${shop}`).trim();
  }

  /* Ce qu'un passage fera à l'argent, dit avant de confirmer (mêmes règles que le serveur). */
  function impactText(c, to) {
    const name = who(c), amt = mad(c.amountCents), rec = c.direction === 'received';
    if (to === 'rejected') return c.debtOpen ? L('Déjà rejeté une fois : la dette reste comptée une seule fois.', 'Already bounced once: the debt stays counted once.', 'رجع قبل: الدين كيبقى محسوب مرة وحدة.')
      : rec ? L(`${name} vous devra de nouveau ${amt}.`, `${name} will owe you ${amt} again.`, `${name} غادي يرجع عليه ${amt}.`)
        : L(`Vous devrez de nouveau ${amt} à ${name}.`, `You will owe ${name} ${amt} again.`, `غادي يرجع عليك ${amt} ل${name}.`);
    if ((to === 'collected' && rec) || (to === 'debited' && !rec) || to === 'replaced') {
      if (c.debtOpen && rec && c.debt && c.debt.onAccount && c.debt.paidCents > 0) {
        const paid = mad(c.debt.paidCents), rest = mad(c.debt.remainingCents);
        return c.debt.remainingCents ? L(`${name} a déjà réglé ${paid} à la caisse. Le reste, ${rest}, entre aux ventes et son compte est soldé.`, `${name} already paid ${paid} at the till. The remaining ${rest} goes to sales and the account is cleared.`, `${name} خلّص ${paid} فالكاسة. الباقي، ${rest}، كيدخل للمبيعات والحساب ديالو كيتسدّ.`)
          : L(`${name} a tout réglé à la caisse : le chèque se ferme, rien n'est compté deux fois.`, `${name} paid it all at the till: the cheque closes, nothing is counted twice.`, `${name} خلّص كلشي فالكاسة: الشيك كيتسدّ، حتى حاجة ما كتتحسب جوج مرات.`);
      }
      if (c.debtOpen) return rec ? L(`La dette de ${amt} de ${name} se referme.`, `${name}'s ${amt} debt is closed.`, `الدين ديال ${name} (${amt}) كيتسدّ.`)
        : L(`Votre dette de ${amt} envers ${name} se referme.`, `Your ${amt} debt to ${name} is closed.`, `الدين اللي عليك ل${name} (${amt}) كيتسدّ.`);
      return rec ? L("Rien ne change au chiffre d'affaires : la vente a déjà compté ce chèque.", 'Sales do not change: the sale already counted this cheque.', 'المبيعات ما كتبدلش: البيعة حسبات هاد الشيك من قبل.')
        : L('Le paiement du fournisseur était déjà inscrit à l\'émission.', 'The supplier payment was already recorded when issued.', 'الأداء للمورد تسجّل ملي عطيناه الشيك.');
    }
    if (to === 'cancelled' && !rec && !c.debtOpen) return L(`Le paiement de ${amt} à ${name} est retiré : vous lui devez de nouveau cette somme.`, `The ${amt} payment to ${name} is withdrawn: you owe it again.`, `الأداء ديال ${amt} ل${name} كيتحيّد: رجعات عليك.`);
    if (to === 'in_litigation') return L('La dette reste due, rien de plus n\'est écrit.', 'The debt stays due, nothing else is recorded.', 'الدين باقي، ما كيتزاد والو.');
    return L('Aucun mouvement d\'argent : seul le papier change de place.', 'No money moves: only the paper changes place.', 'حتى فلوس ما كتتحرك: غير الورقة اللي تبدّلات بلاصتها.');
  }

  function css() {
    if (document.getElementById('cq-css')) return;
    const style = document.createElement('style');
    style.id = 'cq-css';
    style.textContent = `
.cq-i{width:18px;height:18px;flex:none}
.cq-wrap{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);min-width:0;max-width:100%}
.cq-wrap>*{min-width:0}
.cq-card{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:var(--r-xl,18px);background:var(--paper-elev,var(--paper,#F7F5F0));padding:18px;min-width:0}
.cq-kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))}
.cq-kpi{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:var(--r-xl,18px);background:var(--paper-elev,var(--paper,#F7F5F0));padding:14px 16px;text-align:start;font:inherit;color:inherit;cursor:pointer;display:grid;gap:4px}
.cq-kpi:hover{border-color:var(--atlas,#0B6E4F)}
.cq-kpi .k{font-size:12px;color:var(--n-500,#667);letter-spacing:.02em;display:flex;align-items:center;gap:6px}
.cq-kpi .v{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.cq-kpi .s{font-size:12.5px;color:var(--n-600,#3a4440)}
.cq-kpi .v.bad{color:var(--danger,#C94A3A)}.cq-kpi .v.ok{color:var(--atlas,#0B6E4F)}.cq-kpi .s.late{color:var(--danger,#C94A3A)}
.cq-age{display:grid;gap:18px}
@media(min-width:900px){.cq-age{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}}
.cq-h3{margin:0 0 10px;font-size:14px;font-weight:600;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}
.cq-h3 small{font-weight:400;color:var(--n-500,#667);font-size:12.5px}
.cq-bar4{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--n-100,rgba(10,15,13,.06));gap:2px}
.cq-bar4 i{display:block;height:100%}
.cq-a0{background:var(--warning,#D99A2B)}.cq-a1{background:color-mix(in srgb,var(--warning,#D99A2B) 55%,var(--danger,#C94A3A))}.cq-a2{background:color-mix(in srgb,var(--warning,#D99A2B) 25%,var(--danger,#C94A3A))}.cq-a3{background:var(--danger,#C94A3A)}
.cq-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr));gap:8px 14px;margin-top:10px;font-size:12.5px;color:var(--n-600,#3a4440)}
.cq-legend span{display:grid;grid-template-columns:auto 1fr;gap:2px 6px;align-items:center;font-variant-numeric:tabular-nums}
.cq-legend b{width:10px;height:10px;border-radius:3px;display:inline-block;font-weight:400}
.cq-legend em{grid-column:2;font-style:normal;color:var(--ink,#0A0F0D);font-weight:500}
.cq-months{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;align-items:end;height:118px}
.cq-month{display:grid;grid-template-rows:auto 1fr auto;gap:4px;height:100%;text-align:center;font-size:11.5px;color:var(--n-600,#3a4440);min-width:0}
.cq-month .col{align-self:end;background:color-mix(in srgb,var(--atlas,#0B6E4F) 75%,transparent);border-radius:6px 6px 2px 2px;min-height:2px}
.cq-month .col.zero{background:var(--n-100,rgba(10,15,13,.08))}
.cq-month .amt{font-variant-numeric:tabular-nums;color:var(--ink,#0A0F0D);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-parties{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;max-width:100%;min-width:0}
.cq-party{flex:none;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:999px;background:var(--surface,#FDFCF9);font:inherit;font-size:13px;padding:6px 12px;cursor:pointer;color:var(--ink,#0A0F0D);display:inline-flex;gap:6px;align-items:center}
.cq-party.on{border-color:var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F)}
.cq-party .c{font-variant-numeric:tabular-nums;color:var(--n-600,#3a4440)}
.cq-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;min-width:0}
.cq-tools .cq-btn{flex:0 1 auto;min-width:0}
.cq-search{flex:1 1 220px;display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border-radius:12px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:var(--surface,#FDFCF9);color:var(--n-500,#667)}
.cq-search input{flex:1;border:0;background:transparent;font:inherit;color:var(--ink,#0A0F0D);outline:none;min-width:0}
.cq-pills{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06));overflow-x:auto;max-width:100%}
.cq-pills button{border:0;background:transparent;font:inherit;font-size:13px;padding:6px 12px;border-radius:9px;color:var(--n-600,#3a4440);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.cq-pills button.on{color:var(--ink,#0A0F0D);font-weight:500}
.cq-pills .n{font-size:11px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--n-200,rgba(10,15,13,.1));font-variant-numeric:tabular-nums}
.cq-pills:not([data-kw-lens]) button.on,.cq-seg:not([data-kw-lens]) button.on{background:var(--surface,#FDFCF9);box-shadow:0 1px 2px rgba(10,15,13,.08)}
.cq-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;color:var(--n-600,#3a4440);min-width:0}
.cq-filters label{display:inline-flex;gap:6px;align-items:center;min-width:0}
.cq-filters select,.cq-filters input{font:inherit;font-size:13px;padding:7px 10px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D);max-width:220px}
.cq-btn{display:inline-flex;align-items:center;gap:6px}
.cq-row{display:grid;grid-template-columns:86px minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:12px 4px;border-top:1px solid var(--n-100,rgba(10,15,13,.08));cursor:pointer}
.cq-row:first-child{border-top:0}
.cq-row:hover{background:var(--n-50,rgba(10,15,13,.03))}
.cq-due b{display:block;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cq-due small{display:block;font-size:11.5px;color:var(--n-500,#667)}
.cq-due small.late{color:var(--danger,#C94A3A)}.cq-due small.soon{color:var(--warn-ink,#8A6210)}
.cq-mid .n{font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cq-mid .m{font-size:12.5px;color:var(--n-500,#667);display:flex;gap:4px 10px;flex-wrap:wrap}
.cq-r{display:grid;justify-items:end;gap:4px}
.cq-r .amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.cq-kind{display:inline-flex;padding:0 7px;border-radius:6px;background:var(--n-100,rgba(10,15,13,.07));color:var(--n-600,#3a4440);font-size:11.5px}
.cq-kind.bad{background:color-mix(in srgb,var(--danger,#C94A3A) 10%,transparent);color:var(--danger,#C94A3A)}
.cq-note .cq-acts{margin-top:8px}
.cq-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:12px;white-space:nowrap}
.cq-chip.hand{background:var(--mint-soft,#C9F6DC);color:var(--riad,#053B2C)}
.cq-chip.bank{background:color-mix(in srgb,var(--atlas,#0B6E4F) 11%,transparent);color:var(--atlas,#0B6E4F)}
.cq-chip.ok{background:var(--n-100,rgba(10,15,13,.06));color:var(--atlas,#0B6E4F)}
.cq-chip.bad{background:color-mix(in srgb,var(--danger,#C94A3A) 10%,transparent);color:var(--danger,#C94A3A)}
.cq-chip.muted{background:var(--n-100,rgba(10,15,13,.06));color:var(--n-600,#3a4440)}
.cq-empty{text-align:center;padding:34px 12px;color:var(--n-600,#3a4440)}
.cq-empty .cq-i{width:36px;height:36px;color:var(--atlas,#0B6E4F);display:block;margin:0 auto 6px}
.cq-hint{font-size:12.5px;color:var(--n-500,#667);margin:0}
.cq-sheet{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
.cq-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cq-big{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums}
.cq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;font-size:13px}
.cq-grid .k{font-size:11.5px;color:var(--n-500,#667)}
.cq-grid .v{overflow-wrap:anywhere}
.cq-note{padding:10px 12px;border-radius:12px;font-size:13px}
.cq-note.bad{background:color-mix(in srgb,var(--danger,#C94A3A) 9%,transparent);color:var(--danger,#C94A3A)}
.cq-note.info{background:var(--n-100,rgba(10,15,13,.06));color:var(--n-600,#3a4440)}
.cq-acts{display:flex;flex-wrap:wrap;gap:8px}
.cq-tl{list-style:none;margin:0;padding:0;display:grid;gap:0}
.cq-tl li{display:grid;grid-template-columns:14px minmax(0,1fr);gap:10px;padding:8px 0;position:relative;font-size:13px}
.cq-tl li::before{content:'';width:9px;height:9px;border-radius:50%;background:var(--atlas,#0B6E4F);margin-top:4px}
.cq-tl li:not(:last-child)::after{content:'';position:absolute;inset-inline-start:4px;top:22px;bottom:-6px;width:1px;background:var(--n-200,rgba(10,15,13,.12))}
.cq-tl small{display:block;color:var(--n-500,#667);font-size:12px}
.cq-form{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
.cq-form input,.cq-form select{width:100%;box-sizing:border-box}
.cq-form label{display:grid;gap:6px;font-size:12.5px;color:var(--n-600,#3a4440)}
.cq-form input,.cq-form textarea,.cq-form select{font:inherit;font-size:14px;padding:10px 12px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.14));background:var(--surface,#FDFCF9);color:var(--ink,#0A0F0D);min-width:0}
.cq-form .two{display:grid;gap:12px;grid-template-columns:1fr 1fr}
.cq-form input.cq-amt{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}
.cq-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06))}
.cq-seg button{border:0;background:transparent;color:var(--n-600,#3a4440);font:inherit;font-size:13px;padding:7px 12px;border-radius:9px;cursor:pointer}
.cq-seg button.on{color:var(--ink,#0A0F0D);font-weight:500}
.cq-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.cq-pick{display:grid;max-height:46vh;overflow:auto;border:1px solid var(--n-100,rgba(10,15,13,.08));border-radius:12px}
.cq-pick label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--n-100,rgba(10,15,13,.07));font-size:13px;color:var(--ink,#0A0F0D)}
.cq-pick label:first-child{border-top:0}
.cq-pick small{display:block;color:var(--n-500,#667);font-size:12px}
.cq-pick .amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.cq-total{display:flex;justify-content:space-between;gap:10px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.cq-link{border:0;background:transparent;color:var(--atlas,#0B6E4F);cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:6px;padding:0}
@media(max-width:640px){.cq-search{flex-basis:100%}.cq-tools .cq-btn{flex:1 1 auto;justify-content:center}.cq-filters select{max-width:100%;flex:1 1 100%}.cq-age{gap:14px}.cq-row{grid-template-columns:64px minmax(0,1fr);}.cq-r{grid-column:2;justify-items:start;grid-auto-flow:column;justify-content:start;align-items:center;gap:8px}.cq-grid{grid-template-columns:1fr}.cq-form .two{grid-template-columns:1fr}.cq-big{font-size:24px}.cq-months{height:100px}}
`;
    document.head.appendChild(style);
  }

  /* ── Démo : des chèques d'exemple, en mémoire seulement ────────────── */
  const DEMO = (() => {
    let rows = null;
    const T = () => localYmd(new Date());
    function seed() {
      if (rows) return rows;
      const t = T();
      let i = 0;
      const c = (o) => ({ id: 'demo-chq-' + (++i), kind: 'cheque', direction: 'received', status: 'received', bank: '', drawerBank: '', depositDate: '', settleDate: '', depositSlip: '', partyType: 'customer', partyId: '', note: '', source: 'till', debtOpen: false, createdBy: 'Caisse · Salma', history: [], ...o });
      rows = [
        c({ amountCents: 125000, number: '0040012', drawerName: 'Hajar Bennani', partyName: 'Hajar Bennani', partyId: 'n:hajar-bennani', drawerBank: 'CIH Bank', receptionDate: addDays(t, -40), dueDate: addDays(t, -6) }),
        c({ amountCents: 350000, number: '5512094', drawerName: 'Société Atlas Textile', partyName: 'Société Atlas Textile', partyId: 'n:societe-atlas-textile', drawerBank: 'Attijariwafa bank', receptionDate: addDays(t, -70), dueDate: addDays(t, -34), source: 'dashboard', createdBy: 'Propriétaire' }),
        c({ amountCents: 87550, number: '7788113', drawerName: 'Youssef Alami', partyName: 'Youssef Alami', partyId: 'n:youssef-alami', drawerBank: 'Banque Populaire', receptionDate: addDays(t, -3), dueDate: addDays(t, 2), saleVoided: true }),
        c({ amountCents: 240000, kind: 'lcn', number: 'LCN 0091827', drawerName: 'Riad Zitoun SARL', partyName: 'Riad Zitoun SARL', partyId: 'n:riad-zitoun-sarl', drawerBank: 'Bank of Africa (BMCE)', receptionDate: addDays(t, -20), dueDate: addDays(t, 25), source: 'dashboard', createdBy: 'Propriétaire' }),
        c({ amountCents: 162000, number: '3301557', drawerName: 'Nadia Chraibi', partyName: 'Nadia Chraibi', partyId: 'n:nadia-chraibi', drawerBank: 'Société Générale Maroc', receptionDate: addDays(t, -2), dueDate: addDays(t, 48) }),
        c({ amountCents: 98000, number: '0040013', drawerName: 'Hajar Bennani', partyName: 'Hajar Bennani', partyId: 'n:hajar-bennani', drawerBank: 'CIH Bank', receptionDate: addDays(t, -40), dueDate: addDays(t, 82) }),
        c({ amountCents: 455000, number: '1180442', drawerName: 'Karim Tazi', partyName: 'Karim Tazi', partyId: 'n:karim-tazi', drawerBank: 'Crédit du Maroc', receptionDate: addDays(t, -9), dueDate: addDays(t, -1), status: 'deposited', depositDate: addDays(t, -1), bank: 'Attijariwafa bank', depositSlip: 'BR-DEMO-0001' }),
        c({ amountCents: 73000, number: '2209871', drawerName: 'Salma Idrissi', partyName: 'Salma Idrissi', partyId: 'n:salma-idrissi', drawerBank: 'BMCI', receptionDate: addDays(t, -30), dueDate: addDays(t, -21), status: 'rejected', depositDate: addDays(t, -18), settleDate: addDays(t, -12), debtOpen: true, bank: 'Attijariwafa bank', partyId: 'demo-salma', clientId: 'demo-salma', debt: { onAccount: true, totalCents: 73000, paidCents: 20000, remainingCents: 53000 } }),
        c({ amountCents: 199000, number: '4471020', drawerName: 'Omar Fassi', partyName: 'Omar Fassi', partyId: 'n:omar-fassi', drawerBank: 'Al Barid Bank', receptionDate: addDays(t, -95), dueDate: addDays(t, -80), status: 'in_litigation', depositDate: addDays(t, -78), settleDate: addDays(t, -60), debtOpen: true }),
        c({ amountCents: 61000, number: '0910034', drawerName: 'Imane Berrada', partyName: 'Imane Berrada', partyId: 'n:imane-berrada', drawerBank: 'CIH Bank', receptionDate: addDays(t, -26), dueDate: addDays(t, -16), status: 'collected', depositDate: addDays(t, -15), settleDate: addDays(t, -13), bank: 'Attijariwafa bank' }),
        c({ amountCents: 120000, kind: 'lcn', direction: 'issued', status: 'issued', number: 'LCN 556201', partyType: 'supplier', partyId: 'sup_fassi', partyName: 'Atelier Fassi Couture', drawerName: '', bank: 'Attijariwafa bank', receptionDate: addDays(t, -14), dueDate: addDays(t, 16), source: 'dashboard', createdBy: 'Propriétaire' }),
      ];
      rows.forEach((r) => { r.history = [{ action: 'create', from: '', to: r.direction === 'issued' ? 'issued' : 'received', date: r.receptionDate, actor: r.createdBy, reason: '' }]; if (r.depositDate) r.history.push({ action: 'move', from: 'received', to: 'deposited', date: r.depositDate, actor: 'Propriétaire', reason: '' }); if (r.settleDate) r.history.push({ action: 'move', from: 'deposited', to: r.status === 'collected' ? 'collected' : 'rejected', date: r.settleDate, actor: 'Propriétaire', reason: r.status === 'collected' ? '' : L('Provision insuffisante', 'Insufficient funds', 'ما كاينش الرصيد') }); if (r.status === 'in_litigation') r.history.push({ action: 'move', from: 'rejected', to: 'in_litigation', date: addDays(t, -40), actor: 'Propriétaire', reason: '' }); });
      return rows;
    }
    const allowed = (c) => ((DEMO_TRANSITIONS[c.direction] || {})[c.status] || []).slice();
    const view = (c) => ({ ...c, allowed: allowed(c) });
    return {
      list() {
        const all = seed().map(view);
        return { ok: true, demo: true, migrated: true, today: T(), cheques: all, ...derive(all, T()), suppliers: [{ id: 'sup_fassi', name: 'Atelier Fassi Couture' }, { id: 'sup_babouche', name: 'Maâlem Babouches Fès' }] };
      },
      detail(id) { const c = seed().find((x) => x.id === id); return c ? { ok: true, cheque: view(c), history: c.history.slice(), sales: [], ledger: [], client: c.clientId ? { id: c.clientId, name: c.partyName, phone: '' } : null } : null; },
      move(id, to, date, reason, method) {
        const c = seed().find((x) => x.id === id);
        if (!c || !allowed(c).includes(to)) { const e = new Error('illegal-transition'); e.code = 'illegal-transition'; throw e; }
        if (to === 'cancelled' && c.direction === 'received' && c.debtOpen) { const e = new Error('debt-open'); e.code = 'debt-open'; throw e; }
        c.history.push({ action: 'move', from: c.status, to, date, actor: L('Vous', 'You', 'نتا'), reason: reason || (to === 'replaced' ? methodLabel(method) : '') });
        if (to === 'rejected') { c.debtOpen = true; if (c.clientId) c.debt = { onAccount: true, totalCents: c.amountCents, paidCents: 0, remainingCents: c.amountCents }; }
        if (['collected', 'debited', 'replaced'].includes(to)) { c.debtOpen = false; c.debt = null; }
        if (to === 'deposited') c.depositDate = date;
        if (to === 'received') { c.depositDate = ''; c.depositSlip = ''; }
        if (['collected', 'debited', 'replaced', 'rejected', 'in_litigation', 'cancelled'].includes(to)) c.settleDate = date;
        c.status = to;
      },
      deposit(ids, bank, date) {
        const slipNo = 'BR-' + date.replace(/-/g, '') + '-DEMO' + String(Math.floor(Math.random() * 90) + 10);
        seed().filter((c) => ids.includes(c.id) && c.status === 'received').forEach((c) => { this.move(c.id, 'deposited', date, ''); c.depositSlip = slipNo; c.bank = bank || c.bank; });
        return { ok: true, slip: slipNo, date, bank, cheques: seed().filter((c) => c.depositSlip === slipNo).map(view) };
      },
      bySlip(no) { return seed().filter((c) => c.depositSlip === no).map(view); },
      create(o) { const t = T(); const row = { id: 'demo-chq-' + idem(), status: o.direction === 'issued' ? 'issued' : 'received', depositDate: '', settleDate: '', depositSlip: '', debtOpen: false, source: 'dashboard', createdBy: L('Vous', 'You', 'نتا'), history: [], ...o }; row.history.push({ action: 'create', from: '', to: row.status, date: row.receptionDate || t, actor: row.createdBy, reason: '' }); seed().push(row); return view(row); },
      edit(id, patch) { const c = seed().find((x) => x.id === id); if (c) { Object.assign(c, patch); c.history.push({ action: 'edit', from: c.status, to: c.status, date: T(), actor: L('Vous', 'You', 'نتا'), reason: '' }); } },
    };
  })();

  /* Cartes et ancienneté, pour la démo (le serveur les calcule en vrai, mêmes règles). */
  function derive(all, today) {
    const card = () => ({ count: 0, cents: 0 });
    const summary = { inHand: card(), deposited: card(), rejected: card(), litigation: card(), issued: card(), debtOpen: card(), thisWeek: { count: 0, cents: 0, lateCount: 0, lateCents: 0 }, byParty: [] };
    const overdue = ['1-30', '31-60', '61-90', '90+'].map((key) => ({ key, count: 0, cents: 0 }));
    const base = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
    const upcoming = Array.from({ length: 6 }, (_, i) => ({ month: `${Math.floor((base + i) / 12)}-${pad(((base + i) % 12) + 1)}`, count: 0, cents: 0 }));
    const parties = new Map();
    let overdueCents = 0, overdueCount = 0;
    const weekEnd = addDays(today, 6);
    all.forEach((c) => {
      const add = (k) => { summary[k].count++; summary[k].cents += c.amountCents; };
      if (c.debtOpen && !['collected', 'replaced', 'debited'].includes(c.status)) add('debtOpen');
      if (c.direction === 'issued') { if (c.status === 'issued') add('issued'); return; }
      const due = c.dueDate || c.receptionDate;
      if (c.status === 'received') {
        add('inHand');
        if (due <= weekEnd) { summary.thisWeek.count++; summary.thisWeek.cents += c.amountCents; if (due < today) { summary.thisWeek.lateCount++; summary.thisWeek.lateCents += c.amountCents; } }
        if (due < today) { const d = dayDiff(today, due); const i = d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3; overdue[i].count++; overdue[i].cents += c.amountCents; overdueCents += c.amountCents; overdueCount++; }
        else { const i = Math.min(Number(due.slice(0, 4)) * 12 + Number(due.slice(5, 7)) - 1 - base, 5); upcoming[i].count++; upcoming[i].cents += c.amountCents; }
        const key = c.partyType + '|' + c.partyId;
        if (!parties.has(key)) parties.set(key, { key, partyType: c.partyType, partyId: c.partyId, name: c.partyName || c.drawerName, count: 0, cents: 0, nextDue: '' });
        const p = parties.get(key); p.count++; p.cents += c.amountCents; if (!p.nextDue || due < p.nextDue) p.nextDue = due;
      } else if (c.status === 'deposited') add('deposited'); else if (c.status === 'rejected') add('rejected'); else if (c.status === 'in_litigation') add('litigation');
    });
    summary.byParty = [...parties.values()].sort((a, b) => b.cents - a.cents);
    return { summary, ageing: { today, overdue, upcoming, overdueCents, overdueCount } };
  }

  /* ── Serveur ───────────────────────────────────────────────────────── */
  async function api(path, body) {
    const init = body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: slug(), ...body }) }
      : { credentials: 'same-origin' };
    const url = body ? path : path + (path.includes('?') ? '&' : '?') + 'merchant=' + encodeURIComponent(slug());
    const r = await fetch(url, init);
    let j = null; try { j = await r.json(); } catch (_) { j = null; }
    if (!r.ok || !j || j.error) { const e = new Error((j && j.error) || 'http-' + r.status); e.code = (j && j.error) || 'http-' + r.status; e.allowed = j && j.allowed; throw e; }
    return j;
  }
  function tr(code) {
    return ({
      'manager-required': L('Réservé au propriétaire et au gérant.', 'Owner and manager only.', 'خاص بمول المحل والمسيّر.'),
      'owner-required': L('Les chèques émis sont réservés au propriétaire.', 'Issued cheques are for the owner only.', 'الشيكات اللي عطينا خاصة بمول المحل.'),
      'illegal-transition': L("Ce passage n'est pas permis depuis le statut actuel. La fiche a été rafraîchie.", 'This move is not allowed from the current status. The card was refreshed.', 'هاد الخطوة ما مسموحاش من الحالة اللي فيها. تحدّثات البطاقة.'),
      stale: L("Quelqu'un vient de faire avancer ce chèque sur un autre appareil. La fiche a été rafraîchie.", 'Someone just moved this cheque on another device. The card was refreshed.', 'شي حد بدّل هاد الشيك من جهاز آخر دابا. تحدّثات البطاقة.'),
      'debt-open': L('Ce chèque a été rejeté et sa dette est ouverte : réglez-la (réglé autrement) au lieu de l\'annuler.', 'This cheque bounced and its debt is open: settle it (paid another way) instead of cancelling.', 'هاد الشيك رجع والدين ديالو باقي: خلّصو بطريقة أخرى عوض ما تلغيه.'),
      'amount-locked': L('Le montant ne change plus : de l\'argent a déjà été écrit pour ce chèque.', 'The amount is locked: money was already recorded for this cheque.', 'المبلغ ما بقاش كيتبدّل: تسجّلات فلوس على هاد الشيك.'),
      'party-locked': L('Le client de ce chèque porte déjà sa dette : il ne change plus.', 'This cheque\'s customer already carries its debt: it cannot change.', 'الكليان ديال هاد الشيك عليه الدين ديالو: ما بقاش كيتبدّل.'),
      'read-only': L('Ce chèque est terminé : il ne se modifie plus.', 'This cheque is closed: it can no longer be edited.', 'هاد الشيك سالا: ما بقاش كيتبدّل.'),
      'bad-amount': L('Montant invalide.', 'Invalid amount.', 'المبلغ غير صحيح.'),
      'bad-date': L('Date invalide (pas dans le futur).', 'Invalid date (not in the future).', 'التاريخ غير صحيح (ماشي فالمستقبل).'),
      'bad-due-date': L("Date d'échéance invalide.", 'Invalid due date.', 'تاريخ الاستحقاق غير صحيح.'),
      'date-before-reception': L('Cette date est avant la réception du chèque.', 'This date is before the cheque was received.', 'هاد التاريخ قبل ما يوصلك الشيك.'),
      'date-before-deposit': L('Cette date est avant la remise à la banque.', 'This date is before the deposit.', 'هاد التاريخ قبل ما يتدفع للبنكة.'),
      'supplier-not-found': L('Choisissez une fiche fournisseur.', 'Pick a supplier card.', 'ختار بطاقة المورد.'),
      'supplier-required': L('Choisissez une fiche fournisseur.', 'Pick a supplier card.', 'ختار بطاقة المورد.'),
      'supplier-owner-only': L('Rattacher un chèque à un fournisseur est réservé au propriétaire.', 'Linking a cheque to a supplier is for the owner only.', 'ربط الشيك بمورد خاص بمول المحل.'),
      'balance-open': L('La cliente n\'a pas tout réglé à la caisse : choisissez comment le reste a été payé.', 'The customer has not paid everything at the till: pick how the rest was paid.', 'الكليانة ما خلّصاتش كلشي فالكاسة: ختار كيفاش تخلّص الباقي.'),
      'client-not-found': L('Cette fiche cliente n\'existe plus. Choisissez-en une autre.', 'This customer card no longer exists. Pick another.', 'هاد البطاقة ديال الكليان ما بقاتش. ختار وحدة أخرى.'),
      'supplier-archived': L('Ce fournisseur est archivé.', 'This supplier is archived.', 'هاد المورد مؤرشف.'),
      'idempotency-conflict': L('Ce geste a déjà servi à autre chose. Rouvrez la fiche.', 'This action was already used for something else. Reopen the card.', 'هاد العملية تستعملات قبل. عاود حلّ البطاقة.'),
      unmigrated: L('Mise à jour en cours : le portefeuille de chèques arrive sur ce compte.', 'Update in progress: the cheque portfolio is coming to this account.', 'التحديث جاري: محفظة الشيكات غادي توصل لهاد الحساب قريب.'),
    }[code]) || L('Impossible pour le moment. Réessayez.', 'Not possible right now. Try again.', 'ما تقدرش دابا. عاود من بعد.');
  }

  const S = { data: null, filter: 'hand', party: '', from: '', to: '', q: '', loading: false };
  const FILTERS = () => [
    ['hand', L('En main', 'In hand', 'فاليد'), ['received']],
    ['bank', L('À la banque', 'At the bank', 'فالبنكة'), ['deposited']],
    ['bad', L('Impayés', 'Bounced', 'رجعو'), ['rejected', 'in_litigation']],
    ['done', L('Terminés', 'Closed', 'سالاو'), ['collected', 'replaced', 'cancelled', 'debited']],
    ...(isOwner() ? [['issued', L('Émis', 'Issued', 'اللي عطينا'), null]] : []),
    ['all', L('Tous', 'All', 'الكل'), null],
  ];
  function filtered() {
    const d = S.data;
    if (!d || !d.cheques) return [];
    const f = FILTERS().find((x) => x[0] === S.filter) || FILTERS()[0];
    const q = S.q.trim().toLowerCase();
    return d.cheques.filter((c) => {
      if (S.filter === 'issued') { if (c.direction !== 'issued') return false; }
      else if (f[2]) { if (c.direction !== 'received' && S.filter !== 'done') return false; if (!f[2].includes(c.status)) return false; }
      if (S.party && (c.partyType + '|' + c.partyId) !== S.party) return false;
      const when = c.dueDate || c.depositDate || c.receptionDate;
      if (S.from && when < S.from) return false;
      if (S.to && when > S.to) return false;
      if (q && ![c.number, c.drawerName, c.partyName, c.bank, c.drawerBank].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const countFor = (key) => { const d = S.data; if (!d || !d.cheques) return 0; const f = FILTERS().find((x) => x[0] === key); if (!f) return 0; return d.cheques.filter((c) => (key === 'issued' ? c.direction === 'issued' : f[2] ? (key === 'done' || c.direction === 'received') && f[2].includes(c.status) : true)).length; };

  /* ── Liste ─────────────────────────────────────────────────────────── */
  function dueHint(c) {
    if (!['received', 'issued'].includes(c.status)) return c.status === 'deposited' && c.depositDate ? `<small>${esc(L('remis le', 'deposited', 'تدفع'))} ${esc(shortDate(c.depositDate))}</small>` : '';
    const due = c.dueDate || c.receptionDate, d = dayDiff(due, todayYmd());
    if (d < 0) return `<small class="late">${esc(L('en retard de', 'late by', 'متأخر ب'))} ${esc(daysTxt(-d))}</small>`;
    if (d === 0) return `<small class="soon">${esc(L("aujourd'hui", 'today', 'اليوم'))}</small>`;
    return `<small class="${d <= 6 ? 'soon' : ''}">${esc(L('dans', 'in', 'بعد'))} ${esc(daysTxt(d))}</small>`;
  }
  function rowHtml(c) {
    const due = c.dueDate || c.depositDate || c.receptionDate;
    const meta = [`<span class="cq-kind">${esc(kindLabel(c.kind))}</span>`, c.saleVoided && c.status === 'received' ? `<span class="cq-kind bad">${esc(L('ticket annulé', 'ticket voided', 'التيكي تلغى'))}</span>` : '', c.number ? `<span dir="ltr">${esc(L('N°', 'No.', 'رقم'))} ${esc(c.number)}</span>` : '', c.drawerBank || c.bank ? `<span>${esc(c.drawerBank || c.bank)}</span>` : '',
      c.direction === 'issued' ? `<span>${esc(L('émis à', 'issued to', 'عطيناه ل'))} ${esc(c.partyName)}</span>` : (c.partyName && c.drawerName && c.partyName !== c.drawerName ? `<span>${esc(L('tireur', 'drawer', 'الساحب'))} ${esc(c.drawerName)}</span>` : '')].filter(Boolean).join('');
    return `<div class="cq-row" data-action="chq-open" data-arg="${esc(c.id)}" role="button" tabindex="0">
      <div class="cq-due"><b>${esc(shortDate(due))}</b>${dueHint(c)}</div>
      <div class="cq-mid"><div class="n">${esc(who(c))}</div><div class="m">${meta}</div></div>
      <div class="cq-r"><div class="amt">${esc(mad(c.amountCents))}</div>${chip(c)}</div></div>`;
  }

  function kpisHtml(s) {
    const k = (key, label, v, sub, cls, filter) => `<button type="button" class="cq-kpi" data-action="${key === 'week' ? 'chq-slip' : 'chq-filter'}" data-arg="${key === 'week' ? 'week' : filter}"><span class="k">${esc(label)}</span><span class="v ${cls || ''}">${esc(mad(v.cents))}</span><span class="s ${sub && sub.cls ? sub.cls : ''}">${esc(sub ? sub.t : countTxt(v.count))}</span></button>`;
    const w = s.thisWeek;
    const weekSub = w.lateCount ? { t: countTxt(w.count) + ' · ' + L(`dont ${w.lateCount} en retard`, `${w.lateCount} late`, `منهم ${w.lateCount} متأخرين`), cls: 'late' } : { t: countTxt(w.count) };
    const bad = { count: s.rejected.count + s.litigation.count, cents: s.rejected.cents + s.litigation.cents };
    const badSub = s.debtOpen.cents ? { t: L(`${mad(s.debtOpen.cents)} à récupérer`, `${mad(s.debtOpen.cents)} to recover`, `${mad(s.debtOpen.cents)} خاصها ترجع`), cls: 'late' } : null;
    return `<div class="cq-kpis">
      ${k('hand', L('En portefeuille', 'In hand', 'فاليد'), s.inHand, null, '', 'hand')}
      ${k('week', L('À remettre cette semaine', 'To deposit this week', 'خاصهم يتدفعو هاد السيمانة'), w, weekSub, w.lateCount ? 'bad' : '', 'hand')}
      ${k('bank', L('Remis à la banque', 'At the bank', 'فالبنكة'), s.deposited, null, '', 'bank')}
      ${k('bad', L('Impayés et contentieux', 'Bounced and disputed', 'اللي رجعو والنزاع'), bad, badSub, bad.cents ? 'bad' : 'ok', 'bad')}
      ${isOwner() ? k('issued', L('Émis, pas encore débités', 'Issued, not yet debited', 'عطيناهم، مازال ما تقطعو'), s.issued, null, '', 'issued') : ''}
    </div>`;
  }

  function ageHtml(a) {
    const labels = [L('1 à 30 j', '1 to 30 d', '1 إلى 30 يوم'), L('31 à 60 j', '31 to 60 d', '31 إلى 60 يوم'), L('61 à 90 j', '61 to 90 d', '61 إلى 90 يوم'), L('plus de 90 j', 'over 90 d', 'أكثر من 90 يوم')];
    const total = a.overdueCents || 0;
    const bar = total ? a.overdue.map((b, i) => b.cents ? `<i class="cq-a${i}" style="width:${(b.cents / total) * 100}%"></i>` : '').join('') : '';
    const max = Math.max(1, ...a.upcoming.map((m) => m.cents));
    return `<div class="cq-card cq-age">
      <div><h3 class="cq-h3"><span>${esc(L('En main, échéance passée', 'In hand, past due', 'فاليد، فات الأجل ديالهم'))}</span><small>${esc(total ? mad(total) + ' · ' + countTxt(a.overdueCount) : L('aucun', 'none', 'والو'))}</small></h3>
        <div class="cq-bar4" role="img" aria-label="${esc(L('Retard des chèques en main', 'Lateness of cheques in hand', 'تأخير الشيكات اللي فاليد'))}">${bar}</div>
        <div class="cq-legend">${a.overdue.map((b, i) => `<span><b class="cq-a${i}"></b>${esc(labels[i])}<em>${esc(mad(b.cents))}${b.count ? ' · ' + esc(String(b.count)) : ''}</em></span>`).join('')}</div>
        <p class="cq-hint" style="margin-top:10px">${esc(total ? L('À remettre à la banque sans attendre : un chèque se présente jusqu\'à un an après sa date.', 'Deposit them without waiting: a cheque can be presented up to a year after its date.', 'دفعهم للبنكة دابا: الشيك كيتقدّم حتى لعام من التاريخ ديالو.') : L('Aucun chèque en main n\'a dépassé son échéance.', 'No cheque in hand is past its due date.', 'حتى شيك فاليد ما فاتو الأجل.'))}</p></div>
      <div><h3 class="cq-h3"><span>${esc(L('À venir, par mois', 'Coming up, by month', 'الجايين، شهر بشهر'))}</span><small>${esc(L('six mois', 'six months', 'ستة شهور'))}</small></h3>
        <div class="cq-months">${a.upcoming.map((m, i) => `<div class="cq-month" title="${esc(countTxt(m.count))}"><span class="amt">${m.cents ? esc(num(m.cents / 100).replace(/[.,]00$/, '')) : '·'}</span><span class="col${m.cents ? '' : ' zero'}" style="height:${m.cents ? Math.max(6, Math.round((m.cents / max) * 100)) : 2}%"></span><span>${esc(i === a.upcoming.length - 1 ? L(`${monthName(m.month)} et après`, `${monthName(m.month)} and later`, `${monthName(m.month)} وما بعد`) : monthName(m.month))}</span></div>`).join('')}</div></div>
    </div>`;
  }

  function partiesHtml(list) {
    if (!list || !list.length) return '';
    return `<div><h3 class="cq-h3"><span>${esc(L('Clients avec des chèques en main', 'Customers with cheques in hand', 'الكليان اللي عندك ليهم شيكات فاليد'))}</span></h3>
      <div class="cq-parties">${list.slice(0, 12).map((p) => `<button type="button" class="cq-party${S.party === p.partyType + '|' + p.partyId ? ' on' : ''}" data-action="chq-party" data-arg="${esc(p.partyType + '|' + p.partyId)}">${esc(p.name || L('Sans nom', 'No name', 'بلا اسم'))} <span class="c">${esc(countTxt(p.count))} · ${esc(mad(p.cents))}</span></button>`).join('')}</div></div>`;
  }

  function toolsHtml() {
    const d = S.data || {};
    const parties = new Map();
    (d.cheques || []).forEach((c) => { if (c.partyId) parties.set(c.partyType + '|' + c.partyId, who(c)); });
    const pill = ([k, label]) => { const n = countFor(k); return `<button type="button" class="${S.filter === k ? 'on' : ''}" data-lens-item data-action="chq-filter" data-arg="${k}" aria-pressed="${S.filter === k}">${esc(label)}${n ? ` <span class="n">${esc(String(n))}</span>` : ''}</button>`; };
    return `<div class="cq-tools">
        <label class="cq-search">${icon('search')}<input type="search" data-cq-q value="${esc(S.q)}" placeholder="${esc(L('N°, tireur, client, banque', 'Number, drawer, customer, bank', 'الرقم، الساحب، الكليان، البنكة'))}" aria-label="${esc(L('Chercher', 'Search', 'قلّب'))}"></label>
        <button type="button" class="kb ghost cq-btn" data-action="chq-slip">${icon('account_balance')}${esc(L('Bordereau de remise', 'Deposit slip', 'ورقة الدفع للبنكة'))}</button>
        <button type="button" class="kb ghost cq-btn" data-action="chq-csv">${icon('download')}${esc(L('CSV', 'CSV', 'CSV'))}</button>
        <button type="button" class="kb atlas cq-btn" data-action="chq-new">${icon('add')}${esc(L('Nouveau chèque', 'New cheque', 'شيك جديد'))}</button>
      </div>
      <div class="cq-pills" data-lens-demo role="group" aria-label="${esc(L('Statut', 'Status', 'الحالة'))}">${FILTERS().map(pill).join('')}</div>
      <div class="cq-filters" data-cq-filters>
        <select data-cq-party aria-label="${esc(L('Client', 'Customer', 'الكليان'))}"><option value="">${esc(L('Tous les clients', 'All customers', 'جميع الكليان'))}</option>${[...parties].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${esc(k)}"${S.party === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <label>${esc(L('du', 'from', 'من'))} <input type="date" data-cq-from value="${esc(S.from)}"></label>
        <label>${esc(L('au', 'to', 'إلى'))} <input type="date" data-cq-to value="${esc(S.to)}"></label>
        ${S.party || S.from || S.to || S.q ? `<button type="button" class="cq-link" data-action="chq-filter" data-arg="clear">${esc(L('Effacer les filtres', 'Clear filters', 'مسح الفلاتر'))}</button>` : ''}
      </div>`;
  }

  function listHtml() {
    const rows = filtered();
    if (rows.length) return `<div class="cq-card" data-cq-list>${rows.map(rowHtml).join('')}</div>`;
    const none = !(S.data && S.data.cheques && S.data.cheques.length);
    return `<div class="cq-card cq-empty" data-cq-list>${icon('receipt_long')}<p>${esc(none
      ? L('Aucun chèque pour le moment. Ceux pris à la caisse arrivent ici tout seuls, avec leur échéance ; ajoutez les autres avec « Nouveau chèque ».', 'No cheques yet. Those taken at the till land here with their due date; add others with "New cheque".', 'حتى شيك دابا. اللي كتاخد فالكاسة كيوصلو هنا بوحدهم مع الأجل ديالهم؛ زيد الآخرين ب«شيك جديد».')
      : L('Aucun chèque ne correspond à ces filtres.', 'No cheque matches these filters.', 'حتى شيك ما كيطابق هاد الفلاتر.'))}</p></div>`;
  }

  function bodyHtml() {
    if (!canOpen()) return `<div class="cq-card cq-empty">${icon('lock')}<p><b style="font-weight:600">${esc(L('Chèques et effets : réservé au propriétaire et au gérant', 'Cheques: owner and manager only', 'الشيكات: خاص بمول المحل والمسيّر'))}</b></p><p class="cq-hint">${esc(L('À la caisse, un chèque s\'enregistre au moment de l\'encaissement.', 'At the till, a cheque is recorded when it is taken.', 'فالكاسة، الشيك كيتسجّل ملي كتخلّص بيه.'))}</p></div>`;
    const d = S.data;
    if (!d) return `<div class="cq-card cq-empty">${esc(L('Chargement des chèques…', 'Loading cheques…', 'كنجيبو الشيكات…'))}</div>`;
    if (d.migrated === false) return `<div class="cq-card cq-empty">${icon('refresh')}<p><b style="font-weight:600">${esc(L('Mise à jour en cours', 'Update in progress', 'التحديث جاري'))}</b></p><p class="cq-hint">${esc(L('Le portefeuille de chèques arrive sur ce compte. Les ventes par chèque continuent de s\'enregistrer à la caisse comme avant.', 'The cheque portfolio is coming to this account. Cheque sales keep being recorded at the till as before.', 'محفظة الشيكات غادي توصل لهاد الحساب قريب. البيع بالشيك كيتسجّل فالكاسة بحال ديما.'))}</p></div>`;
    if (d.failed) return `<div class="cq-card cq-empty">${icon('warning')}<p>${esc(tr(d.failed))}</p><button type="button" class="kb ghost cq-btn" data-action="nav-cheques">${icon('refresh')}${esc(L('Réessayer', 'Try again', 'عاود'))}</button></div>`;
    return `<div class="cq-wrap">${kpisHtml(d.summary)}${ageHtml(d.ageing)}${partiesHtml(d.summary.byParty)}${toolsHtml()}${listHtml()}</div>`;
  }

  function paint() {
    css();
    let sub = L('Ce que vous avez en main, ce qui est à la banque, ce qui est revenu impayé', 'What you hold, what is at the bank, what came back unpaid', 'شنو عندك فاليد، شنو فالبنكة، وشنو رجع بلا رصيد');
    if (!isReal()) sub += ' · ' + L('démo', 'demo', 'تجريبي');
    const r = K.appPage('cheques', { title: L('Chèques et effets', 'Cheques and bills', 'الشيكات والكمبيالات'), subtitle: sub, body: bodyHtml() });
    const root = r && r.el;
    if (!root || !root.querySelector) return;
    const q = root.querySelector('[data-cq-q]');
    if (q) q.addEventListener('input', () => { S.q = q.value; refreshList(root); });
    const party = root.querySelector('[data-cq-party]');
    if (party) party.addEventListener('change', () => { S.party = party.value; paint(); });
    const fromInput = root.querySelector('[data-cq-from]'), toInput = root.querySelector('[data-cq-to]');
    if (fromInput) fromInput.addEventListener('change', () => { S.from = fromInput.value; paint(); });
    if (toInput) toInput.addEventListener('change', () => { S.to = toInput.value; paint(); });
  }
  function refreshList(root) {
    const host = (root || document).querySelector('[data-cq-list]');
    if (host) host.outerHTML = listHtml();
  }

  async function load() {
    if (!canOpen()) { S.data = null; return; }
    if (!isReal()) { S.data = DEMO.list(); return; }
    try { S.data = await api('/api/cheques'); }
    catch (e) { S.data = e.code === 'unmigrated' ? { migrated: false } : { failed: e.code || 'error' }; }
  }
  async function reload() { await load(); paint(); }

  /* ── Fiche d'un chèque ─────────────────────────────────────────────── */
  async function openDetail(id) {
    let d = null;
    try { d = isReal() ? await api('/api/cheques/detail?id=' + encodeURIComponent(id)) : DEMO.detail(id); }
    catch (e) { K.toast(tr(e.code), { type: 'warning' }); return; }
    if (!d) return;
    const c = d.cheque;
    const field = (k, v) => (v ? `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>` : '');
    const rec = c.direction === 'received';
    const histLabel = (h) => (h.action === 'create' ? (rec ? L('Reçu', 'Received', 'توصلنا بيه') : L('Émis', 'Issued', 'عطيناه')) : h.action === 'edit' ? L('Modifié', 'Edited', 'تبدّل') : (h.from === 'deposited' && h.to === 'received' ? L('Remise annulée', 'Deposit undone', 'رجع من البنكة') : statusLabel(h.to, c.direction)));
    const timeline = (d.history || []).map((h) => `<li><div><b style="font-weight:600">${esc(histLabel(h))}</b> · ${esc(dmy(h.date))}<small>${esc(actorLabel(h.actor))}${h.reason ? ' · ' + esc(h.reason) : ''}${h.detail && h.action === 'edit' ? ' · ' + esc(h.detail) : ''}${h.ledgerEntryId ? ' · ' + esc(L('écrit au grand livre', 'posted to the ledger', 'تسجّل فالدفتر')) : ''}</small></div></li>`).join('');
    const phone = (d.client && d.client.phone) || '';
    const wa = (txt) => `<a class="kb ghost cq-btn" href="${esc(waHref(phone, txt))}" target="_blank" rel="noopener">${esc(L('Brouillon WhatsApp', 'WhatsApp draft', 'مسودة واتساب'))}</a>`;
    const debtOn = c.debt && c.debt.onAccount;
    const debtTxt = !rec ? L(`Rejeté : vous devez de nouveau ${mad(c.amountCents)} à ${who(c)}.`, `Bounced: you owe ${who(c)} ${mad(c.amountCents)} again.`, `رجع: رجعات عليك ${mad(c.amountCents)} ل${who(c)}.`)
      : debtOn ? L(`Rejeté : ${who(c)} vous doit ${mad(c.debt.remainingCents)}. La dette est au compte de la cliente (carnet de crédit, fiche cliente) et se règle à la caisse, écran Acomptes.${c.debt.paidCents ? ` Déjà réglé : ${mad(c.debt.paidCents)}.` : ''}`,
        `Bounced: ${who(c)} owes you ${mad(c.debt.remainingCents)}. The debt is on the customer's account (credit book, customer card) and is paid at the till, Deposits screen.${c.debt.paidCents ? ` Already paid: ${mad(c.debt.paidCents)}.` : ''}`,
        `رجع: ${who(c)} عليه ليك ${mad(c.debt.remainingCents)}. الدين مسجّل فالحساب ديال الكليان (كناش الكريدي، البطاقة ديالو) وكيتخلّص فالكاسة، شاشة التسبيقات.${c.debt.paidCents ? ` تخلّص منو: ${mad(c.debt.paidCents)}.` : ''}`)
      : L(`Rejeté : ${who(c)} vous doit ${mad(c.amountCents)}. Ce chèque n'est rattaché à aucune fiche cliente : la dette est suivie ici seulement. Rattachez une fiche (Corriger) pour l'inscrire à son compte.`,
        `Bounced: ${who(c)} owes you ${mad(c.amountCents)}. This cheque is not linked to a customer card: the debt is tracked here only. Link a card (Edit) to put it on their account.`,
        `رجع: ${who(c)} عليه ليك ${mad(c.amountCents)}. هاد الشيك ما مربوط بحتى بطاقة كليان: الدين متبّع هنا غير. ربطو ببطاقة (صحّح) باش يتسجّل فالحساب ديالو.`);
    const debt = c.debtOpen && !['collected', 'replaced', 'debited'].includes(c.status)
      ? `<div class="cq-note bad">${esc(debtTxt)}${rec ? `<div class="cq-acts">${wa(waText(c))}</div>` : ''}</div>` : '';
    const overdue = rec && c.status === 'received' && (c.dueDate || c.receptionDate) < todayYmd();
    const voided = rec && c.saleVoided && c.status === 'received'
      ? `<div class="cq-note bad">${esc(L('Ticket annulé : la vente payée par ce chèque a été annulée. Si le chèque a été rendu, annulez-le aussi.', 'Ticket voided: the sale this cheque paid was voided. If the cheque was handed back, cancel it too.', 'التيكي تلغى: البيعة اللي خلّصها هاد الشيك تلغات. إلا رجّعتي الشيك، ألغيه حتى هو.'))}${(c.allowed || []).includes(TO.cancel) ? `<div class="cq-acts"><button type="button" class="kb ghost cq-btn" data-action="chq-move" data-arg="${esc(c.id + '|' + TO.cancel)}">${esc(actionLabel(c, TO.cancel))}</button></div>` : ''}</div>` : '';
    const remind = overdue && !voided ? `<div class="cq-note info">${esc(L('Échéance passée : à remettre à la banque. Un rappel à la cliente avant de le présenter ?', 'Past due: deposit it. Remind the customer before presenting it?', 'فات الأجل: خاصو يتدفع للبنكة. تفكّر الكليان قبل ما تقدّمو؟'))}<div class="cq-acts">${wa(waText(c))}</div></div>` : '';
    const acts = (c.allowed || []).map((to) => `<button type="button" class="kb ${['collected', 'debited', 'deposited'].includes(to) ? 'atlas' : 'ghost'} cq-btn" data-action="chq-move" data-arg="${esc(c.id + '|' + to)}">${esc(actionLabel(c, to))}</button>`).join('');
    const sales = (d.sales || []).map((s) => `<div>${esc(L('Ticket', 'Ticket', 'تيكي'))} ${esc(s.ref || s.id)} · ${esc(mad(s.amountCents))}</div>`).join('');
    const m = K.modal({
      tag: `${kindLabel(c.kind)}${c.number ? ' · ' + c.number : ''}`, title: who(c), width: 580,
      body: `<div class="cq-sheet">
        <div class="cq-top"><div><div class="cq-big">${esc(mad(c.amountCents))}</div>${chip(c)}</div>
          ${['received', 'issued'].includes(c.status) ? `<div class="cq-due" style="text-align:end"><b>${esc(L('Échéance', 'Due', 'الأجل'))} ${esc(shortDate(c.dueDate || c.receptionDate))}</b>${dueHint(c)}</div>` : ''}</div>
        ${debt}${voided}${remind}
        <div class="cq-grid">
          ${field(L('Numéro', 'Number', 'الرقم'), c.number ? `<span dir="ltr">${esc(c.number)}</span>` : '')}
          ${field(rec ? L('Client', 'Customer', 'الكليان') : L('Fournisseur', 'Supplier', 'المورد'), esc(c.partyName))}
          ${field(L('Tireur', 'Drawer', 'الساحب'), esc(c.drawerName))}
          ${field(L('Banque tirée', 'Drawee bank', 'البنكة المسحوب عليها'), esc(c.drawerBank))}
          ${field(rec ? L('Banque de remise', 'Deposit bank', 'البنكة اللي دفعنا فيها') : L('Notre banque', 'Our bank', 'البنكة ديالنا'), esc(c.bank))}
          ${field(rec ? L('Reçu le', 'Received on', 'توصلنا بيه') : L('Émis le', 'Issued on', 'عطيناه'), esc(dmy(c.receptionDate)))}
          ${field(L('Échéance', 'Due date', 'الأجل'), esc(dmy(c.dueDate)) || esc(L('à vue', 'at sight', 'عند الاطلاع')))}
          ${field(L('Remis le', 'Deposited on', 'تدفع'), esc(dmy(c.depositDate)))}
          ${field(L('Réglé ou rejeté le', 'Settled or bounced on', 'تخلّص ولا رجع'), esc(dmy(c.settleDate)))}
          ${field(L('Bordereau', 'Deposit slip', 'ورقة الدفع'), c.depositSlip ? `<button type="button" class="cq-link" data-action="chq-reprint" data-arg="${esc(c.depositSlip)}">${icon('print')}${esc(c.depositSlip)}</button>` : '')}
          ${field(L('Saisi par', 'Recorded by', 'سجّلو'), esc(actorLabel(c.createdBy)) + (c.source === 'till' ? ' · ' + esc(L('à la caisse', 'at the till', 'فالكاسة')) : ''))}
          ${field(L('Note', 'Note', 'ملاحظة'), esc(c.note))}
        </div>
        ${sales ? `<div><h3 class="cq-h3"><span>${esc(L('Ce qu\'il règle', 'What it pays', 'شنو كيخلّص'))}</span></h3>${sales}</div>` : ''}
        ${acts ? `<div><h3 class="cq-h3"><span>${esc(L('Et maintenant ?', 'What next?', 'ودابا؟'))}</span></h3><div class="cq-acts">${acts}</div></div>`
          : `<div class="cq-note info">${esc(L('Ce chèque est terminé : il reste ici pour l\'historique.', 'This cheque is closed: it stays here for the record.', 'هاد الشيك سالا: كيبقى هنا للتاريخ.'))}</div>`}
        <div><h3 class="cq-h3"><span>${esc(L('Historique', 'History', 'التاريخ'))}</span></h3><ul class="cq-tl">${timeline}</ul></div>
        <div class="cq-foot">${acts ? `<button type="button" class="kb ghost cq-btn" data-action="chq-edit" data-arg="${esc(c.id)}">${icon('edit')}${esc(L('Corriger', 'Edit', 'صحّح'))}</button>` : ''}<button type="button" class="kb ghost" data-dismiss>${esc(L('Fermer', 'Close', 'سدّ'))}</button></div>
      </div>`,
    });
    S.sheet = { id: c.id, cheque: { ...c, linkedSales: (d.sales || []).length }, close: m.close };
  }

  function segHtml(on, items, attr) {
    return `<div class="cq-seg" data-lens-demo ${attr}>${items.map(([k, label]) => `<button type="button" data-lens-item data-k="${esc(k)}" class="${k === on ? 'on' : ''}" aria-pressed="${k === on}">${esc(label)}</button>`).join('')}</div>`;
  }
  const methodItems = (tillOk) => (tillOk ? RECEIVED_METHODS : REPLACE_METHODS).map((k) => [k, methodLabel(k)]);
  const dirItems = () => [[DIRS[0], L('Reçu d\'un client', 'Received from a customer', 'توصلت بيه من كليان')], [DIRS[1], L('Émis à un fournisseur', 'Issued to a supplier', 'عطيتو لمورد')]];
  const paperItems = () => [[PAPERS[0], L('Chèque', 'Cheque', 'شيك')], [PAPERS[1], L('LCN (effet)', 'LCN (bill of exchange)', 'كمبيالة (LCN)')]];
  function wireSeg(root, sel, onPick) {
    const seg = root.querySelector(sel);
    if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      seg.querySelectorAll('[data-k]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      onPick(b.dataset.k);
    });
  }
  function readAmount(v) {
    const raw = String(v || '').replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return NaN;
    return Math.round(Number(raw) * 100);
  }

  /* Un passage : ce qu'il fera à l'argent, la date, un motif, puis le serveur. */
  const noteTone = (to) => (to === 'rejected' ? 'bad' : 'info');
  const confirmTone = (to) => (to === 'cancelled' || to === 'rejected' ? 'ghost' : 'atlas');
  function moveModal(c, to) {
    const requestId = idem();
    const tillOk = c.direction === DIRS[0] && c.debtOpen && c.debt && c.debt.onAccount && c.debt.remainingCents === 0;
    let method = (tillOk ? RECEIVED_METHODS : REPLACE_METHODS)[0];
    const m = K.modal({
      tag: `${who(c)} · ${mad(c.amountCents)}`, title: actionLabel(c, to), width: 460,
      body: `<form class="cq-form" data-cq-move novalidate>
        <div class="cq-note ${noteTone(to)}">${esc(impactText(c, to))}</div>
        ${to === 'replaced' ? `<div><div style="font-size:12.5px;color:var(--n-600,#3a4440);margin-bottom:6px">${esc(L('Payé comment ?', 'Paid how?', 'خلّص بأشمن طريقة؟'))}</div>${segHtml(method, methodItems(tillOk), SEG.methods)}</div>` : ''}
        <label>${esc(L('Date', 'Date', 'التاريخ'))}<input type="date" name="date" value="${esc(todayYmd())}" max="${esc(todayYmd())}" min="${esc(c.receptionDate)}"></label>
        <label>${esc(to === 'rejected' ? L('Motif du rejet', 'Reason it bounced', 'علاش رجع') : L('Note', 'Note', 'ملاحظة'))}<input name="reason" maxlength="200" placeholder="${esc(to === 'rejected' ? L('Provision insuffisante, signature…', 'Insufficient funds, signature…', 'ما كاينش الرصيد، التوقيع…') : '')}"></label>
        <div class="cq-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'رجوع'))}</button><button type="submit" class="kb ${confirmTone(to)}">${esc(L('Confirmer', 'Confirm', 'أكّد'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-cq-move]');
    wireSeg(form, '[data-cq-methods]', (k) => { method = k; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      const date = form.date.value || todayYmd(), reason = form.reason.value.trim();
      try {
        if (isReal()) await api('/api/cheques/move', { id: c.id, to, requestId, date, reason, method: to === 'replaced' ? method : undefined });
        else DEMO.move(c.id, to, date, reason, method);
        m.close();
        K.toast(statusLabel(to, c.direction) + ' · ' + mad(c.amountCents), { type: 'success' });
        await reload();
        openDetail(c.id);
      } catch (err) {
        btn.disabled = false;
        K.toast(tr(err && err.code), { type: 'warning' });
        if (err && (err.code === 'stale' || err.code === 'illegal-transition')) { m.close(); await reload(); openDetail(c.id); }
      }
    });
  }

  /* ── Nouveau chèque, correction ────────────────────────────────────── */
  function partyList() { return [...new Set(((S.data && S.data.cheques) || []).filter((c) => c.direction === 'received').map((c) => c.partyName).filter(Boolean))].sort(); }
  function newModal() {
    const idemKey = idem();
    let direction = DIRS[0], kind = PAPERS[0];
    const sups = (S.data && S.data.suppliers) || [];
    const m = K.modal({
      title: L('Nouveau chèque ou effet', 'New cheque or bill', 'شيك ولا كمبيالة جديدة'), width: 520,
      body: `<form class="cq-form" data-cq-new novalidate>
        ${isOwner() ? segHtml(DIRS[0], dirItems(), SEG.dir) : ''}
        ${segHtml(PAPERS[0], paperItems(), SEG.kind)}
        <label>${esc(L('Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'))}<input class="cq-amt" name="amount" inputmode="decimal" autocomplete="off" required></label>
        <div class="two"><label>${esc(L('Numéro', 'Number', 'الرقم'))}<input name="number" maxlength="40" autocomplete="off" dir="ltr"></label>
          <label>${esc(L('Échéance', 'Due date', 'الأجل'))}<input type="date" name="due"></label></div>
        <div data-cq-rec class="cq-form">
          <label>${esc(L('Fiche cliente', 'Customer card', 'بطاقة الكليان'))}${clientSelect('')}</label>
          <label data-cq-free>${esc(L('Client, nom libre', 'Customer, free name', 'الكليان، سمية حرة'))}<input name="party" maxlength="120" list="cq-parties" autocomplete="off"></label>
          <p class="cq-hint">${esc(L('Avec une fiche, un chèque qui revient impayé passe tout seul au compte de la cliente.', 'With a card, a cheque that bounces goes straight to the customer account.', 'مع البطاقة، الشيك اللي رجع بلا رصيد كيدوز بوحدو للحساب ديال الكليان.'))}</p>
          <div class="two"><label>${esc(L('Tireur, si ce n\'est pas le client', 'Drawer, if not the customer', 'الساحب، إلا ماشي الكليان'))}<input name="drawer" maxlength="120"></label>
            <label>${esc(L('Banque tirée', 'Drawee bank', 'البنكة المسحوب عليها'))}<input name="drawerBank" maxlength="80" list="cq-banks"></label></div>
        </div>
        <div data-cq-iss class="cq-form" hidden>
          <label>${esc(L('Fournisseur', 'Supplier', 'المورد'))}<select name="supplier"><option value="">${esc(L('Choisir une fiche', 'Pick a card', 'ختار بطاقة'))}</option>${sups.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
          <label>${esc(L('Notre banque', 'Our bank', 'البنكة ديالنا'))}<input name="bank" maxlength="80" list="cq-banks"></label>
          <p class="cq-hint">${esc(L('Un chèque émis est le paiement du fournisseur : il entre tout de suite dans son solde.', 'An issued cheque is the supplier payment: it enters their balance right away.', 'الشيك اللي عطيتي هو الأداء للمورد: كيدخل دغيا فالحساب ديالو.'))}</p>
        </div>
        <div class="two"><label>${esc(L('Reçu ou émis le', 'Received or issued on', 'تاريخ الاستلام ولا العطا'))}<input type="date" name="reception" value="${esc(todayYmd())}" max="${esc(todayYmd())}"></label>
          <label>${esc(L('Note', 'Note', 'ملاحظة'))}<input name="note" maxlength="200"></label></div>
        <datalist id="cq-parties">${partyList().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        <datalist id="cq-banks">${BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="cq-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'رجوع'))}</button><button type="submit" class="kb atlas">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-cq-new]');
    wireSeg(form, '[data-cq-dir]', (k) => { direction = k; form.querySelector('[data-cq-rec]').hidden = k !== 'received'; form.querySelector('[data-cq-iss]').hidden = k !== 'issued'; });
    wireSeg(form, '[data-cq-kind]', (k) => { kind = k; });
    const cards = clientCards();
    const freeSync = () => { form.querySelector('[data-cq-free]').hidden = !!form.client.value; };
    form.client.addEventListener('change', freeSync); freeSync();
    setTimeout(() => { try { form.amount.focus(); } catch (_) {} }, 60);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cents = readAmount(form.amount.value);
      if (!(cents > 0)) { K.toast(tr('bad-amount'), { type: 'warning' }); return; }
      const body = { idemKey, kind, direction, amountCents: cents, number: form.number.value.trim(), dueDate: form.due.value || '', receptionDate: form.reception.value || '', note: form.note.value.trim() };
      if (direction === 'issued') {
        if (!form.supplier.value) { K.toast(tr('supplier-required'), { type: 'warning' }); return; }
        Object.assign(body, { partyType: 'supplier', partyId: form.supplier.value, bank: form.bank.value.trim() });
      } else {
        const card = cards.find((x) => x.id === form.client.value);
        const pname = card ? card.name : form.party.value.trim();
        Object.assign(body, { partyType: 'customer', partyId: card ? card.id : '', partyName: pname, drawerName: form.drawer.value.trim() || pname, drawerBank: form.drawerBank.value.trim() });
      }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (isReal()) await api('/api/cheques', body);
        else DEMO.create({ ...body, partyType: direction === 'issued' ? 'supplier' : 'customer', partyId: direction === 'issued' ? body.partyId : (body.partyId || 'n:' + (body.partyName || '').toLowerCase()), clientId: direction === 'issued' ? '' : body.partyId, partyName: direction === 'issued' ? ((sups.find((s) => s.id === body.partyId) || {}).name || '') : body.partyName, receptionDate: body.receptionDate || todayYmd(), drawerBank: body.drawerBank || '', drawerName: body.drawerName || '', bank: body.bank || '' });
        m.close();
        K.toast(L('Chèque enregistré', 'Cheque saved', 'الشيك تسجّل'), { type: 'success' });
        S.filter = direction === 'issued' ? 'issued' : 'hand';
        await reload();
      } catch (err) { btn.disabled = false; K.toast(tr(err && err.code), { type: 'warning' }); }
    });
  }

  function editModal(c) {
    const requestId = idem();
    const rec = c.direction === 'received';
    const sheet = S.sheet && S.sheet.id === c.id ? S.sheet.cheque : c;
    const amountOk = rec && c.status === 'received' && !c.debtOpen && !sheet.linkedSales;
    const cards = clientCards();
    const m = K.modal({
      tag: `${kindLabel(c.kind)} · ${mad(c.amountCents)}`, title: L('Corriger le chèque', 'Edit the cheque', 'صحّح الشيك'), width: 500,
      body: `<form class="cq-form" data-cq-edit novalidate>
        ${amountOk ? `<label>${esc(L('Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'))}<input class="cq-amt" name="amount" inputmode="decimal" value="${esc((c.amountCents / 100).toFixed(2).replace(/\.00$/, ''))}"></label>` : ''}
        <div class="two"><label>${esc(L('Numéro', 'Number', 'الرقم'))}<input name="number" maxlength="40" dir="ltr" value="${esc(c.number)}"></label>
          <label>${esc(L('Échéance', 'Due date', 'الأجل'))}<input type="date" name="due" value="${esc(c.dueDate)}"></label></div>
        ${!amountOk && rec && sheet.linkedSales ? `<p class="cq-hint">${esc(L('Le montant suit le ticket qu\'il paie : il ne se corrige pas ici.', 'The amount follows the ticket it pays: it is not edited here.', 'المبلغ تابع للتيكي اللي كيخلّص: ما كيتصحّحش هنا.'))}</p>` : ''}
        ${rec && c.partyType !== 'supplier' ? `<label>${esc(L('Fiche cliente', 'Customer card', 'بطاقة الكليان'))}${clientSelect(c.clientId || '')}</label>
          <label data-cq-free>${esc(L('Client, nom libre', 'Customer, free name', 'الكليان، سمية حرة'))}<input name="party" maxlength="120" value="${esc(c.clientId ? '' : c.partyName)}" list="cq-parties-e"></label><datalist id="cq-parties-e">${partyList().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>` : ''}
        <div class="two"><label>${esc(L('Tireur', 'Drawer', 'الساحب'))}<input name="drawer" maxlength="120" value="${esc(c.drawerName)}"></label>
          <label>${esc(L('Banque tirée', 'Drawee bank', 'البنكة المسحوب عليها'))}<input name="drawerBank" maxlength="80" value="${esc(c.drawerBank)}" list="cq-banks-e"></label></div>
        <datalist id="cq-banks-e">${BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
        <label>${esc(L('Note', 'Note', 'ملاحظة'))}<input name="note" maxlength="200" value="${esc(c.note)}"></label>
        <label>${esc(L('Pourquoi cette correction ?', 'Why this edit?', 'علاش هاد التصحيح؟'))}<input name="reason" maxlength="200"></label>
        <div class="cq-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'رجوع'))}</button><button type="submit" class="kb atlas">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-cq-edit]');
    const free = form.querySelector('[data-cq-free]');
    const freeSync = () => { if (free && form.client) free.hidden = !!form.client.value; };
    if (form.client) form.client.addEventListener('change', freeSync);
    freeSync();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { id: c.id, requestId, number: form.number.value.trim(), dueDate: form.due.value || '', drawerName: form.drawer.value.trim(), drawerBank: form.drawerBank.value.trim(), note: form.note.value.trim(), reason: form.reason.value.trim() };
      if (amountOk) { const cents = readAmount(form.amount.value); if (!(cents > 0)) { K.toast(tr('bad-amount'), { type: 'warning' }); return; } body.amountCents = cents; }
      if (form.client) {
        const pick = form.client.value, card = cards.find((x) => x.id === pick);
        if (pick !== (c.clientId || '')) Object.assign(body, { partyType: 'customer', partyId: pick, partyName: card ? card.name : (form.party.value.trim() || c.partyName) });
        else if (!pick && form.party.value.trim() !== c.partyName) Object.assign(body, { partyType: 'customer', partyId: '', partyName: form.party.value.trim() });
      }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (isReal()) await api('/api/cheques/edit', body);
        else DEMO.edit(c.id, { number: body.number, dueDate: body.dueDate, drawerName: body.drawerName, drawerBank: body.drawerBank, note: body.note, ...(body.amountCents ? { amountCents: body.amountCents } : {}), ...(body.partyName !== undefined ? { partyName: body.partyName, clientId: body.partyId || '', partyId: body.partyId || c.partyId } : {}) });
        m.close();
        await reload();
        openDetail(c.id);
      } catch (err) { btn.disabled = false; K.toast(tr(err && err.code), { type: 'warning' }); }
    });
  }

  /* ── Bordereau de remise ───────────────────────────────────────────── */
  function rememberedBank() { try { return localStorage.getItem('kiwiChqBank') || ''; } catch (_) { return ''; } }
  function rememberBank(v) { try { if (v) localStorage.setItem('kiwiChqBank', v); } catch (_) {} }
  function slipModal(week) {
    const t = todayYmd(), upTo = week ? addDays(t, 6) : t;
    const hand = ((S.data && S.data.cheques) || []).filter((c) => c.direction === 'received' && c.status === 'received')
      .sort((a, b) => (a.dueDate || a.receptionDate).localeCompare(b.dueDate || b.receptionDate));
    if (!hand.length) { K.toast(L('Aucun chèque en main à remettre.', 'No cheque in hand to deposit.', 'حتى شيك فاليد باش يتدفع.'), { type: 'info' }); return; }
    const requestId = idem();
    const m = K.modal({
      title: L('Bordereau de remise', 'Deposit slip', 'ورقة الدفع للبنكة'), width: 560,
      desc: esc(week ? L('Les chèques à remettre cette semaine sont cochés. Décochez ceux qui attendent.', 'The cheques to deposit this week are ticked. Untick any that wait.', 'الشيكات اللي خاصهم يتدفعو هاد السيمانة معلّمين. حيّد العلامة على اللي غادي يتسناو.')
        : L('Cochez les chèques que vous portez à la banque. Ceux dont l\'échéance est arrivée sont déjà cochés.', 'Tick the cheques you take to the bank. Those already due are ticked.', 'علّم على الشيكات اللي غادي تدفع للبنكة. اللي حلّ الأجل ديالهم معلّمين.')),
      body: `<form class="cq-form" data-cq-slip novalidate>
        <div class="cq-pick">${hand.map((c) => { const due = c.dueDate || c.receptionDate; return `<label><input type="checkbox" value="${esc(c.id)}" data-cents="${c.amountCents}"${due <= upTo ? ' checked' : ''}>
          <span>${esc(who(c))}<small>${esc(kindLabel(c.kind))}${c.number ? ' · ' + esc(c.number) : ''}${c.drawerBank ? ' · ' + esc(c.drawerBank) : ''} · ${esc(L('échéance', 'due', 'الأجل'))} ${esc(dmy(due))}</small></span>
          <span class="amt">${esc(mad(c.amountCents))}</span></label>`; }).join('')}</div>
        <div class="cq-total"><span data-cq-count></span><span data-cq-sum></span></div>
        <div class="two"><label>${esc(L('Banque de remise', 'Deposit bank', 'البنكة'))}<input name="bank" maxlength="80" list="cq-banks-s" value="${esc(rememberedBank())}"></label>
          <label>${esc(L('Date de remise', 'Deposit date', 'تاريخ الدفع'))}<input type="date" name="date" value="${esc(t)}" max="${esc(t)}"></label></div>
        <datalist id="cq-banks-s">${BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
        <div class="cq-foot"><button type="button" class="kb ghost" data-dismiss>${esc(L('Annuler', 'Cancel', 'رجوع'))}</button><button type="submit" class="kb atlas cq-btn">${icon('print')}${esc(L('Remettre et imprimer', 'Deposit and print', 'دفع وطبع'))}</button></div>
      </form>`,
    });
    const form = m.el.querySelector('[data-cq-slip]');
    const sync = () => {
      const picked = [...form.querySelectorAll('input[type=checkbox]:checked')];
      form.querySelector('[data-cq-count]').textContent = countTxt(picked.length);
      form.querySelector('[data-cq-sum]').textContent = mad(picked.reduce((s, x) => s + Number(x.dataset.cents), 0));
      form.querySelector('[type=submit]').disabled = !picked.length;
    };
    form.addEventListener('change', sync); sync();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ids = [...form.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
      if (!ids.length) return;
      const bank = form.bank.value.trim(), date = form.date.value || t;
      rememberBank(bank);
      /* La fenêtre d'impression s'ouvre dans le geste, avant l'attente du serveur. */
      const w = window.open('', '_blank');
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const res = isReal() ? await api('/api/cheques/move', { action: 'deposit', ids, bank, date, requestId }) : DEMO.deposit(ids, bank, date);
        m.close();
        const failed = (res.results || []).filter((r) => !r.ok).length;
        K.toast(L(`Bordereau ${res.slip} · ${countTxt(res.cheques.length)}`, `Slip ${res.slip} · ${countTxt(res.cheques.length)}`, `ورقة ${res.slip} · ${countTxt(res.cheques.length)}`) + (failed ? ' · ' + L(`${failed} déjà bougé(s) ailleurs`, `${failed} moved elsewhere`, `${failed} تبدّلو من جهاز آخر`) : ''), { type: failed ? 'warning' : 'success' });
        printSlip(w, res.slip, res.cheques, res.bank || bank, res.date || date);
        await reload();
      } catch (err) { if (w) w.close(); btn.disabled = false; K.toast(tr(err && err.code), { type: 'warning' }); }
    });
  }
  function slipHtml(no, list, bank, date, lg) {
    const rtl = lg === 'ar';
    const total = list.reduce((s, c) => s + c.amountCents, 0);
    const rows = list.map((c, i) => `<tr><td>${i + 1}</td><td dir="ltr">${esc(c.number)}</td><td>${esc(kindLabel(c.kind, lg))}</td><td>${esc(c.drawerName || c.partyName)}</td><td>${esc(c.drawerBank)}</td><td>${esc(dmy(c.dueDate || c.receptionDate))}</td><td class="n">${esc(num(c.amountCents / 100))}</td></tr>`).join('');
    return `<!doctype html><html lang="${esc(lg)}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(LX(lg, 'Bordereau de remise', 'Deposit slip', 'ورقة الدفع للبنكة'))} ${esc(no)}</title>
<style>@page{margin:14mm}body{font-family:'Inter Tight',${rtl ? "'IBM Plex Sans Arabic'," : ''}system-ui,sans-serif;color:#0A0F0D;margin:0;font-size:12.5px}h1{font-size:19px;font-weight:600;margin:0 0 4px}p{margin:2px 0;color:#3a4440}
table{width:100%;border-collapse:collapse;margin-top:16px;font-variant-numeric:tabular-nums}th,td{padding:7px 6px;border-bottom:1px solid #ddd;text-align:start;vertical-align:top}th{font-weight:500;color:#6F6C65;font-size:11.5px}.n{text-align:end;white-space:nowrap}
tfoot td{font-weight:600;border-bottom:0;border-top:2px solid #0A0F0D}.head{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.sign{margin-top:34px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #999;padding-top:6px;color:#6F6C65;font-size:11.5px}</style></head><body>
<div class="head"><div><h1>${esc(LX(lg, 'Bordereau de remise de chèques', 'Cheque deposit slip', 'ورقة دفع الشيكات للبنكة'))}</h1><p>${esc(no)} · ${esc(dmy(date))}</p>${bank ? `<p>${esc(LX(lg, 'Banque', 'Bank', 'البنكة'))} : ${esc(bank)}</p>` : ''}</div><div><p><b>${esc(shopName())}</b></p><p>${esc(LX(lg, 'Montants en MAD', 'Amounts in MAD', 'المبالغ بالدرهم'))}</p></div></div>
<table><thead><tr><th>#</th><th>${esc(LX(lg, 'N°', 'No.', 'الرقم'))}</th><th>${esc(LX(lg, 'Type', 'Type', 'النوع'))}</th><th>${esc(LX(lg, 'Tireur', 'Drawer', 'الساحب'))}</th><th>${esc(LX(lg, 'Banque tirée', 'Drawee bank', 'البنكة المسحوب عليها'))}</th><th>${esc(LX(lg, 'Échéance', 'Due', 'الأجل'))}</th><th class="n">${esc(LX(lg, 'Montant', 'Amount', 'المبلغ'))}</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="6">${esc(LX(lg, `Total, ${list.length} pièce(s)`, `Total, ${list.length} item(s)`, `المجموع، ${list.length} ورقة`))}</td><td class="n">${esc(num(total / 100))}</td></tr></tfoot></table>
<div class="sign"><div>${esc(LX(lg, 'Signature du remettant', "Depositor's signature", 'توقيع اللي دفع'))}</div><div>${esc(LX(lg, 'Cachet de la banque', 'Bank stamp', 'طابع البنكة'))}</div></div></body></html>`;
  }
  function printSlip(w, no, list, bank, date) {
    if (!w) { K.toast(L('Autorisez les fenêtres pour imprimer.', 'Allow pop-ups to print.', 'سمح بالنوافذ باش تطبع.'), { type: 'warning' }); return; }
    w.document.open(); w.document.write(slipHtml(no, list, bank, date, lang())); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 250);
  }

  /* ── CSV : une cellule qui commence par = + - @ (ou une tabulation) est
     neutralisée, sinon un tableur l'exécuterait comme une formule. ─────── */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csvOut() {
    const lg = lang();
    const dec = (cents) => { const s = (cents / 100).toFixed(2); return lg === 'en' ? s : s.replace('.', ','); };
    const head = [LX(lg, 'Échéance', 'Due date', 'الأجل'), LX(lg, 'Statut', 'Status', 'الحالة'), LX(lg, 'Type', 'Type', 'النوع'), LX(lg, 'Sens', 'Direction', 'الاتجاه'), LX(lg, 'Numéro', 'Number', 'الرقم'), LX(lg, 'Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'),
      LX(lg, 'Client ou fournisseur', 'Customer or supplier', 'الكليان ولا المورد'), LX(lg, 'Tireur', 'Drawer', 'الساحب'), LX(lg, 'Banque tirée', 'Drawee bank', 'البنكة المسحوب عليها'), LX(lg, 'Banque de remise', 'Deposit bank', 'البنكة'),
      LX(lg, 'Reçu le', 'Received on', 'تاريخ الاستلام'), LX(lg, 'Remis le', 'Deposited on', 'تاريخ الدفع'), LX(lg, 'Réglé ou rejeté le', 'Settled or bounced on', 'تاريخ الخلاص ولا الرجوع'), LX(lg, 'Bordereau', 'Slip', 'الورقة'), LX(lg, 'Note', 'Note', 'ملاحظة')];
    const rows = filtered().map((c) => [dmy(c.dueDate), statusLabel(c.status, c.direction, lg), kindLabel(c.kind, lg), c.direction === 'issued' ? LX(lg, 'Émis', 'Issued', 'عطيناه') : LX(lg, 'Reçu', 'Received', 'توصلنا بيه'),
      c.number, dec(c.amountCents), c.partyName, c.drawerName, c.drawerBank, c.bank, dmy(c.receptionDate), dmy(c.depositDate), dmy(c.settleDate), c.depositSlip, c.note]);
    const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cheques-' + todayYmd() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function findCheque(id) { return ((S.data && S.data.cheques) || []).find((c) => c.id === id) || (S.sheet && S.sheet.id === id ? S.sheet.cheque : null); }
  function closed() { if (canOpen()) return false; K.toast(L('Réservé au propriétaire et au gérant', 'Owner and manager only', 'خاص بمول المحل والمسيّر'), { type: 'info' }); return true; }

  /* ── Handlers (enregistrés d'un coup : LAZY_SECTIONS les compte) ───── */
  handlers['nav-cheques'] = (_el, filter) => {
    if (typeof filter === 'string' && FILTERS().some((f) => f[0] === filter)) S.filter = filter;
    if (typeof filter === 'string' && filter.startsWith('party:')) { S.party = filter.slice(6); S.filter = 'all'; }
    const open = typeof filter === 'string' && filter.startsWith('cheque:') ? filter.slice(7) : '';
    if (open) S.filter = 'all';
    S.data = null;
    paint();
    return reload().then(() => { if (open && canOpen()) openDetail(open); });
  };
  handlers['chq-filter'] = (_el, k) => {
    if (k === 'clear') { S.party = ''; S.from = ''; S.to = ''; S.q = ''; paint(); return; }
    S.filter = FILTERS().some((f) => f[0] === k) ? k : 'hand';
    paint();
  };
  handlers['chq-party'] = (_el, key) => { S.party = S.party === key ? '' : String(key || ''); if (S.party && S.filter !== 'all') S.filter = 'hand'; paint(); };
  handlers['chq-open'] = (_el, id) => closed() || openDetail(String(id || ''));
  handlers['chq-move'] = (_el, arg) => {
    if (closed()) return;
    const [id, to] = String(arg || '').split('|');
    const c = findCheque(id);
    if (!c || !(c.allowed || []).includes(to)) return;
    if (S.sheet && S.sheet.close) S.sheet.close();
    moveModal(c, to);
  };
  handlers['chq-edit'] = (_el, id) => {
    if (closed()) return;
    const c = findCheque(String(id || ''));
    if (!c) return;
    if (S.sheet && S.sheet.close) S.sheet.close();
    editModal(c);
  };
  handlers['chq-new'] = () => closed() || newModal();
  handlers['chq-slip'] = (_el, arg) => closed() || slipModal(arg === 'week');
  handlers['chq-csv'] = () => closed() || csvOut();
  handlers['chq-reprint'] = async (_el, no) => {
    if (closed()) return;
    const w = window.open('', '_blank');
    try {
      const list = isReal() ? (await api('/api/cheques?slip=' + encodeURIComponent(String(no || '')))).cheques : DEMO.bySlip(String(no || ''));
      const first = list[0] || {};
      printSlip(w, String(no || ''), list, first.bank || '', first.depositDate || todayYmd());
    } catch (err) { if (w) w.close(); K.toast(tr(err && err.code), { type: 'warning' }); }
  };
})();

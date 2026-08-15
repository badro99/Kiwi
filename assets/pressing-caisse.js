/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PRESSING MODE — the laundry counter app inside kiwi-caisse.html
 * ---------------------------------------------------------------------------
 * PIN 0000 boots this terminal into a pressing (the kitchen display moved to
 * 0001). Any other code → restaurant caisse, untouched. One Kiwi, two métiers:
 * the demo story is an owner who runs his restaurant AND his pressing on the
 * same system, one login.
 *
 * Le pressing est un vertical ORDINAIRE du dispatcher (assets/pos-dispatch.js),
 * comme la boutique ou la pharmacie : il se déclare via KiwiPosDispatch.register,
 * reçoit sa racine, sa chorégraphie de déverrouillage, son « Rafraîchir » et sa
 * réimpression sans les réécrire. Il garde son propre préfixe CSS `.px-*` et
 * réutilise le kit modal de la caisse (.modal-veil, .modal, .ma-btn, .cash-*,
 * .reader-*) + #toast-stack. window.KiwiPressing reste exposé en compatibilité.
 *
 * The headline differentiator: intake is a VISUAL grid of garment cards
 * (illustrations, not text lists) — tap a garment, configure service/couleur/
 * notes/photo état, and it lands on the running ticket. Per-piece waterproof
 * barcode tags (costume 3 pièces = 3 étiquettes), rack locations, phone-first
 * customer lookup, WhatsApp "c'est prêt", pay-on-pickup. V1 = operational
 * layer only: card payments just send the amount to the partner reader.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD  = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons   = () => { if (window.lucide) try { lucide.createIcons(); } catch (e) {} };
  /* Google Material Symbols · Outlined 400 for primary navigation. Product
     artwork stays garment-specific because the Google set has no complete
     clothing catalogue (pants, skirt, caftan, linen, etc.). */
  const MI_PRESSING = {
    counter: 'M280-80v-240h-64q-40 0-68-28t-28-68q0-29 16-53.5t42-36.5l262-116v-26q-36-13-58-43.5T360-760q0-50 35-85t85-35q50 0 85 35t35 85h-80q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720t28.5 11.5Q520-697 520-680v58l262 116q26 12 42 36.5t16 53.5q0 40-28 68t-68 28h-64v240H280Zm-64-320h64v-40h400v40h64q7 0 11.5-5t4.5-13q0-5-2.5-8.5T750-432L480-552 210-432q-5 2-7.5 5.5T200-418q0 8 4.5 13t11.5 5Zm144 240h240v-200H360v200Z',
    orders: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h168q13-36 43.5-58t68.5-22q38 0 68.5 22t43.5 58h168q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm80-80h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Z',
    pickup: 'M120-160q-17 0-28.5-11.5T80-200q0-10 4-18.5T96-232l344-258v-70q0-17 12-28.5t29-11.5q25 0 42-18t17-43q0-25-17.5-42T480-720q-25 0-42.5 17.5T420-660h-80q0-58 41-99t99-41q58 0 99 40.5t41 98.5q0 47-27.5 84T520-526v36l344 258q8 5 12 13.5t4 18.5q0 17-11.5 28.5T840-160H120Zm120-80h480L480-420 240-240Z',
    rack: 'M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Z',
    prices: 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z',
    apparel: 'm240-522-40 22q-14 8-30 4t-24-18L66-654q-8-14-4-30t18-24l230-132h70q9 0 14.5 5.5T400-820v20q0 33 23.5 56.5T480-720q33 0 56.5-23.5T560-800v-20q0-9 5.5-14.5T580-840h70l230 132q14 8 18 24t-4 30l-80 140q-8 14-23.5 17.5T760-501l-40-20v361q0 17-11.5 28.5T680-120H280q-17 0-28.5-11.5T240-160v-362Zm80-134v456h320v-456l124 68 42-70-172-100q-15 51-56.5 84.5T480-640q-56 0-97.5-33.5T326-758L154-658l42 70 124-68Z',
    bed: 'M80-200v-240q0-27 11-49t29-39v-112q0-50 35-85t85-35h160q23 0 43 8.5t37 23.5q17-15 37-23.5t43-8.5h160q50 0 85 35t35 85v112q18 17 29 39t11 49v240h-80v-80H160v80H80Zm440-360h240v-80q0-17-11.5-28.5T720-680H560q-17 0-28.5 11.5T520-640v80Zm-320 0h240v-80q0-17-11.5-28.5T400-680H240q-17 0-28.5 11.5T200-640v80Zm-40 200h640v-80q0-17-11.5-28.5T760-480H200q-17 0-28.5 11.5T160-440v80Z',
    shoes: 'M216-580q39 0 74 14t64 41l382 365h24q17 0 28.5-11.5T800-200q0-8-1.5-17T788-235L605-418l-71-214-74 18q-38 10-69-14t-31-63v-84l-28-14-154 206h38q39 0 74 14t64 41l266 254H566q-30 0-57-11t-50-31L134-417q-46-42-51.5-103T114-631l154-206q17-23 45.5-30.5T368-861l28 14q21 11 32.5 30t11.5 42v84l74-19q30-8 58 7.5t38 44.5l65 196 170 170q20 20 27.5 43t7.5 49q0 50-35 85t-85 35H566Z'
  };
  const materialIcon = (name, cls) => `<svg class="${cls || ''}" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${MI_PRESSING[name]}"></path></svg>`;
  const garmentIcon = (item, cls) => {
    const shared = window.KiwiPressingGarmentIcons;
    if (shared && shared.render) return shared.render(item, cls);
    return `<img class="px-product-photo${cls ? ` ${cls}` : ''}" src="assets/pressing-products/chemise.png" alt="" aria-hidden="true">`;
  };
  const DAYS    = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS  = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2    = (n) => String(n).padStart(2, '0');
  const fmtDT   = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const H = 3600 * 1000;
  const MAX_QTY = 99;

  /* Customer phones use one canonical value for search, duplicate detection
   * and WhatsApp. Moroccan numbers keep their familiar local display; tourist
   * numbers are accepted in E.164 form (+country code) or with a 00 prefix.
   * We intentionally do not guess a foreign country from a bare national
   * number: the cashier must enter +33…, +49…, 0044…, etc. */
  function normalizePhone(value) {
    if (window.KiwiPhone) return window.KiwiPhone.normalize(value);
    const raw = String(value == null ? '' : value).trim();
    if (!raw || /[A-Za-z]/.test(raw)) return '';
    if (!/^[+]?[-.()\s\d]+$/.test(raw) || (raw.includes('+') && !raw.startsWith('+'))) return '';
    /* A common travel-address-book form is +33 (0)6…: the trunk zero is used
       only inside France and must not enter the international number. */
    const prepared = raw.replace(/\(\s*0\s*\)/, '');
    let digits = prepared.replace(/\D/g, '');
    if (digits.startsWith('00212')) digits = '0' + digits.slice(5);
    else if (digits.startsWith('212')) digits = '0' + digits.slice(3);
    else if (/^[5-7]\d{8}$/.test(digits)) digits = '0' + digits;
    if (/^0[5-7]\d{8}$/.test(digits)) {
      return digits.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
    }
    if (!raw.startsWith('+') && !raw.startsWith('00')) return '';
    if (raw.startsWith('+') && raw.indexOf('+', 1) !== -1) return '';
    const international = raw.startsWith('00') ? prepared.replace(/\D/g, '').slice(2) : prepared.replace(/\D/g, '');
    if (!/^[1-9]\d{6,14}$/.test(international)) return '';
    return '+' + international;
  }
  /* Compatibility for older extensions/tests that consumed the former name. */
  const normalizeMoroccanPhone = normalizePhone;
  const phoneDigits = (value) => (normalizePhone(value) || String(value || '')).replace(/\D/g, '');
  /* Comme phoneDigits, mais tolérant aux numéros INCOMPLETS : au retrait, la
     cliente dicte son numéro et la caissière tape au fur et à mesure. « +212 6 »
     doit déjà filtrer comme « 06 », alors que normalizePhone refuse
     (à juste titre) un numéro trop court. On coupe donc l'indicatif à la main. */
  function searchDigits(value) {
    if (window.KiwiPhone) return window.KiwiPhone.digits(value) || String(value == null ? '' : value).replace(/\D/g, '');
    let d = String(value == null ? '' : value).replace(/\D/g, '');
    if (d.startsWith('00212')) d = '0' + d.slice(5);
    else if (d.startsWith('212')) d = '0' + d.slice(3);
    else if (/^[5-7]/.test(d) && d.length >= 9) d = '0' + d;
    return d;
  }
  const whatsappPhone = (value) => {
    if (window.KiwiPhone) return window.KiwiPhone.whatsapp(value);
    const phone = normalizePhone(value);
    if (!phone) return '';
    if (phone.startsWith('+')) return phone.slice(1);
    return '212' + phone.replace(/\D/g, '').slice(1);
  };
  const clampQty = (value) => Math.max(1, Math.min(MAX_QTY, Math.floor(Number(value) || 1)));
  const validDeposit = (value, total) => Number.isFinite(+value) && +value >= 10 && +value <= +total;
  const validReady = (value, now) => !!value && typeof value.getTime === 'function'
    && Number.isFinite(value.getTime()) && value.getTime() > +(now || Date.now());

  /* The counter promises clock times, not vague 24/48-hour offsets. Building
     from local calendar days keeps noon and 18:00 stable across DST changes.
     Sunday was already excluded by the pressing flow; keep that operational
     rule while making the label honest whenever "tomorrow" becomes Monday. */
  function pressingServiceDay(from, count) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    let left = Math.max(0, Math.floor(+count || 0));
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) left--;
    }
    return d;
  }
  function pressingSlot(from, serviceDays, hour) {
    const d = pressingServiceDay(from, serviceDays);
    d.setHours(hour, 0, 0, 0);
    return d;
  }
  function relativeServiceDay(date, now) {
    const a = new Date(now); a.setHours(0, 0, 0, 0);
    const b = new Date(date); b.setHours(0, 0, 0, 0);
    const days = Math.round((b - a) / (24 * H));
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Demain';
    if (days === 2) return 'Après-demain';
    return fmtDay(date);
  }
  function readyOptions(value) {
    const now = value && typeof value.getTime === 'function' && Number.isFinite(value.getTime())
      ? new Date(value.getTime())
      : new Date();
    const beforeCutoff = now.getHours() < 13;
    const nextNoon = pressingSlot(now, 1, 12);
    const nextEvening = pressingSlot(now, 1, 18);
    const followingNoon = pressingSlot(now, 2, 12);
    const options = beforeCutoff
      ? [
          { key: 'today-evening', d: pressingSlot(now, 0, 18), sub: 'Express · dépôt avant 13:00' },
          { key: 'next-noon', d: nextNoon, sub: 'Retrait à midi' },
          { key: 'next-evening', d: nextEvening, sub: 'Service standard', recommended: true },
        ]
      : [
          { key: 'next-noon', d: nextNoon, sub: 'Premier créneau disponible' },
          { key: 'next-evening', d: nextEvening, sub: 'Service standard', recommended: true },
          { key: 'following-noon', d: followingNoon, sub: 'Délai confortable' },
        ];
    return options.map((option) => ({
      ...option,
      day: relativeServiceDay(option.d, now),
      time: `${pad2(option.d.getHours())}:${pad2(option.d.getMinutes())}`,
      label: `${relativeServiceDay(option.d, now)} · ${pad2(option.d.getHours())}:${pad2(option.d.getMinutes())}`,
    }));
  }

  function toast(msg, ms) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2200);
    setTimeout(() => el.remove(), (ms || 2200) + 280);
  }

  /* Real Code 39: the printed garment id can be read by an inexpensive USB or
   * Bluetooth scanner instead of merely looking like a barcode. */
  const CODE39 = {
    '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
    '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
    A:'wnnnnwnnw',B:'nnwnnwnnw',C:'wnwnnwnnn',D:'nnnnwwnnw',E:'wnnnwwnnn',F:'nnwnwwnnn',
    G:'nnnnnwwnw',H:'wnnnnwwnn',I:'nnwnnwwnn',J:'nnnnwwwnn',K:'wnnnnnnww',L:'nnwnnnnww',
    M:'wnwnnnnwn',N:'nnnnwnnww',O:'wnnnwnnwn',P:'nnwnwnnwn',Q:'nnnnnnwww',R:'wnnnnnwwn',
    S:'nnwnnnwwn',T:'nnnnwnwwn',U:'wwnnnnnnw',V:'nwwnnnnnw',W:'wwwnnnnnn',X:'nwnnwnnnw',
    Y:'wwnnwnnnn',Z:'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','*':'nwnnwnwnn',
  };
  function barcode(seed, h) {
    h = h || 30;
    const text = String(seed || '').toUpperCase().replace(/[^0-9A-Z. -]/g, '-');
    let bars = '', x = 0;
    (`*${text}*`).split('').forEach((ch) => {
      const pattern = CODE39[ch] || CODE39['-'];
      pattern.split('').forEach((width, i) => {
        const w = width === 'w' ? 3 : 1;
        if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
        x += w;
      });
      x += 1; /* narrow inter-character gap */
    });
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── garment line-art ─────────────────────────
     One visual voice: forest strokes, mint-tint fills, 64×64 grid.
     These ARE the menu — the photo-grid intake is the headline feature. */
  const art = (inner) => `<svg class="px-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    chemise: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3-5 5h-6z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12l6 8 6-8" /><path class="thin" d="M32 22v30"/><circle class="thin" cx="29.5" cy="28" r=".9"/><circle class="thin" cx="29.5" cy="36" r=".9"/><circle class="thin" cx="29.5" cy="44" r=".9"/>`),
    tshirt: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M22 12c2 3.5 10 3.5 12 0" transform="translate(4 0)"/>`),
    pull: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12c1.5 3 10.5 3 12 0" /><path class="thin" d="M20 49h24M20 45.5h24"/><path class="thin" d="M16.5 28.5l3.5-2.5M47.5 28.5 44 26"/>`),
    veste: art(`<path class="fill" d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4-4-1c-2 3-8 3-12 0z"/><path d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4"/><path d="M26 11l6 13 6-13"/><path d="M32 24v30"/><circle class="thin" cx="35.5" cy="36" r="1.1"/>`),
    costume: art(`<path d="M32 5c-2.6 0-4 1.6-4 3.4 0 1.7 1.4 3 3.2 3.2L32 12"/><path d="M32 12l17 9H15z"/><path class="fill" d="M17 21l4 33h22l4-33z"/><path d="M17 21l4 33h22l4-33"/><path d="M25 21l7 11 7-11"/><path class="thin" d="M32 32v22"/>`),
    manteau: art(`<path class="fill" d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5-3-1c-2 3-9 3-13 0z"/><path d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5"/><path d="M26 9l6 11 6-11"/><path d="M20 40h24"/><path class="thin" d="M30 40h4v3h-4z"/><path class="thin" d="M32 20v34"/>`),
    pantalon: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M26.5 24v24M37.5 24v24"/>`),
    jean: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M22 21c3 3 7 3 9 0M42 21c-3 3-7 3-9 0"/><circle class="thin" cx="32" cy="13.5" r="1"/>`),
    jupe: art(`<path d="M24 11h16l1 6H23z"/><path class="fill" d="M23 17 15 51c10 4 24 4 34 0l-8-34z"/><path d="M23 17 15 51c10 4 24 4 34 0l-8-34"/><path class="thin" d="M27 20l-4 30M37 20l4 30"/>`),
    short: art(`<path class="fill" d="M20 12h24v7l3 20H33l-1-11-1 11H17l3-20z"/><path d="M20 12h24v7H20z"/><path d="M20 19l-3 20h14l1-11 1 11h14l-3-20"/><path class="thin" d="M32 22v6"/>`),
    robe: art(`<path d="M27 9c1.5 2.6 8.5 2.6 10 0l4 7-2 9"/><path d="M27 9l-4 7 2 9"/><path class="fill" d="M25 25h14c6 9 8 17 8 27H17c0-10 2-18 8-27z"/><path d="M25 25c-6 9-8 17-8 27h30c0-10-2-18-8-27"/><path d="M25 25h14"/>`),
    robe_soiree: art(`<path d="M28 8c1.3 2.2 6.7 2.2 8 0l3 5-2 9"/><path d="M28 8l-3 5 2 9"/><path class="fill" d="M27 22h10l11 30c-10 4-22 4-32 0z"/><path d="M27 22 16 52c10 4 22 4 32 0L37 22"/><path d="M27 22h10"/><path class="thin" d="M30 30 24 50M36 32l5 16"/>`),
    caftan: art(`<path class="fill" d="M26 8h12l3 7v39H23V15z"/><path d="M26 8h12l3 7v39H23V15z"/><path d="M26 9 10 23l4 5 9-7"/><path d="M38 9l16 14-4 5-9-7"/><path d="M32 15v39"/><path class="thin" d="M29 20h6M29 25h6M29 30h6M29 35h6"/>`),
    drap: art(`<rect class="fill" x="10" y="17" width="44" height="30" rx="4"/><rect x="10" y="17" width="44" height="30" rx="4"/><path class="thin" d="M10 27h44M10 37h44"/>`),
    housse: art(`<rect class="fill" x="10" y="14" width="44" height="36" rx="4"/><rect x="10" y="14" width="44" height="36" rx="4"/><path class="thin" d="M10 16l22 16 22-16"/><circle class="thin" cx="24" cy="44" r="1"/><circle class="thin" cx="32" cy="44" r="1"/><circle class="thin" cx="40" cy="44" r="1"/>`),
    couverture: art(`<path class="fill" d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M14 30c0-8 5-14 14-14h22v8H28"/><path class="thin" d="M6 39h52"/>`),
    nappe: art(`<path class="fill" d="M9 22h46l-5 22H14z"/><path d="M9 22h46l-5 22H14z"/><path d="M9 22l-3 9M55 22l3 9"/><path class="thin" d="M22 22l2 22M42 22l-2 22M12 33h40"/><path d="M18 44v10M46 44v10"/>`),
    rideaux: art(`<path d="M8 10h48"/><path class="fill" d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path class="thin" d="M21 14v13M26 14v11"/><path d="M12 34c7 4 15 4 20-1"/><path class="thin" d="M40 14h8v40h-8c2-14 2-26 0-40z"/>`),
    tapis: art(`<circle class="fill" cx="19" cy="25" r="9.5"/><circle cx="19" cy="25" r="9.5"/><circle class="thin" cx="19" cy="25" r="4"/><path class="fill" d="M19 34.5h27l9 15H13z"/><path d="M28.5 25H46l9 15.5"/><path d="M19 34.5h27l9 15H13z"/><path class="thin" d="M22 54v4M30 54v4M38 54v4M46 54v4"/>`),
    veste_cuir: art(`<path class="fill" d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4-4-2c-2 3-8 3-12 0z"/><path d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4"/><path d="M25 12l4 6-3 5"/><path d="M39 12l-4 6 3 5"/><path d="M29 23l8 31"/><path class="thin" d="M31 28l3-1M33 35l3-1M35 42l3-1"/><circle class="thin" cx="24" cy="20" r="1"/><circle class="thin" cx="40" cy="20" r="1"/>`),
    daim: art(`<path class="fill" d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4-3-1c-2 3-9 3-13 0z"/><path d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4"/><path d="M26 11c2 3 10 3 12 0"/><path d="M21 38h22"/><path class="thin" d="M24 38v8M28 38v7M32 38v8M36 38v7M40 38v8"/>`),
    doudoune: art(`<path class="fill" d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6-3-1c-2 3-10 3-12 0z"/><path d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6"/><path d="M26 11c1.5 3 10.5 3 12 0"/><path class="thin" d="M19 24c8 3 18 3 26 0M19 32c8 3 18 3 26 0M19 40c8 3 18 3 26 0M19 47.5c8 3 18 3 26 0"/><path d="M32 14v40"/>`),
    chaussures: art(`<path class="fill" d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 45h44"/><path class="thin" d="M27 30l4 3M24 33l4 3M21 36l4 3"/>`),
    baskets: art(`<path class="fill" d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44h48v3c-18 3-32 3-48 0z"/><path class="thin" d="M26 29l4 3M23 32l4 3"/><path class="thin" d="M38 31c-3 5-8 7-14 7"/>`),
    babouches: art(`<path class="fill" d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path class="thin" d="M26 34.5c4 1.5 6 4 6 7.5"/><path class="thin" d="M40 32.6c-1 4.4-1 6.6 0 9.4"/>`),
  };

  /* ───────────────────────── services + price list ─────────────────────────
     Per garment × service — same garment, different service = different price.
     A missing key = service not offered for that garment. MAD, Tanger 2026. */
  /* Services are COMBINABLE on one garment (lavage + repassage is the
     classic ask) — prices add up. Two real-world exclusions: le nettoyage
     à sec est un procédé complet (il inclut le repassage) et ne se cumule
     jamais avec le lavage à l'eau. Détachage / retouche stack with anything. */
  let SERVICES = [];
  let SVC = {};
  const SVC_CONFLICTS = { sec: ['lavage', 'repassage'], lavage: ['sec'], repassage: ['sec'] };
  const svcCodes  = (svcs) => svcs.map((s) => SVC[s] ? SVC[s].code : s).join('+');
  const svcShorts = (svcs) => svcs.map((s) => SVC[s] ? SVC[s].short : s).join(' + ');

  let CATALOG = [];
  let ITEMS = {};
  function loadCatalog() {
    const api = window.KiwiPressingCatalog;
    const doc = api && api.read ? api.read() : { services: [], categories: [], items: [] };
    SERVICES = (doc.services || []).slice();
    SVC = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
    ITEMS = {};
    (doc.items || []).forEach((it) => { ITEMS[it.id] = it; });
    CATALOG = (doc.categories || []).map((c) => ({ ...c, items: (doc.items || []).filter((it) => it.cat === c.id) }));
  }
  loadCatalog();

  function priceTable(item, variantId) {
    if (item.variants) {
      const v = item.variants.find((x) => x.id === variantId) || item.variants[0];
      return v.prices;
    }
    return item.prices;
  }
  function minPrice(item) {
    const tables = item.variants ? item.variants.map((v) => v.prices) : [item.prices];
    const values = tables.flatMap((t) => Object.values(t || {})).filter((n) => Number(n) > 0);
    return values.length ? Math.min(...values) : 0;
  }
  function availServices(item, variantId) {
    const t = priceTable(item, variantId);
    return SERVICES.filter((s) => t[s.id] != null);
  }

  const COLORS = [
    { id: 'blanc',  label: 'Blanc',  hex: '#FFFFFF' },
    { id: 'noir',   label: 'Noir',   hex: '#1F2421' },
    { id: 'gris',   label: 'Gris',   hex: '#9AA09D' },
    { id: 'bleu',   label: 'Bleu',   hex: '#33588C' },
    { id: 'rouge',  label: 'Rouge',  hex: '#A8423A' },
    { id: 'beige',  label: 'Beige',  hex: '#D9C7A7' },
    { id: 'vert',   label: 'Vert',   hex: '#3E6B52' },
    { id: 'marron', label: 'Marron', hex: '#6E4F37' },
  ];
  const COLOR = Object.fromEntries(COLORS.map((c) => [c.id, c]));
  const NOTES = ['Tache col', 'Tache manche', 'Bouton manquant', 'Ourlet à reprendre', 'Fermeture abîmée', 'Délicat'];

  /* ───────────────────────── clients (Tanger) ───────────────────────── */
  /* Real/paired store never shows the demo "Pressing Marshan" customers, orders
     or name — it opens on its own empty counter. Local pitch demo unchanged.
     (Mirrors the pvReal() gate every other vertical uses.) */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { var p = pvPaired(); return (p && p.name) || (pvReal() ? 'Mon pressing' : demo); }

  const CUSTOMERS = pvReal() ? [] : [
    { id: 'c1', name: 'Amal Berrada',         phone: '0661 23 45 67', orders: 23, prefs: ['Repassage sur cintre', 'Sans amidon'] },
    { id: 'c2', name: 'Youssef El Khattabi',  phone: '0670 11 22 33', orders: 14, prefs: ['Costumes pliés en housse'] },
    { id: 'hb', name: 'Hôtel Bab El Bahr',    phone: '0539 33 44 55', orders: 46, b2b: true, prefs: ['Facture fin de mois', 'Remise –15 % négociée'], contact: 'Gouvernante · Mme Rkia' },
    { id: 'c3', name: 'Fatima-Zahra Lamrani', phone: '0650 88 77 66', orders: 9,  prefs: ['Caftans, nettoyage main', 'Pas de perchlo (allergie)'] },
    { id: 'c4', name: 'Mehdi Bennani',        phone: '0662 09 18 27', orders: 2,  prefs: [] },
    { id: 'c5', name: 'Khadija Tazi',         phone: '0668 54 32 10', orders: 6,  prefs: ['Rideaux par panneau'] },
    { id: 'c6', name: 'Omar Sefrioui',        phone: '0677 65 43 21', orders: 31, prefs: ['10 chemises chaque lundi'] },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));
  const B2B_REMISE = 0.15;

  /* ───────────────────────── orders (seed) ─────────────────────────
     Statuses: recu → trait → pret → livre. Status lives on each PIECE —
     a pressing tracks garments, not just tickets. Order status = derived. */
  const STATUS = {
    recu:  { label: 'Reçu',          dot: 'recu'  },
    trait: { label: 'En traitement', dot: 'trait' },
    pret:  { label: 'Prêt',          dot: 'pret'  },
    /* The persisted key stays `livre` for backwards compatibility, but at the
       pressing counter this state means the garments were physically handed
       back to the customer. "Remis" is accurate for a pickup and does not
       pretend that Kiwi ran a home-delivery route. */
    livre: { label: 'Remis',         dot: 'livre' },
  };
  const STATUS_FLOW = ['recu', 'trait', 'pret', 'livre'];

  let pieceSeqGlobal = 0;
  function buildPieces(orderId, lines, statuses) {
    const pieces = []; let n = 0;
    lines.forEach((ln, li) => {
      const item = ITEMS[ln.itemId];
      /* `variants: []` est vrai au sens JS mais n'a pas d'élément 0 : lire
         `.pieces` dessus jetait un TypeError et la fiche entière ne s'affichait
         plus. Une famille sans variante retombe sur une pièce anonyme, comme
         partout ailleurs. */
      const variant = item.variants && (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]);
      const labels = (variant && variant.pieces) || null;
      for (let q = 0; q < clampQty(ln.qty); q++) {
        (labels || [null]).forEach((plabel) => {
          n++;
          pieces.push({
            pid: `${orderId}-${n}`, n, lineIdx: li,
            label: plabel ? `${ln.label || item.label} · ${plabel}` : (ln.label || item.label),
            itemId: ln.itemId, variantId: ln.variantId || null, svcs: ln.services, color: ln.color,
            notes: (ln.notes || []).slice(), freeNote: ln.freeNote || '',
            status: (statuses && statuses[n - 1]) || 'recu',
            photos: ln.photos || 0,
            photoData: Array.isArray(ln.photoData) ? ln.photoData : [],
          });
        });
      }
    });
    pieces.forEach((p) => { p.of = pieces.length; });
    return pieces;
  }
  function lineUnit(ln) {
    if (Number.isFinite(+ln.unitPrice) && +ln.unitPrice >= 0) return +ln.unitPrice;
    const t = priceTable(ITEMS[ln.itemId], ln.variantId);
    return ln.services.reduce((s, sv) => s + (t[sv] || 0), 0);
  }
  function lineTotal(ln) {
    return lineUnit(ln) * ln.qty;
  }
  function orderTotals(o) {
    const sub = o.lines.reduce((s, ln) => s + lineTotal(ln), 0);
    const remise = o.b2b ? Math.round(sub * B2B_REMISE) : 0;
    return { sub, remise, total: sub - remise };
  }
  /* Snapshot the operational truth that already exists on the pressing ticket.
   * Payments can be deposits or balances, so line totals are allocated pro-rata
   * to the money received in THIS sale event; recording the full garment value
   * at both deposit and pickup would double product revenue. */
  function saleLines(o, received) {
    if (!o || !Array.isArray(o.lines)) return [];
    const full = orderTotals(o).total;
    const factor = full > 0 ? Math.max(0, +received || 0) / full : 0;
    let allocated = 0;
    return o.lines.map((ln, idx) => {
      const item = ITEMS[ln.itemId] || { label: 'Article', cat: '' };
      const raw = lineTotal(ln) * (o.b2b ? (1 - B2B_REMISE) : 1) * factor;
      const total = idx === o.lines.length - 1
        ? Math.max(0, Math.round(((+received || 0) - allocated) * 100) / 100)
        : Math.max(0, Math.round(raw * 100) / 100);
      allocated += total;
      return {
        itemId: ln.itemId,
        variantId: ln.variantId || '',
        name: item.label,
        cat: item.cat || '',
        kind: 'service',
        unit: 'piece',
        qty: ln.qty,
        total,
        options: (ln.services || []).map((id) => ({ id, qty: ln.qty })),
      };
    });
  }
  function orderStatus(o) {
    const st = o.pieces.map((p) => p.status);
    if (st.every((s) => s === 'livre')) return 'livre';
    if (st.every((s) => s === 'pret' || s === 'livre')) return 'pret';
    if (st.some((s) => s === 'trait' || s === 'pret')) return 'trait';
    return 'recu';
  }
  function isLate(o) {
    const s = orderStatus(o);
    return (s === 'recu' || s === 'trait') && o.readyAt.getTime() < Date.now();
  }

  const NOW = Date.now();
  function mkOrder(cfg) {
    const o = {
      id: cfg.id, custId: cfg.custId || null, guest: cfg.guest || null,
      b2b: !!(cfg.custId && CUST[cfg.custId] && CUST[cfg.custId].b2b),
      lines: cfg.lines.map((l) => ({ itemId: l[0], services: Array.isArray(l[1]) ? l[1] : [l[1]], qty: clampQty(l[2]), color: l[3], notes: l[4] || [], freeNote: l[5] || '', photos: l[6] || 0, variantId: l[7] || null })),
      droppedAt: new Date(NOW - cfg.droppedH * H),
      readyAt:   new Date(NOW + cfg.readyH * H),
      pay: cfg.pay,           /* {mode:'now'|'acompte'|'pickup'|'compte', method, paid} */
      rack: cfg.rack || null,
      notified: !!cfg.notified,
      collectedAt: cfg.collectedH != null ? new Date(NOW - cfg.collectedH * H) : null,
    };
    o.lines.forEach((l) => { l.label = ITEMS[l.itemId].label; l.unitPrice = lineUnit(l); });
    o.pieces = buildPieces(o.id, o.lines, null);
    if (cfg.status) o.pieces.forEach((p) => { p.status = cfg.status; });
    if (cfg.statuses) o.pieces.forEach((p, i) => { p.status = cfg.statuses[Math.min(i, cfg.statuses.length - 1)]; });
    return o;
  }

  const ORDERS = pvReal() ? [] : [
    /* ── reçu ── */
    mkOrder({ id: 'P-1044', custId: 'c4', droppedH: 0.6, readyH: 47, status: 'recu',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['jean', 'lavage', 2, 'bleu'], ['pull', 'sec', 1, 'gris', ['Tache manche'], '', 1]] }),
    mkOrder({ id: 'P-1043', custId: 'c1', droppedH: 1.4, readyH: 46, status: 'recu',
      pay: { mode: 'acompte', method: 'especes', paid: 40 },
      lines: [['chemise', ['lavage', 'repassage'], 4, 'blanc'], ['robe', 'sec', 1, 'rouge', ['Délicat'], '', 2]] }),
    mkOrder({ id: 'P-1042', custId: 'c6', droppedH: 2.5, readyH: 22, status: 'recu',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['chemise', 'repassage', 10, 'blanc', [], 'Lot du lundi'], ['pantalon', 'repassage', 2, 'noir']] }),
    /* ── en traitement ── */
    mkOrder({ id: 'P-1041', custId: 'c2', droppedH: 6, readyH: 26, statuses: ['trait', 'trait', 'trait', 'recu'],
      pay: { mode: 'now', method: 'carte', paid: 170 },
      lines: [['costume', 'sec', 1, 'bleu', [], '', 1, '3p'], ['veste_cuir', 'sec', 1, 'noir', ['Délicat'], 'Col élimé', 2]] }),
    mkOrder({ id: 'P-1040', custId: 'hb', droppedH: 8, readyH: 16, status: 'trait',
      pay: { mode: 'compte', method: 'compte', paid: 0 },
      lines: [['drap', 'lavage', 12, 'blanc'], ['nappe', 'lavage', 6, 'blanc'], ['housse', 'lavage', 4, 'blanc']] }),
    mkOrder({ id: 'P-1039', custId: 'c3', droppedH: 20, readyH: 28, statuses: ['trait', 'pret'],
      pay: { mode: 'acompte', method: 'especes', paid: 100 },
      lines: [['caftan', 'sec', 1, 'vert', ['Délicat'], 'Sfifa fragile, nettoyage main', 3], ['robe_soiree', 'sec', 1, 'noir', [], '', 1]] }),
    mkOrder({ id: 'P-1032', custId: 'c5', droppedH: 50, readyH: -14, status: 'trait',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['rideaux', 'sec', 4, 'beige', [], 'Salon, 4 panneaux'], ['couverture', 'lavage', 1, 'marron']] }),
    /* ── prêt ── */
    mkOrder({ id: 'P-1038', custId: 'c1', droppedH: 30, readyH: -2, status: 'pret', rack: 'A-04', notified: true,
      pay: { mode: 'now', method: 'especes', paid: 56 },
      lines: [['pantalon', 'sec', 2, 'noir']] }),
    mkOrder({ id: 'P-1037', custId: 'c6', droppedH: 32, readyH: -1, status: 'pret', rack: 'B-07',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['chemise', ['lavage', 'repassage'], 8, 'blanc'], ['veste', 'sec', 1, 'gris']] }),
    mkOrder({ id: 'P-1036', custId: 'c4', droppedH: 26, readyH: -4, status: 'pret',
      pay: { mode: 'acompte', method: 'carte', paid: 30 },
      lines: [['doudoune', 'lavage', 1, 'noir', [], '', 1], ['tshirt', 'lavage', 3, 'blanc']] }),
    /* ── livré ── */
    mkOrder({ id: 'P-1035', custId: 'c2', droppedH: 54, readyH: -8, status: 'livre', collectedH: 5, notified: true,
      pay: { mode: 'now', method: 'carte', paid: 105 },
      lines: [['costume', 'repassage', 1, 'gris', [], '', 0, '2p'], ['chemise', 'repassage', 7, 'blanc']] }),
    mkOrder({ id: 'P-1031', custId: 'c5', droppedH: 76, readyH: -30, status: 'livre', collectedH: 26, notified: true,
      pay: { mode: 'now', method: 'especes', paid: 102 },
      lines: [['jupe', 'sec', 2, 'noir'], ['babouches', 'sec', 1, 'beige']] }),
  ];

  /* rack — rails A/B/C × 12 positions */
  const RAILS = ['A', 'B', 'C'];
  const RAIL_SIZE = 12;
  const rackSlots = {};                  /* 'B-07' → orderId */
  ORDERS.forEach((o) => { if (o.rack) rackSlots[o.rack] = o.id; });

  /* ───────────────────────── state ───────────────────────── */
  let ticketSeq = 1045;
  const PRESSING_STORE_PREFIX = 'kiwi:pressing-store:v1:';
  let pressingCloudHandle = null;
  const persistedOrderHashes = Object.create(null);
  const persistedCustomerHashes = Object.create(null);
  const state = {
    view: 'comptoir',
    cat: 'tous',
    catalogQuery: '',
    ticket: null,            /* { num, lines:[], customer, ready } */
    boardQuery: '',
    rtQuery: '', rtOrder: null,
    rackSelect: null,
    offline: false, queued: 0,
    unlocked: false,
  };
  /* Operational state survives reloads and follows the paired pressing. UI
     filters/modals stay local; only customers, orders, rack allocation, the
     open intake ticket and numbering are mirrored. */
  const pressingOps = window.KiwiVerticalState?.open?.('pressing', {
    schema: 1,
    snapshot: () => ({ customers: CUSTOMERS, orders: ORDERS, rackSlots, ticketSeq, ticket: state.ticket }),
    restore: (d) => {
      CUSTOMERS.splice(0, CUSTOMERS.length, ...((d.customers || []).map((c) => c)));
      Object.keys(CUST).forEach((k) => delete CUST[k]); CUSTOMERS.forEach((c) => { if (c?.id) CUST[c.id] = c; });
      const orders = (d.orders || []).map((o) => {
        (o.lines || []).forEach((line) => { line.qty = clampQty(line.qty); });
        o.droppedAt = new Date(o.droppedAt); o.readyAt = new Date(o.readyAt);
        o.collectedAt = o.collectedAt ? new Date(o.collectedAt) : null; return o;
      });
      ORDERS.splice(0, ORDERS.length, ...orders);
      Object.keys(rackSlots).forEach((k) => delete rackSlots[k]);
      Object.assign(rackSlots, d.rackSlots || {});
      ticketSeq = Math.max(ticketSeq, +d.ticketSeq || 0);
      state.ticket = d.ticket || null;
      if (state.ticket?.ready) state.ticket.ready = new Date(state.ticket.ready);
      (state.ticket?.lines || []).forEach((line) => { line.qty = clampQty(line.qty); });
    },
  });
  function freshTicket() {
    state.ticket = { num: posRef(`P-${ticketSeq}`), lines: [], customer: null, ready: suggestReady() };
  }
  function suggestReady(value) {
    const options = readyOptions(value);
    return new Date((options.find((option) => option.recommended) || options[0]).d);
  }
  function findOrder(id) { return ORDERS.find((o) => o.id === id); }
  function custOf(o) {
    if (o.custId) return CUST[o.custId];
    return o.guest || { name: 'Client de passage', phone: '' };
  }
  function pressingScope() {
    try { if (window.KiwiPressingOps) return KiwiPressingOps.scope(); } catch (_) {}
    const p = pvPaired();
    return p && (p.merchant || p.slug || p.venueId || p.name) || '';
  }
  function pressingStoreKey() {
    const s = pressingScope();
    return s ? PRESSING_STORE_PREFIX + s : '';
  }
  function orderPayload(o) {
    return {
      id: String(o.id || '').slice(0, 40), custId: o.custId || null,
      guest: o.guest ? { name: String(o.guest.name || 'Client de passage').slice(0, 100), phone: String(o.guest.phone || '').slice(0, 40) } : null,
      b2b: !!o.b2b,
      lines: (o.lines || []).map((l) => ({
        itemId: l.itemId, label: String(l.label || (ITEMS[l.itemId] && ITEMS[l.itemId].label) || 'Article').slice(0, 100),
        unitPrice: Math.max(0, Math.min(100000, +l.unitPrice || 0)), services: (l.services || []).slice(0, 8), qty: Math.max(1, Math.min(500, +l.qty || 1)),
        color: l.color || 'blanc', notes: (l.notes || []).slice(0, 12), freeNote: String(l.freeNote || '').slice(0, 500),
        photos: Math.max(0, Math.min(20, +l.photos || 0)), variantId: l.variantId || null,
      })),
      pieces: (o.pieces || []).map((p) => ({
        pid: p.pid, n: p.n, of: p.of, lineIdx: p.lineIdx, label: p.label, itemId: p.itemId,
        svcs: (p.svcs || []).slice(0, 8), color: p.color || 'blanc', notes: (p.notes || []).slice(0, 12),
        freeNote: String(p.freeNote || '').slice(0, 500), status: p.status, photos: Math.max(0, Math.min(20, +p.photos || 0)),
      })),
      droppedAt: o.droppedAt instanceof Date ? o.droppedAt.toISOString() : o.droppedAt,
      readyAt: o.readyAt instanceof Date ? o.readyAt.toISOString() : o.readyAt,
      pay: o.pay ? { mode: o.pay.mode || 'pickup', method: o.pay.method || null, paid: Math.max(0, +o.pay.paid || 0) } : { mode: 'pickup', method: null, paid: 0 },
      rack: o.rack || null,
      total: orderTotals(o).total,
      notified: !!o.notified,
      collectedAt: o.collectedAt instanceof Date ? o.collectedAt.toISOString() : (o.collectedAt || null),
      updatedAt: +o.updatedAt || 0,
    };
  }
  function payloadHash(value) {
    const copy = { ...value };
    delete copy.updatedAt;
    return JSON.stringify(copy);
  }
  function pressingDocument() {
    const now = Date.now();
    const customers = CUSTOMERS.slice(0, 2000).map((c) => {
      const row = { ...c, id: String(c.id || '').slice(0, 40), name: String(c.name || '').slice(0, 100), phone: String(c.phone || '').slice(0, 40), prefs: (c.prefs || []).slice(0, 20), updatedAt: +c.updatedAt || 0 };
      const h = payloadHash(row);
      if (persistedCustomerHashes[row.id] !== h) row.updatedAt = c.updatedAt = now;
      persistedCustomerHashes[row.id] = h;
      return row;
    });
    const ordered = ORDERS.filter((o) => orderStatus(o) !== 'livre').concat(ORDERS.filter((o) => orderStatus(o) === 'livre'));
    const orders = ordered.slice(0, 500).map((o) => {
      const row = orderPayload(o);
      const h = payloadHash(row);
      if (persistedOrderHashes[row.id] !== h) row.updatedAt = o.updatedAt = now;
      persistedOrderHashes[row.id] = h;
      return row;
    });
    return { customers, orders, seq: ticketSeq, updatedAt: now };
  }
  function readPressingDocument() {
    const k = pressingStoreKey();
    if (!k) return null;
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; }
  }
  function restorePressingDocument(doc) {
    if (!pvReal() || !doc || !Array.isArray(doc.orders) || !Array.isArray(doc.customers)) return false;
    CUSTOMERS.splice(0, CUSTOMERS.length);
    Object.keys(CUST).forEach((k) => { delete CUST[k]; });
    doc.customers.slice(0, 2000).forEach((raw) => {
      if (!raw || !raw.id || !raw.name) return;
      const c = { ...raw, id: String(raw.id).slice(0, 40), name: String(raw.name).slice(0, 100), phone: String(raw.phone || '').slice(0, 40), prefs: Array.isArray(raw.prefs) ? raw.prefs.slice(0, 20) : [] };
      CUSTOMERS.push(c); CUST[c.id] = c;
      persistedCustomerHashes[c.id] = payloadHash(c);
    });
    ORDERS.splice(0, ORDERS.length);
    doc.orders.slice(0, 500).forEach((raw) => {
      if (!raw || !raw.id || !Array.isArray(raw.lines) || !raw.lines.length) return;
      const lines = raw.lines.filter((l) => l && ITEMS[l.itemId]).map((l) => {
        const row = {
          itemId: l.itemId, services: Array.isArray(l.services) ? l.services.filter((s) => SERVICES.some((x) => x.id === s)).slice(0, 8) : [],
          qty: Math.max(1, Math.min(500, +l.qty || 1)), color: COLOR[l.color] ? l.color : 'blanc',
          notes: Array.isArray(l.notes) ? l.notes.map((n) => String(n).slice(0, 100)).slice(0, 12) : [],
          freeNote: String(l.freeNote || '').slice(0, 500), photos: Math.max(0, Math.min(20, +l.photos || 0)), variantId: l.variantId || null,
          label: String(l.label || ITEMS[l.itemId].label).slice(0, 100),
        };
        row.unitPrice = Number.isFinite(+l.unitPrice) && +l.unitPrice >= 0 ? +l.unitPrice : lineUnit(row);
        return row;
      }).filter((l) => l.services.length);
      if (!lines.length) return;
      const o = {
        id: String(raw.id).slice(0, 40), custId: raw.custId && CUST[raw.custId] ? raw.custId : null,
        guest: raw.guest && { name: String(raw.guest.name || 'Client de passage').slice(0, 100), phone: String(raw.guest.phone || '').slice(0, 40) },
        b2b: !!raw.b2b, lines, droppedAt: new Date(raw.droppedAt), readyAt: new Date(raw.readyAt),
        pay: raw.pay && { mode: raw.pay.mode, method: raw.pay.method || null, paid: Math.max(0, +raw.pay.paid || 0) },
        rack: raw.rack ? String(raw.rack).slice(0, 20) : null, notified: !!raw.notified,
        collectedAt: raw.collectedAt ? new Date(raw.collectedAt) : null, updatedAt: +raw.updatedAt || 0,
      };
      if (!Number.isFinite(o.droppedAt.getTime())) o.droppedAt = new Date();
      if (!Number.isFinite(o.readyAt.getTime())) o.readyAt = suggestReady();
      if (!o.pay) o.pay = { mode: 'pickup', method: null, paid: 0 };
      o.pieces = buildPieces(o.id, lines, null);
      if (Array.isArray(raw.pieces)) o.pieces.forEach((p, i) => {
        const saved = raw.pieces.find((x) => x && x.pid === p.pid) || raw.pieces[i];
        if (saved && STATUS[saved.status]) p.status = saved.status;
      });
      ORDERS.push(o);
      persistedOrderHashes[o.id] = payloadHash(orderPayload(o));
    });
    ticketSeq = Math.max(ticketSeq, +doc.seq || 0, 1);
    Object.keys(rackSlots).forEach((k) => { delete rackSlots[k]; });
    ORDERS.forEach((o) => { if (o.rack && !rackSlots[o.rack]) rackSlots[o.rack] = o.id; });
    return true;
  }
  function mergePressingDocuments(mine, theirs) {
    const mergeRows = (a, b) => {
      const byId = Object.create(null);
      (b || []).concat(a || []).forEach((row) => {
        if (!row || !row.id) return;
        const old = byId[row.id];
        if (!old || (+row.updatedAt || 0) >= (+old.updatedAt || 0)) byId[row.id] = row;
      });
      return Object.values(byId);
    };
    return {
      customers: mergeRows(mine && mine.customers, theirs && theirs.customers),
      orders: mergeRows(mine && mine.orders, theirs && theirs.orders),
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
      updatedAt: Math.max(+(mine && mine.updatedAt) || 0, +(theirs && theirs.updatedAt) || 0),
    };
  }
  function writePressingDocument(doc, refresh) {
    const k = pressingStoreKey();
    if (!k || !doc) return false;
    try { localStorage.setItem(k, JSON.stringify(doc)); } catch (_) { return false; }
    restorePressingDocument(doc);
    if (refresh && root) { refreshOps(); }
    return true;
  }
  function pressingCloud() {
    if (pressingCloudHandle || !window.KiwiCloudDoc || !pvReal()) return pressingCloudHandle;
    pressingCloudHandle = KiwiCloudDoc.attach({
      feature: 'pressing-orders', slug: () => pressingScope(), localKey: pressingStoreKey,
      read: () => readPressingDocument() || { customers: [], orders: [], seq: ticketSeq, updatedAt: 0 },
      write: (doc) => writePressingDocument(doc, true), merge: mergePressingDocuments,
      isEmpty: (doc) => !doc || (!doc.orders?.length && !doc.customers?.length),
      onPulled: () => { if (root) { renderBadges(); refreshOps(); } },
    });
    return pressingCloudHandle;
  }
  function persistPressing() {
    if (!pvReal()) return;
    const doc = pressingDocument();
    const k = pressingStoreKey();
    if (k) { try { localStorage.setItem(k, JSON.stringify(doc)); } catch (_) {} }
    const cloud = pressingCloud();
    if (cloud) cloud.push();
  }
  /* Share only a tenant-scoped operational snapshot with the owner dashboard.
     The till remains the source of truth for the detailed ticket; the bridge
     strips it to the fields the dashboard needs and never includes a PIN. */
  function syncOwnerOps() {
    if (!pvReal()) return;
    persistPressing();
    if (!window.KiwiPressingOps) return;
    try {
      KiwiPressingOps.replace(ORDERS, {
        customer: custOf,
        total: function (o) { return orderTotals(o).total; },
      });
    } catch (_) {}
  }
  function queueIfOffline(label) {
    pressingOps?.save?.(label || 'operation');
    state.offline = browserOffline();
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  const tkLabel = (o) => {
    const l = o.lines[0];
    if (!l) return 'Pressing';
    const nm = l.label || (ITEMS[l.itemId] ? ITEMS[l.itemId].label : 'Pressing');
    const n = o.lines.reduce((s, x) => s + x.qty, 0);
    return o.lines.length > 1 ? `${nm} +${n - l.qty} pièces` : nm;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le comptoir encaissait dans o.pay, et ORDERS meurt avec l'onglet : la
     recette du jour n'existait nulle part. Démo : no-op. */
  /* Deux caisses du même commerce partaient du même compteur local et
     imprimaient toutes les deux le même numéro le même jour. L'étiquette de
     terminal (KiwiPosSale.stamp) les sépare : T-642-A7 vs T-642-K3. En démo,
     pas d'étiquette — les captures et la démonstration restent lisibles. */
  function posRef(n) {
    try { return (window.KiwiPosSale && window.KiwiPosSale.isReal()) ? window.KiwiPosSale.stamp(n) : n; }
    catch (_) { return n; }
  }
  function postDay(total, method, label, ref, lines) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('pressing', { total, method, label, ref, lines });
    } catch (_) {}
  }
  /* Le numéro de bon repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à P-1045 et deux commandes différentes portent le
     même numéro, sur les pièces comme sur le rack. Démo : aucun effet. */
  try { if (window.KiwiPosSale) ticketSeq = window.KiwiPosSale.nextSeq('pressing', ticketSeq); } catch (_) {}

  /* ═══════════════════════ ROOT ═══════════════════════ */
  /* La racine vient du dispatcher (<div class="vx-screen" id="pos-pressing">) —
   * on y ajoute `px-screen` pour les tokens et le prefixe maison, puis on
   * construit l'intérieur. Plus d'appendChild : la couche, l'animation
   * d'entrée et le verrouillage appartiennent au dispatcher. */
  let root = null;
  function build(rootEl) {
    pressingOps?.hydrate?.();
    root = rootEl;
    root.classList.add('px-screen');
    root.innerHTML = `
      <aside class="px-rail">
        <div class="px-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div>
        <div class="px-venue">
          <div class="px-venue-name">${esc(pvName('Pressing Marshan'))}</div>
          <div class="px-venue-sub">${pvReal() ? esc((pvPaired() || {}).location || '') : 'Tanger · Marshan<br>Le même Kiwi pour <b>votre comptoir et votre atelier</b>, un seul compte.'}</div>
        </div>
        <nav class="px-nav" id="px-nav">
          <button class="px-nav-it on" data-px-view="comptoir">${materialIcon('counter')}<span>Comptoir</span></button>
          <button class="px-nav-it" data-px-view="commandes">${materialIcon('orders')}<span>Commandes</span><b class="px-nav-badge" id="px-badge-cmd"></b></button>
          <button class="px-nav-it" data-px-view="retrait">${materialIcon('pickup')}<span>Retrait</span><b class="px-nav-badge" id="px-badge-rt"></b></button>
          <button class="px-nav-it" data-px-view="rangement">${materialIcon('rack')}<span>Rangement</span><b class="px-nav-badge" id="px-badge-rack"></b></button>
          <button class="px-nav-it" data-px-view="tarifs">${materialIcon('prices')}<span>Services &amp; tarifs</span></button>
        </nav>
        <div class="px-rail-foot">
          <button class="px-net" id="px-net" title="État réseau détecté par cet appareil">
            <i class="px-net-dot"></i><span class="px-net-label">En ligne</span>
          </button>
          <button class="px-lock" id="px-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="px-main">
        <div class="px-offline-note" id="px-offline-note" hidden>
          Hors-ligne, les changements restent sur cette tablette et seront reproposés au retour du réseau.
          <b id="px-queue-count"></b>
        </div>
        <section class="px-view is-on" data-px-panel="comptoir">
          <div class="px-intake">
            <header class="px-head">
              <div><h1>Comptoir de dépôt</h1><div class="px-head-sub" id="px-today"></div></div>
              <div class="px-head-tools">
                <div class="px-head-hint"><b id="px-catalog-count"></b> articles · touchez pour ajouter</div>
                <label class="px-catalog-search">
                  <i data-lucide="search" aria-hidden="true"></i>
                  <input id="px-catalog-search" type="search" autocomplete="off" placeholder="Trouver un article" aria-label="Rechercher un article">
                </label>
              </div>
            </header>
            <div class="px-cats" id="px-cats"></div>
            <div class="px-grid-scroll" id="px-gridwrap"></div>
          </div>
          <aside class="px-ticket" id="px-ticket"></aside>
        </section>
        <section class="px-view" data-px-panel="commandes"></section>
        <section class="px-view" data-px-panel="retrait"></section>
        <section class="px-view" data-px-panel="rangement"></section>
        <section class="px-view" data-px-panel="tarifs"><div class="px-tarifs-panel" id="px-tarifs"></div></section>
      </main>
      <div class="modal-veil" id="px-sheet-veil"><div class="modal px-sheet px-rel" id="px-sheet"></div></div>
      <div class="modal-veil" id="px-client-veil"><div class="modal px-client px-rel" id="px-clientm"></div></div>
      <div class="modal-veil" id="px-date-veil"><div class="modal px-datem px-rel" id="px-datemm"></div></div>
      <div class="modal-veil" id="px-tags-veil"><div class="modal px-tags px-rel" id="px-tagsm"></div></div>
      <div class="modal-veil" id="px-pay-veil"><div class="modal px-pay px-rel" id="px-paym"></div></div>
      <div class="modal-veil" id="px-detail-veil"><div class="modal px-detail px-rel" id="px-detailm"></div></div>
      <div class="modal-veil" id="px-wa-veil"><div class="modal px-wa px-rel" id="px-wam"></div></div>
      <div class="modal-veil" id="px-photo-veil"><div class="modal px-photo" id="px-photom"></div></div>
      <div class="modal-veil" id="px-scan-veil"><div class="modal px-scan px-rel" id="px-scanm"></div></div>`;

    $('#px-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-px-view]');
      if (b) switchView(b.dataset.pxView);
    });
    $('#px-lock', root).addEventListener('click', lock);
    $('#px-net', root).addEventListener('click', toggleOffline);
    $('#px-catalog-search', root).addEventListener('input', (event) => {
      state.catalogQuery = event.target.value || '';
      renderGrid();
      icons();
    });
    /* fermer un modal en cliquant le voile */
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => {
        if (e.target !== v) return;
        if (v.id === 'px-scan-veil') stopScanner();
        closeVeil(v);
      });
    });
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ UNLOCK / LOCK ═══════════════════════ */
  /* Le dispatcher possède la chorégraphie : points du PIN, fondu de l'écran,
   * flash de salutation (qui sait déjà taire le prénom de démo et nommer le
   * vrai commerce), classes body, animation d'entrée. Il ne reste ici que
   * l'état du comptoir. */
  function enter() {
    state.unlocked = true;
    state.offline = browserOffline();
    if (!state.ticket) freshTicket();
    /* A dashboard quick action can ask the till to land directly on Retrait or
       Rangement after the operator unlocks it. One-shot session state: it does
       not bypass the PIN and cannot strand later visits on an old subsection. */
    try {
      const requested = sessionStorage.getItem('kiwiPressingStartView');
      sessionStorage.removeItem('kiwiPressingStartView');
      if (['comptoir', 'commandes', 'retrait', 'rangement', 'tarifs'].includes(requested)) state.view = requested;
    } catch (_) {}
    renderAll();
  }

  function lock() {
    if (window.KiwiPosDispatch) { window.KiwiPosDispatch.lock(); return; }
    /* Filet : le module peut être chargé seul (tests, page isolée). */
    document.body.classList.remove('is-pos', 'is-pos-pressing', 'is-unlocked');
    if (root) {
      root.classList.remove('is-on');
      root.setAttribute('aria-hidden', 'true');
      $$('.modal-veil.is-open', root).forEach((v) => v.classList.remove('is-open'));
    }
    if (typeof window.__kiwiPinReset === 'function') window.__kiwiPinReset();
    toast('Terminal verrouillé');
  }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.px-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.pxView === view));
    $$('.px-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.pxPanel === view));
    if (view === 'commandes') renderBoard();
    if (view === 'retrait') renderRetrait();
    if (view === 'rangement') renderRack();
    if (view === 'tarifs') renderTarifs();
    icons();
  }
  function renderTarifs() {
    const host = $('#px-tarifs', root);
    if (!host) return;
    if (!window.KiwiPressingCatalog || !KiwiPressingCatalog.mountEditor) {
      host.innerHTML = '<div class="px-bempty">Catalogue indisponible. Rafraîchissez la caisse.</div>';
      return;
    }
    KiwiPressingCatalog.mountEditor(host, { compact: true });
  }
  function renderBadges() {
    const active = ORDERS.filter((o) => orderStatus(o) !== 'livre').length;
    const prets  = ORDERS.filter((o) => orderStatus(o) === 'pret').length;
    const toRack = ORDERS.filter((o) => orderStatus(o) === 'pret' && !o.rack).length;
    $('#px-badge-cmd', root).textContent = active || '';
    $('#px-badge-rt', root).textContent = prets || '';
    $('#px-badge-rack', root).textContent = toRack || '';
    $('#px-badge-cmd', root).style.display = active ? '' : 'none';
    $('#px-badge-rt', root).style.display = prets ? '' : 'none';
    $('#px-badge-rack', root).style.display = toRack ? '' : 'none';
  }

  function renderAll() {
    $('#px-today', root).textContent = fmtDT(new Date());
    renderCats();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ COMPTOIR — the visual intake grid ═══════════════════════ */
  function counterCatalog() {
    return CATALOG.map((c) => ({ ...c, items: c.items.filter((it) => it.active !== false) })).filter((c) => c.items.length);
  }
  function renderCats() {
    const visible = counterCatalog();
    const counts = Object.fromEntries(visible.map((c) => [c.id, c.items.length]));
    const all = visible.reduce((s, c) => s + c.items.length, 0);
    $('#px-cats', root).innerHTML =
      `<button class="px-cat ${state.cat === 'tous' ? 'on' : ''}" data-px-cat="tous">Tous <span class="px-cat-ct">${all}</span></button>` +
      visible.map((c) =>
        `<button class="px-cat ${state.cat === c.id ? 'on' : ''}" data-px-cat="${c.id}">${esc(c.label)} <span class="px-cat-ct">${counts[c.id]}</span></button>`
      ).join('');
    $('#px-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-px-cat]');
      if (!b) return;
      state.cat = b.dataset.pxCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function renderGrid() {
    const visible = counterCatalog();
    const cats = state.cat === 'tous' ? visible : visible.filter((c) => c.id === state.cat);
    const query = state.catalogQuery.trim().toLocaleLowerCase('fr');
    const rows = cats.flatMap((category) => category.items.map((item) => ({ category, item }))).filter(({ category, item }) => {
      if (!query) return true;
      return [item.label, item.sub, category.label].some((value) => String(value || '').toLocaleLowerCase('fr').includes(query));
    });
    let i = 0;
    const count = $('#px-catalog-count', root);
    if (count) count.textContent = rows.length;
    $('#px-gridwrap', root).innerHTML = rows.length ? `
      <div class="px-grid px-grid-all">${rows.map(({ category, item: it }) => `
        <button class="px-card" data-px-item="${it.id}" style="--i:${i++}">
          <span class="px-card-art">${garmentIcon(it)}</span>
          <span class="px-card-cat">${esc(category.label)}</span>
          <span class="px-card-name">${esc(it.label)}</span>
          <span class="px-card-price">dès ${minPrice(it)} MAD${it.sub ? ` · ${esc(it.sub)}` : ''}</span>
          ${it.flag ? `<span class="px-card-flag">${esc(it.flag)}</span>` : ''}
        </button>`).join('')}
      </div>` : `<div class="px-grid-empty"><i data-lucide="search-x"></i><b>Aucun article trouvé</b><span>Essayez un autre nom ou choisissez une autre catégorie.</span></div>`;
    $('#px-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-px-item]');
      if (b) openSheet(b.dataset.pxItem);
    };
  }

  /* ═══════════════════════ TICKET (running) ═══════════════════════ */
  function ticketCount(t) {
    return t.lines.reduce((s, ln) => {
      const item = ITEMS[ln.itemId];
      /* Une variante n'a pas forcément de pièces nommées : les paliers de
         taille d'un tapis (petit / moyen / grand) sont des variantes de PRIX,
         pas de découpe. Sans ce garde-fou, ajouter un tapis au ticket plantait
         le comptoir — même règle qu'à buildPieces(), qui retombe déjà sur une
         seule étiquette quand `pieces` manque. */
      const variant = item.variants && (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]);
      const per = (variant && Array.isArray(variant.pieces) && variant.pieces.length) || 1;
      return s + ln.qty * per;
    }, 0);
  }
  function ticketTotals(t) {
    const sub = t.lines.reduce((s, ln) => s + lineTotal(ln), 0);
    const b2b = t.customer && t.customer.type === 'known' && CUST[t.customer.id] && CUST[t.customer.id].b2b;
    const remise = b2b ? Math.round(sub * B2B_REMISE) : 0;
    return { sub, remise, total: sub - remise, b2b };
  }

  function customerRow(t) {
    if (!t.customer) {
      return `<button class="px-tk-row" id="px-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher un client</b><span>Recherche par téléphone, jamais par ticket</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.customer.type === 'guest') {
      return `<button class="px-tk-row is-set" id="px-tk-client"><i data-lucide="user"></i>
        <span class="l"><b>Client de passage</b><span>Sans fiche, retrouvable par n° de ticket</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = t.customer.type === 'known' ? CUST[t.customer.id] : t.customer;
    const prefs = (c.prefs && c.prefs.length) ? ` · ${c.prefs[0]}` : '';
    return `<button class="px-tk-row is-set" id="px-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${esc(c.phone || 'sans téléphone')}${c.orders ? ` · ${c.orders} commandes` : ' · nouveau'}${esc(prefs)}</span></span>
      ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const { remise, total, b2b } = ticketTotals(t);
    const count = ticketCount(t);
    const el = $('#px-ticket', root);
    el.innerHTML = `
      <div class="px-tk-head">
        <div><span class="px-tk-title">Ticket</span> <span class="px-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="px-tk-reset" id="px-tk-reset">Vider</button>` : ''}
      </div>
      <div class="px-tk-meta">
        ${customerRow(t)}
        <button class="px-tk-row ${t.ready ? 'is-set' : ''}" id="px-tk-date"><i data-lucide="calendar-clock"></i>
          <span class="l"><b>Prêt le ${esc(fmtDT(t.ready))}</b><span>Date de retrait, modifiable</span></span>
          <span class="edit">Modifier</span></button>
      </div>
      <div class="px-tk-lines" id="px-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="px-tk-empty">
            <i data-lucide="shirt"></i>
            <div>Le ticket est vide.<br>Touchez un vêtement dans la grille, chaque pièce recevra son étiquette.</div>
          </div>`}
      </div>
      <div class="px-tk-foot">
        <div class="px-tk-tot">
          <span class="pcs"><i data-lucide="tag"></i> ${count} pièce${count > 1 ? 's' : ''} · ${count} étiquette${count > 1 ? 's' : ''}</span>
          ${remise ? `<span>Remise B2B –15 % · −${fmtMAD(remise).replace(' MAD', '')} MAD</span>` : ''}
        </div>
        <div class="px-tk-total"><span class="lbl">Total${b2b ? ' (remisé)' : ''}</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="px-validate" id="px-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="tags"></i> Valider · étiquettes &amp; ticket
        </button>
      </div>`;
    const reset = $('#px-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); };
    $('#px-tk-client', el).onclick = openClient;
    $('#px-tk-date', el).onclick = openDate;
    $('#px-validate', el).onclick = validateTicket;
    $('#px-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-px-minus]');
      const plus = e.target.closest('[data-px-plus]');
      const idx = minus ? +minus.dataset.pxMinus : plus ? +plus.dataset.pxPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        if (ln.qty >= MAX_QTY) { toast(`Maximum ${MAX_QTY} pièces par ligne`); return; }
        ln.qty++;
      }
      else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons();
    };
    icons();
  }

  function lineRow(ln, i) {
    const item = ITEMS[ln.itemId];
    const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]) : null;
    const notesCt = ln.notes.length + (ln.freeNote ? 1 : 0);
    return `<div class="px-line">
        <span class="px-line-art">${garmentIcon({ ...item, variantId: ln.variantId })}</span>
      <span class="px-line-mid">
        <span class="px-line-name">${esc(ln.label || item.label)}${variant ? ` · ${esc(variant.label)}` : ''}</span>
        <span class="px-line-sub">
          <i class="dot" style="background:${COLOR[ln.color] ? COLOR[ln.color].hex : '#ccc'}"></i>
          <span class="svc">${svcCodes(ln.services)}</span> ${esc(svcShorts(ln.services))}
          ${notesCt ? `<span class="meta"><i data-lucide="sticky-note"></i>${notesCt}</span>` : ''}
          ${ln.photos ? `<span class="meta"><i data-lucide="camera"></i>${ln.photos}</span>` : ''}
        </span>
      </span>
      <span class="px-line-right">
        <span class="px-line-price">${fmtMAD(lineTotal(ln))}</span>
        <span class="px-line-qty">
          <button data-px-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-px-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* ═══════════════════════ CONFIG SHEET ═══════════════════════ */
  const sheet = { itemId: null, services: [], variantId: null, qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0, photoData: [] };

  function defaultService(item, variantId) {
    const avail = availServices(item, variantId);
    return (item.def && avail.some((s) => s.id === item.def)) ? item.def : avail[0].id;
  }

  function openSheet(itemId) {
    const item = ITEMS[itemId];
    Object.assign(sheet, {
      itemId,
      variantId: item.variants ? item.variants[0].id : null,
      services: [], qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0, photoData: [],
    });
    sheet.services = [defaultService(item, sheet.variantId)];
    renderSheet();
    openVeil('#px-sheet-veil');
    icons();
    if (window.KiwiLens) KiwiLens.rescan();
  }

  function sheetUnit() {
    const t = priceTable(ITEMS[sheet.itemId], sheet.variantId);
    return sheet.services.reduce((s, sv) => s + (t[sv] || 0), 0);
  }

  function renderSheet() {
    const item = ITEMS[sheet.itemId];
    const avail = availServices(item, sheet.variantId);
    /* un changement de variante peut retirer des services du tarif */
    sheet.services = sheet.services.filter((sv) => avail.some((s) => s.id === sv));
    if (!sheet.services.length) sheet.services = [defaultService(item, sheet.variantId)];
    const unit = sheetUnit();
    const el = $('#px-sheet', root);
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-sheet-head">
        <span class="px-sheet-art">${garmentIcon({ ...item, variantId: sheet.variantId })}</span>
        <span class="px-sheet-title"><h3>${esc(item.label)}</h3><span class="sub">${esc(CATALOG.find((c) => c.id === item.cat).label)}${item.sub ? ` · ${esc(item.sub)}` : ''}</span></span>
        <span class="px-sheet-price"><span class="val" id="px-sheet-total">${fmtMAD(unit * sheet.qty)}</span><span class="per">${unit} MAD × ${sheet.qty}</span></span>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Service <span class="opt">· combinables, ex. lavage + repassage</span></div>
        <div class="px-seg is-multi" id="px-svc-seg">
          ${avail.map((s) => `<button class="px-seg-it ${sheet.services.includes(s.id) ? 'on' : ''}" data-px-svc="${s.id}" aria-pressed="${sheet.services.includes(s.id)}">${esc(s.short)}<small>${priceTable(item, sheet.variantId)[s.id]} MAD</small></button>`).join('')}
        </div>
      </div>

      <div class="px-row-2">
        ${item.variants ? `<div class="px-f">
          <div class="px-f-lbl">${item.id === 'costume' ? 'Pièces du costume' : 'Taille'}</div>
          <div class="px-seg" data-lens-demo id="px-var-seg">
            ${item.variants.map((v) => `<button class="px-seg-it ${v.id === sheet.variantId ? 'on' : ''}" data-lens-item data-px-var="${v.id}">${esc(v.label)}${v.pieces ? `<small>${v.pieces.length} étiquettes</small>` : ''}</button>`).join('')}
          </div>
        </div>` : ''}
        <div class="px-f">
          <div class="px-f-lbl">Quantité</div>
          <div class="px-stepper">
            <button id="px-qty-minus" aria-label="Moins">−</button>
            <b id="px-qty-val">${sheet.qty}</b>
            <button id="px-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Couleur</div>
        <div class="px-colors" id="px-colors">
          ${COLORS.map((c) => `<button type="button" class="px-color ${c.id === sheet.color ? 'on' : ''}" data-px-color="${c.id}" data-c="${c.id}" style="background:${c.hex}" title="${esc(c.label)}" aria-label="${esc(c.label)}" aria-pressed="${c.id === sheet.color}"></button>`).join('')}
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Notes usuelles <span class="opt">· optionnel</span></div>
        <div class="px-chips" id="px-notes">
          ${NOTES.map((n) => `<button type="button" class="px-chip ${sheet.notes.includes(n) ? 'on' : ''}" data-px-note="${esc(n)}" aria-pressed="${sheet.notes.includes(n)}">${esc(n)}</button>`).join('')}
        </div>
        <input class="px-note-free" id="px-note-free" placeholder="Note libre (ex. « ourlet 2 cm »)…" value="${esc(sheet.freeNote)}" />
      </div>

      <div class="px-f">
        <div class="px-f-lbl">État à la dépose <span class="opt">· la photo protège le client et vous</span></div>
        <div class="px-photos" id="px-photos">
          ${(sheet.photoData || []).map((photo, k) => `<span class="px-photo-thumb"><img src="${photo.dataUrl}" alt="État ${k + 1}"><b>${k + 1}</b></span>`).join('')}
          <button class="px-photo-add" id="px-photo-add"><i data-lucide="camera"></i>Photo état</button>
        </div>
      </div>

      <div class="px-sheet-foot">
        <button class="px-btn secondary" data-px-close>Annuler</button>
        <button class="px-btn primary" id="px-sheet-add"><i data-lucide="plus"></i>Ajouter au ticket · <span id="px-sheet-cta-price">${fmtMAD(unit * sheet.qty)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#px-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#px-sheet-cta-price', el).textContent = fmtMAD(u * sheet.qty);
      $('.px-sheet-price .per', el).textContent = `${u} MAD × ${sheet.qty}`;
      $('#px-qty-val', el).textContent = sheet.qty;
    };

    $('#px-svc-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-px-svc]');
      if (!b) return;
      const id = b.dataset.pxSvc;
      const i = sheet.services.indexOf(id);
      if (i >= 0) {
        if (sheet.services.length === 1) return;          /* toujours ≥ 1 service */
        sheet.services.splice(i, 1);
      } else {
        /* déposer les services incompatibles (sec ⟷ lavage/repassage) */
        (SVC_CONFLICTS[id] || []).forEach((c) => {
          const j = sheet.services.indexOf(c);
          if (j >= 0) sheet.services.splice(j, 1);
        });
        sheet.services.push(id);
      }
      $$('[data-px-svc]', el).forEach((x) => {
        const on = sheet.services.includes(x.dataset.pxSvc);
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
      refreshPrice();
    };
    const varSeg = $('#px-var-seg', el);
    if (varSeg) varSeg.onclick = (e) => {
      const b = e.target.closest('[data-px-var]');
      if (!b) return;
      sheet.variantId = b.dataset.pxVar;
      renderSheet(); icons();             /* les prix par service changent */
      if (window.KiwiLens) KiwiLens.rescan();
    };
    $('#px-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    $('#px-qty-plus', el).onclick = () => {
      if (sheet.qty >= MAX_QTY) { toast(`Maximum ${MAX_QTY} pièces par ligne`); return; }
      sheet.qty++; refreshPrice();
    };
    $('#px-colors', el).onclick = (e) => {
      const b = e.target.closest('[data-px-color]');
      if (!b) return;
      sheet.color = b.dataset.pxColor;
      $$('[data-px-color]', el).forEach((x) => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
    };
    $('#px-notes', el).onclick = (e) => {
      const b = e.target.closest('[data-px-note]');
      if (!b) return;
      const n = b.dataset.pxNote;
      const i = sheet.notes.indexOf(n);
      if (i >= 0) sheet.notes.splice(i, 1); else sheet.notes.push(n);
      b.classList.toggle('on', i < 0);
      b.setAttribute('aria-pressed', i < 0);
    };
    $('#px-note-free', el).oninput = (e) => { sheet.freeNote = e.target.value; };
    $('#px-photo-add', el).onclick = openPhoto;
    $('#px-sheet-add', el).onclick = addSheetToTicket;
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-sheet-veil'); });
  }

  function addSheetToTicket() {
    state.ticket.lines.push({
      itemId: sheet.itemId, variantId: sheet.variantId, services: sheet.services.slice(),
      qty: clampQty(sheet.qty), color: sheet.color, notes: sheet.notes.slice(), freeNote: sheet.freeNote.trim(),
      photos: (sheet.photoData || []).length,
      photoData: (sheet.photoData || []).slice(),
    });
    closeVeil('#px-sheet-veil');
    const item = ITEMS[sheet.itemId];
    toast(`${item.label} × ${sheet.qty} · ${svcShorts(sheet.services)}, sur le ticket`);
    renderTicket(); icons();
  }

  /* Condition photo — native camera/file picker, then a compact local proof. */
  function openPhoto() {
    const item = ITEMS[sheet.itemId];
    const el = $('#px-photom', root);
    el.innerHTML = `
      <div class="px-vf">
        <div class="px-vf-hint">Cadrez la zone (tache, accroc, bouton)…</div>
        ${garmentIcon({ ...item, variantId: sheet.variantId },'art')}
        <span class="px-vf-corner tl"></span><span class="px-vf-corner tr"></span>
        <span class="px-vf-corner bl"></span><span class="px-vf-corner br"></span>
        <div class="px-vf-flash" id="px-vf-flash"></div>
      </div>
      <div class="px-vf-foot">
        <button class="px-shutter" id="px-shutter" aria-label="Prendre la photo"></button>
        <button class="px-vf-close" id="px-vf-close">Fermer</button>
      </div>`;
    openVeil('#px-photo-veil');
    $('#px-shutter', el).onclick = async () => {
      if (!window.KiwiImageProof) { toast('Appareil photo indisponible'); return; }
      try {
        const photo = await KiwiImageProof.pick({ maxDimension: 640, quality: 0.58 });
        if (!photo) return;
        const flash = $('#px-vf-flash', el);
        flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
        sheet.photoData = sheet.photoData || [];
        sheet.photoData.push(photo);
        sheet.photos = sheet.photoData.length;
        setTimeout(() => {
          closeVeil('#px-photo-veil');
          renderSheet(); icons();
          if (window.KiwiLens) KiwiLens.rescan();
          toast(`Photo état ${sheet.photos} enregistrée, jointe à la pièce`);
        }, 220);
      } catch (_) { toast('Photo non enregistrée · vérifiez l’accès à l’appareil'); }
    };
    $('#px-vf-close', el).onclick = () => closeVeil('#px-photo-veil');
  }

  /* ═══════════════════════ CLIENT — phone-first ═══════════════════════ */
  function openClient() {
    const el = $('#px-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const digits = phoneDigits(q);
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && phoneDigits(c.phone).includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">Au pressing on cherche par téléphone, le client n'a jamais son ticket.</p>
        <div class="px-phone-in"><i data-lucide="phone"></i>
          <input id="px-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="px-cl-results" id="px-cl-results">
            ${hits.map((c) => `
              <button class="px-cl-row" data-px-cl="${c.id}">
                <span class="px-cl-ava ${c.b2b ? 'b2b' : ''}">${c.b2b ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
                <span class="px-cl-mid">
                  <span class="px-cl-name">${esc(c.name)} ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}</span>
                  <span class="px-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="px-cl-right"><b>${c.orders} cmd</b>${dueOf(c) ? `<span class="due">solde ${fmtMAD(dueOf(c))}</span>` : ''}</span>
              </button>`).join('') || `<div class="px-bempty">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="px-cl-new" id="px-cl-new"><i data-lucide="user-plus"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="px-sheet-foot" style="margin-top:10px;">
            <button class="px-btn ghost" id="px-cl-guest">Client de passage, sans fiche</button>
          </div>` : `
          <div class="px-cl-form">
            <input class="px-in" id="px-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="px-in" id="px-cl-tel" inputmode="tel" autocomplete="tel" placeholder="Téléphone · 06…, +212…, +33…, +49…" value="${esc(/^[\d\s().+-]+$/.test(q || '') ? q : '')}" />
            <div class="px-sheet-foot" style="margin-top:4px;">
              <button class="px-btn secondary" id="px-cl-back">Retour</button>
              <button class="px-btn primary" id="px-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#px-cl-q', el).oninput = (e) => { render(e.target.value); icons(); $('#px-cl-q', el).focus(); moveCaretEnd($('#px-cl-q', el)); };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-client-veil'); });
      $$('[data-px-cl]', el).forEach((b) => {
        b.onclick = () => {
          state.ticket.customer = { type: 'known', id: b.dataset.pxCl };
          closeVeil('#px-client-veil');
          const c = CUST[b.dataset.pxCl];
          toast(c.b2b ? `${c.name}, compte B2B, remise –15 % appliquée` : `${c.name}, ${c.orders} commandes, bienvenue`);
          renderTicket(); icons();
        };
      });
      const newBtn = $('#px-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#px-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.ticket.customer = { type: 'guest' };
        closeVeil('#px-client-veil');
        renderTicket(); icons();
      };
      const back = $('#px-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#px-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#px-cl-name', el).value.trim();
        const tel = normalizePhone($('#px-cl-tel', el).value);
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        if (!tel) { toast('Numéro valide requis · pour l’étranger, ajoutez + et l’indicatif pays'); return; }
        const existing = CUSTOMERS.find((c) => phoneDigits(c.phone) === phoneDigits(tel));
        if (existing) { toast(`Ce numéro appartient déjà à ${existing.name}`); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, orders: 0, prefs: [] };
        CUSTOMERS.unshift(c); CUST[id] = c;
        persistPressing();
        state.ticket.customer = { type: 'known', id };
        pressingOps?.save?.('customer-created');
        closeVeil('#px-client-veil');
        toast(`Fiche créée, ${name}`);
        renderTicket(); icons();
      };
    };
    render('');
    openVeil('#px-client-veil');
    icons();
    setTimeout(() => { const i = $('#px-cl-q', el); if (i) i.focus(); }, 60);
  }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function dueOf(c) {
    return ORDERS.filter((o) => o.custId === c.id && orderStatus(o) !== 'livre' && o.pay.mode !== 'compte')
      .reduce((s, o) => s + Math.max(0, orderTotals(o).total - o.pay.paid), 0);
  }
  function recoPanel(c) {
    const hist = ORDERS.filter((o) => o.custId === c.id).slice(0, 2);
    return `<div class="px-reco">
      <div class="px-reco-head"><i data-lucide="sparkles"></i>${esc(c.name)}, client reconnu</div>
      <div class="px-reco-rows">
        ${(c.prefs || []).map((p) => `<div class="px-reco-row"><i data-lucide="heart"></i>${esc(p)}</div>`).join('')}
        ${c.contact ? `<div class="px-reco-row"><i data-lucide="user"></i>${esc(c.contact)}</div>` : ''}
        ${hist.map((o) => `<div class="px-reco-row"><i data-lucide="history"></i><b>${o.id}</b> · ${o.pieces.length} pièces · ${STATUS[orderStatus(o)].label}</div>`).join('')}
      </div>
    </div>`;
  }
  function moveCaretEnd(input) {
    const v = input.value; input.value = ''; input.value = v;
  }

  /* ═══════════════════════ READY DATE ═══════════════════════ */
  function openDate() {
    const el = $('#px-datemm', root);
    const now = new Date();
    const beforeCutoff = now.getHours() < 13;
    const opts = readyOptions(now);
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-date-kicker">PROMESSE CLIENT</div>
      <h3 class="modal-title">Prêt pour quand ?</h3>
      <p class="modal-subtle">Choisissez un créneau réaliste. Il sera imprimé sur le ticket et suivi par l'atelier.</p>
      <div class="px-date-status ${beforeCutoff ? 'is-express' : ''}">
        <i data-lucide="${beforeCutoff ? 'sun' : 'clock-3'}"></i>
        <div><b>${beforeCutoff ? "Dépôt du matin" : "L'express du jour est fermé"}</b><span>${beforeCutoff ? "Le retrait aujourd'hui reste possible jusqu'à 18:00." : "Après 13:00, Kiwi propose directement les prochains créneaux tenables."}</span></div>
      </div>
      <div class="px-date-chips">
        ${opts.map((o, i) => `<button class="px-date-chip ${Math.abs(o.d - state.ticket.ready) < 60000 ? 'on' : ''}" data-px-d="${i}" aria-label="${esc(o.label)}">
          <span class="px-date-day">${esc(o.day)}</span><b>${esc(o.time)}</b><span class="px-date-meta">${esc(o.sub)}</span>${o.recommended ? '<em>RECOMMANDÉ</em>' : ''}<i data-lucide="check"></i>
        </button>`).join('')}
      </div>
      <div class="px-date-divider"><span>Autre date</span></div>
      <div class="px-date-custom">
        <input class="px-in" id="px-date-input" type="datetime-local" min="${localDT(new Date(Date.now() + 60000))}" value="${localDT(state.ticket.ready)}" />
        <button class="px-btn primary" id="px-date-ok">Valider</button>
      </div>`;
    openVeil('#px-date-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-date-veil'); });
    $$('[data-px-d]', el).forEach((b) => {
      b.onclick = () => {
        const ready = opts[+b.dataset.pxD].d;
        if (!validReady(ready)) { toast('Choisissez une date de retrait dans le futur'); return; }
        state.ticket.ready = ready;
        closeVeil('#px-date-veil');
        renderTicket(); icons();
      };
    });
    $('#px-date-ok', el).onclick = () => {
      const v = $('#px-date-input', el).value;
      const ready = v ? new Date(v) : null;
      if (!validReady(ready)) { toast('La date de retrait doit être dans le futur'); return; }
      state.ticket.ready = ready;
      closeVeil('#px-date-veil');
      renderTicket(); icons();
    };
  }
  function localDT(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  /* ═══════════════════════ VALIDATE → TAGS + RECEIPT ═══════════════════════ */
  function validateTicket() {
    const t = state.ticket;
    if (!t.lines.length) return;
    if (!t.customer) { openClient(); toast("Attachez d'abord le client (ou « passage »)"); return; }
    if (!validReady(t.ready)) { openDate(); toast('Choisissez une date de retrait dans le futur'); return; }
    const order = {
      id: t.num,
      custId: t.customer.type === 'known' ? t.customer.id : null,
      guest: t.customer.type === 'guest' ? { name: 'Client de passage', phone: '' } : null,
      b2b: ticketTotals(t).b2b,
      lines: t.lines.map((l) => ({ ...l, label: ITEMS[l.itemId].label, unitPrice: lineUnit(l), notes: l.notes.slice() })),
      droppedAt: new Date(), readyAt: t.ready,
      pay: { mode: null, method: null, paid: 0 },
      rack: null, notified: false, collectedAt: null,
    };
    order.pieces = buildPieces(order.id, order.lines, null);
    openTags(order, { fresh: true });
  }

  /* En-tête du ticket. L'enseigne, l'adresse et les identifiants légaux
   * viennent de la fiche établissement partagée (assets/receipt.js), la même
   * que la boutique : un vrai pressing imprimait jusqu'ici « PRESSING MARSHAN,
   * Rue Assad Ibn Al Fourat, Tanger » sur SES tickets. Les lignes de la démo
   * ne servent plus que de repli quand aucune fiche n'existe. */
  function receiptHead() {
    const K = window.KiwiReceipt;
    const b = (K && K.business) ? K.business() : null;
    const L = (b && b.legal) || {};
    const name = (b && (b.tradeName || b.name)) || pvName('Pressing Marshan');
    const rows = [];
    const addr = [L.address, L.city].filter(Boolean).join(', ');
    if (addr) rows.push(esc(addr));
    else if (!pvReal()) rows.push('Rue Assad Ibn Al Fourat, Tanger');
    if (L.phone) rows.push(esc(L.phone));
    const ids = [
      L.ice     && 'ICE ' + L.ice,
      L.fiscal  && 'IF ' + L.fiscal,
      L.rc      && 'RC ' + L.rc,
      L.patente && 'Patente ' + L.patente,
    ].filter(Boolean).map(esc);
    if (ids.length) rows.push(ids.join(' · '));
    rows.push('propulsé par Kiwi');
    return `<div class="c b lg">${esc(String(name).toUpperCase())}</div>
      <div class="c mut">${rows.join('<br>')}</div>`;
  }

  function receiptHTML(o, copyLabel) {
    const c = custOf(o);
    const { sub, remise, total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `<div class="px-receipt">
      <div class="px-receipt-copy${copyLabel ? ' is-workshop' : ''}">${copyLabel || 'EXEMPLAIRE CLIENT'}</div>
      ${receiptHead()}
      <hr>
      <div class="row"><span>Ticket</span><span class="b">${o.id}</span></div>
      <div class="row"><span>Client</span><span>${esc(c.name)}</span></div>
      ${c.phone ? `<div class="row"><span>Tél</span><span>${esc(c.phone)}</span></div>` : ''}
      <div class="row"><span>Déposé</span><span>${fmtDT(o.droppedAt)}</span></div>
      <div class="row b"><span>PRÊT LE</span><span>${fmtDT(o.readyAt)}</span></div>
      <hr>
      ${o.lines.map((ln) => {
        const item = ITEMS[ln.itemId];
        const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]).label : '';
        return `<div class="row"><span class="nm">${ln.qty} × ${esc(ln.label || item.label)}${variant ? ` (${esc(variant)})` : ''} · ${svcCodes(ln.services)}</span><span>${lineTotal(ln)}</span></div>`;
      }).join('')}
      <hr>
      <div class="row"><span>Sous-total</span><span>${sub} MAD</span></div>
      ${remise ? `<div class="row"><span>Remise B2B –15 %</span><span>−${remise} MAD</span></div>` : ''}
      <div class="row tot"><span>TOTAL</span><span>${total} MAD</span></div>
      ${o.pay.mode === 'compte' ? `<div class="row"><span>Règlement</span><span>SUR COMPTE</span></div>` :
        `<div class="row"><span>Payé</span><span>${o.pay.paid} MAD</span></div>
         ${due ? `<div class="row due"><span>SOLDE AU RETRAIT</span><span>${due} MAD</span></div>` : ''}`}
      <div class="row"><span>Pièces</span><span>${o.pieces.length} · ${o.pieces.length} étiq.</span></div>
      <hr>
      <div class="c">${barcode(o.id, 26)}</div>
      <div class="c mut">${o.id} · merci, l'lah ikhellik</div>
    </div>`;
  }

  function tagHTML(p, o) {
    const care = [...(p.notes || []), p.freeNote].filter(Boolean);
    return `<div class="px-tag">
      <div class="px-tag-top"><span class="px-tag-num">${o.id}</span><span class="px-tag-i">pièce ${p.n}/${p.of}</span></div>
      <div class="px-tag-item"><strong>${esc(p.label)}</strong><span aria-hidden="true">·</span><span class="svc">${svcCodes(p.svcs)}</span></div>
      ${care.length ? `<div class="px-tag-care">ATTENTION · ${care.map(esc).join(' · ')}</div>` : ''}
      ${barcode(p.pid, 26)}
      <div class="px-tag-id">${p.pid}</div>
    </div>`;
  }

  /* Impression réelle du ticket de dépôt et des étiquettes.
   *
   * Ce bouton n'imprimait rien. Il affichait « Envoyé, ticket (80 mm) +
   * étiquettes (imprimante thermique) » qu'une imprimante existe ou non — sur
   * un comptoir sans thermique appairée, il annonçait à chaque dépôt un ticket
   * qui n'est jamais sorti, et la caissière ne s'en apercevait qu'en cherchant
   * le papier. Il imprime maintenant, et quand il ne peut pas il le dit.
   *
   * Deux chemins, jamais les deux en même temps (deux boîtes de dialogue
   * empilées, c'est pire que pas d'impression) :
   *   · thermique appairée → ESC/POS, le ticket client, son duplicata atelier,
   *                          puis les étiquettes ;
   *   · rien d'appairé     → le pilote du système, les deux tickets ET les
   *                          étiquettes sur la même page (« Enregistrer en PDF »
   *                          compris).
   * Les étiquettes partent en code128 : un identifiant de pièce comme
   * « K2418-3 » n'est pas un EAN-13 et ne s'encode pas comme tel. */
  function printOrderDocs(order) {
    const KP = window.KiwiPrinter;
    if (!KP) { toast('Impression indisponible sur cet appareil'); return; }
    const n = order.pieces.length;
    const plural = n > 1 ? 's' : '';

    if (!(KP.isConnected && KP.isConnected() && window.KiwiEscPos)) {
      KP.browserPrintHTML(
        `<div class="px-print"><div class="px-print-receipts">${receiptHTML(order)}${receiptHTML(order, 'DUPLICATA · ATELIER')}</div>${order.pieces.map((p) => tagHTML(p, order)).join('')}</div>`,
        (KP.getConfig && KP.getConfig().paper) || '80'
      );
      toast(`Impression système, ticket + duplicata + ${n} étiquette${plural}`);
      return;
    }

    const K = window.KiwiReceipt;
    const b = (K && K.business) ? K.business() : null;
    const L = (b && b.legal) || {};
    const { total } = orderTotals(order);
    const doc = {
      shop: (b && (b.tradeName || b.name)) || pvName('Pressing Marshan'),
      address: [L.address, L.city].filter(Boolean).join(', '),
      phone: L.phone || '',
      ref: order.id,
      date: fmtDT(order.droppedAt),
      lines: order.lines.map((ln) => {
        const item = ITEMS[ln.itemId];
        const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]).label : '';
        return { qty: ln.qty, name: `${ln.label || item.label}${variant ? ` (${variant})` : ''} · ${svcCodes(ln.services)}`, price: lineTotal(ln) };
      }),
      total: `${total} MAD`,
      method: order.pay.mode === 'compte' ? 'Sur compte' : (order.pay.paid ? `${order.pay.paid} MAD payés` : 'Solde au retrait'),
      footer: `PRÊT LE ${fmtDT(order.readyAt)} · ${n} pièce${plural}`,
    };

    const duplicate = {
      ...doc,
      copy: 'DUPLICATA · ATELIER',
    };

    const labels = order.pieces.map((p) => ({
      title: `${order.id}  ${p.n}/${p.of}`,
      sub: `${p.label} · ${svcCodes(p.svcs)}`,
      code: p.pid,
      format: 'code128',
    }));

    toast('Impression…');
    Promise.resolve(KP.printReceipt(doc))
      .then((r) => {
        if (!r || !r.ok) { toast('Ticket non imprimé, imprimante injoignable'); return null; }
        return KP.printReceipt(duplicate);
      })
      .then((r) => {
        if (r === null) return null;
        if (!r || !r.ok) { toast('Ticket client imprimé, duplicata non imprimé'); return null; }
        return KP.printLabels(labels);
      })
      .then((r) => {
        if (r === null) return;
        toast(r && r.ok
          ? `Ticket + duplicata + ${n} étiquette${plural} imprimés`
          : `Tickets imprimés, ${n} étiquette${plural} non imprimée${plural}`);
      })
      .catch(() => toast('Impression échouée'));
  }

  function openTags(order, ctx) {
    const el = $('#px-tagsm', root);
    const fresh = ctx && ctx.fresh;
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Ticket, duplicata &amp; étiquettes · ${order.id}</h3>
      <p class="modal-subtle">Le client garde son ticket. Le duplicata atelier reste avec la commande. Chaque pièce reçoit une étiquette lisible et scannable.</p>
      <div class="px-tags-grid">
        <div class="px-receipts-preview">${receiptHTML(order)}${receiptHTML(order, 'DUPLICATA · ATELIER')}</div>
        <div class="px-tags-list">${order.pieces.map((p) => tagHTML(p, order)).join('')}</div>
      </div>
      <div class="px-tags-note"><i data-lucide="shield-check"></i>Sur chaque étiquette : commande, pièce, article, service et code à scanner. Rien d'autre.</div>
      <div class="px-tags-foot">
        <button class="px-btn secondary" id="px-tags-print"><i data-lucide="printer"></i>Imprimer 2 tickets + ${order.pieces.length} étiq.</button>
        ${fresh
          ? `<button class="px-btn primary" id="px-tags-pay"><i data-lucide="banknote"></i>Encaissement</button>`
          : `<button class="px-btn primary" data-px-close><i data-lucide="check"></i>Fermer</button>`}
      </div>`;
    openVeil('#px-tags-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-tags-veil'); });
    $('#px-tags-print', el).onclick = () => printOrderDocs(order);
    const payBtn = $('#px-tags-pay', el);
    if (payBtn) payBtn.onclick = () => { closeVeil('#px-tags-veil'); openPay(order, { fresh: true }); };
  }

  /* ═══════════════════════ PAYMENT — now / acompte / pickup / compte ═══════════════════════ */
  const paymentCommits = new Set();
  function openPay(order, ctx) {
    const el = $('#px-paym', root);
    const { total } = orderTotals(order);
    const cust = custOf(order);
    const due = Math.max(0, total - order.pay.paid);
    const fresh = ctx && ctx.fresh;
    const settle = ctx && ctx.settle;          /* encaisser un solde existant */
    const amountBase = settle ? due : total;
    const commitKey = settle ? `settle:${order.id}:${order.pay.paid}` : `fresh:${order.id}`;
    let committed = false;
    let authorizationPending = false;
    const closePay = () => {
      if (authorizationPending) { toast('Paiement carte en cours · attendez la réponse du lecteur'); return; }
      closeVeil('#px-pay-veil');
    };
    const beginCommit = () => {
      if (committed || paymentCommits.has(commitKey)) return false;
      committed = true;
      paymentCommits.add(commitKey);
      return true;
    };

    const step1 = () => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${settle ? 'Encaisser le solde' : 'Encaissement'}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="modal-amount size-md">${fmtMAD(amountBase)}</div>
        <div class="px-pay-opts">
          ${settle ? '' : `
          <button class="px-pay-opt" data-px-paymode="now">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Payer maintenant</b><span>Espèces ou carte à la dépose</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          <button class="px-pay-opt" data-px-paymode="acompte" ${total < 10 ? 'disabled' : ''}>
            <span class="ic"><i data-lucide="coins"></i></span>
            <span class="l"><b>Acompte à la dépose</b><span>${total < 10 ? 'Minimum 10 MAD · indisponible pour ce ticket' : 'Le reste au retrait'}</span></span>
          </button>
          <button class="px-pay-opt is-usual" data-px-paymode="pickup">
            <span class="ic"><i data-lucide="hand-coins"></i></span>
            <span class="l"><b>Payer au retrait</b><span>Le classique du pressing, solde sur le ticket</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          ${cust.b2b ? `
          <button class="px-pay-opt" data-px-paymode="compte">
            <span class="ic"><i data-lucide="building-2"></i></span>
            <span class="l"><b>Sur compte B2B</b><span>${esc(cust.name)}, facture fin de mois</span></span>
          </button>` : ''}`}
          ${settle ? `
          <button class="px-pay-opt" data-px-method="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="px-pay-opt" data-px-method="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
          </button>` : ''}
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = closePay; });
      $$('[data-px-paymode]', el).forEach((b) => {
        b.onclick = () => {
          const mode = b.dataset.pxPaymode;
          if (mode === 'pickup') {
            order.pay = { mode: 'pickup', method: null, paid: 0 };
            finishFresh(`Solde ${fmtMAD(total)} à encaisser au retrait`);
          } else if (mode === 'compte') {
            order.pay = { mode: 'compte', method: 'compte', paid: 0 };
            finishFresh('Sur compte B2B, ajouté à la facture du mois');
          } else if (mode === 'acompte') {
            if (total < 10) { toast('Un acompte doit être d’au moins 10 MAD'); return; }
            stepAcompte();
          } else {
            stepMethod(total, 'now');
          }
        };
      });
      $$('[data-px-method]', el).forEach((b) => {
        b.onclick = () => (b.dataset.pxMethod === 'especes' ? stepCash(amountBase, 'settle') : stepCard(amountBase, 'settle'));
      });
    };

    const stepAcompte = () => {
      let acompte = Math.min(total, Math.max(10, Math.round(total / 2 / 10) * 10));
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Acompte</h3>
        <p class="modal-subtle">${order.id} · total ${fmtMAD(total)}</p>
        <div class="modal-amount size-md" id="px-ac-val">${fmtMAD(acompte)}</div>
        <div class="px-acompte-row">
          <button class="cash-preset" data-px-ac="20" ${total < 20 ? 'disabled' : ''}>20</button>
          <button class="cash-preset" data-px-ac="50" ${total < 50 ? 'disabled' : ''}>50</button>
          <button class="cash-preset" data-px-ac="100" ${total < 100 ? 'disabled' : ''}>100</button>
          <button class="cash-preset" data-px-ac="half">50 %</button>
        </div>
        <div class="cash-input-row" style="margin:10px 0 14px;">
          <label class="cash-input-label" for="px-ac-input">Montant</label>
          <input class="cash-input mono" id="px-ac-input" type="number" inputmode="numeric" min="10" max="${total}" step="5" value="${acompte}" />
        </div>
        <p class="modal-subtle" id="px-ac-why" aria-live="polite"></p>
        <div class="px-sheet-foot">
          <button class="px-btn secondary" id="px-ac-back">Retour</button>
          <button class="px-btn primary" id="px-ac-ok">Encaisser l'acompte</button>
        </div>`;
      icons();
      const refresh = (writeInput) => {
        $('#px-ac-val', el).textContent = Number.isFinite(acompte) ? fmtMAD(acompte) : '—';
        if (writeInput) $('#px-ac-input', el).value = acompte;
        const good = validDeposit(acompte, total);
        $('#px-ac-ok', el).disabled = !good;
        /* Un bouton grisé sans explication, c'est une caissière qui re-tape le
           même montant trois fois. On dit POURQUOI il est grisé, pendant qu'elle
           tape — pas au moment où elle appuie. */
        $('#px-ac-why', el).textContent = good ? ''
          : !Number.isFinite(acompte) ? 'Entrez un montant.'
            : acompte < 10 ? `Acompte minimum 10 MAD — il manque ${fmtMAD(10 - acompte)}.`
              : `Un acompte ne peut pas dépasser le total de ${fmtMAD(total)}.`;
      };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = closePay; });
      $$('[data-px-ac]', el).forEach((b) => {
        b.onclick = () => {
          acompte = b.dataset.pxAc === 'half' ? Math.max(10, Math.round(total / 2 / 5) * 5) : +b.dataset.pxAc;
          acompte = Math.min(total, acompte);
          refresh(true);
        };
      });
      $('#px-ac-input', el).oninput = (e) => { acompte = Number(e.target.value); refresh(false); };
      $('#px-ac-back', el).onclick = step1;
      $('#px-ac-ok', el).onclick = () => {
        if (!validDeposit(acompte, total)) { toast(`Acompte requis entre 10 et ${fmtMAD(total)}`); return; }
        stepMethod(acompte, 'acompte');
      };
      refresh(false);
    };

    const stepMethod = (amount, mode) => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${mode === 'acompte' ? 'Acompte' : 'Paiement'} · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="px-pay-opts" style="margin-top:8px;">
          <button class="px-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="px-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = closePay; });
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.m === 'especes' ? stepCash(amount, mode) : stepCard(amount, mode));
      });
    };

    const stepCash = (amount, mode) => {
      let received = amount;
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="px-cash-in">Espèces reçues</label>
            <input class="cash-input mono" id="px-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="px-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="px-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#px-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#px-cash-ok', el).disabled = received < amount;
      };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = closePay; });
      $('#px-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#px-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#px-cash-ok', el).onclick = () => done(amount, 'especes', mode, Math.max(0, received - amount));
    };

    const stepCard = (amount, mode) => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="px-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="px-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = closePay; });
      /* Le pressing peignait la coche verte au bout d'un timer : sur une vraie
         caisse sans lecteur configuré, il déclarait donc « Khlass ! Paiement
         confirmé » pour un paiement que personne n'avait autorisé, et la
         commande partait payée. KiwiHardware.authorizeCard est l'adaptateur
         partagé des quinze autres métiers — il ne peint la réussite qu'après
         un approved=true, et en production sans terminal il refuse. */
      setTimeout(() => {
        const disc = $('#px-reader-disc', el);
        const st = $('#px-reader-status', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) {
          disc.classList.remove('is-pulsing');
          st.textContent = 'Paiement non confirmé · lecteur indisponible';
          return;
        }
        authorizationPending = true;
        let authorization;
        try {
          authorization = hw.authorizeCard(amount, disc, st);
        } catch (_) {
          authorizationPending = false;
          disc.classList.remove('is-pulsing');
          st.textContent = 'Paiement non confirmé · erreur lecteur';
          return;
        }
        Promise.resolve(authorization).then((result) => {
          authorizationPending = false;
          icons();
          if (!result || !result.approved) { toast('Paiement carte non confirmé'); return; }
          setTimeout(() => done(amount, 'carte', mode, 0), 900);
        }).catch(() => {
          authorizationPending = false;
          disc.classList.remove('is-pulsing');
          st.textContent = 'Paiement non confirmé · erreur lecteur';
        });
      }, 1200);
    };

    const done = (amount, method, mode, rendu) => {
      if (!(Number.isFinite(+amount) && +amount > 0)) { toast('Montant de paiement invalide'); return; }
      if (mode === 'acompte' && !validDeposit(amount, total)) { toast(`Acompte requis entre 10 et ${fmtMAD(total)}`); return; }
      if (settle) {
        const remaining = Math.max(0, total - order.pay.paid);
        if (!(remaining > 0) || +amount > remaining + 0.009) { toast('Ce solde est déjà encaissé'); return; }
        if (!beginCommit()) return;
        order.pay.paid += amount;
        order.pay.method = method;
        pressingOps?.save?.('balance-paid');
        /* Le solde du « payer au retrait » est l'argent qui rentre vraiment :
           c'est ici qu'il devient une recette, pas à la prise de la commande. */
        postDay(amount, method, `Solde ${order.id} · ${custOf(order).name}`, order.id, saleLines(order, amount));
        syncOwnerOps();
        closeVeil('#px-pay-veil');
        toast(`Solde encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        if (ctx && typeof ctx.onSettled === 'function') ctx.onSettled();
        return;
      }
      order.pay = { mode, method, paid: amount };
      pressingOps?.save?.('payment-recorded');
      finishFresh(mode === 'acompte'
        ? `Acompte ${fmtMAD(amount)} encaissé, solde ${fmtMAD(total - amount)} au retrait`
        : `Encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    };

    const finishFresh = (msg) => {
      if (!beginCommit()) return;
      closeVeil('#px-pay-veil');
      /* `pickup` et `compte` passent aussi par ici avec paid: 0 : ils ne
         prennent rien au comptoir. Seul l'argent réellement encaissé (paiement
         complet ou acompte) est une recette, le solde sera journalisé par la
         branche `settle` au retrait. */
      if (order.pay.paid > 0) postDay(order.pay.paid, order.pay.method, tkLabel(order), order.id, saleLines(order, order.pay.paid));
      if (fresh) {
        ORDERS.unshift(order);
        if (order.custId && CUST[order.custId]) CUST[order.custId].orders = (+CUST[order.custId].orders || 0) + 1;
        /* Persist the NEXT available number, never the one just printed. This
           matters most for pay-at-pickup tickets: no sale journal entry exists
           yet to rescue nextSeq() after a reload. */
        ticketSeq++;
        syncOwnerOps();
        freshTicket();
        renderTicket();
        renderBadges();
        queueIfOffline(`Commande ${order.id}`);
        toast(`${order.id} enregistrée, prête ${fmtDT(order.readyAt)}`);
      }
      toast(msg);
      icons();
    };

    step1();
    openVeil('#px-pay-veil');
  }

  /* ═══════════════════════ TABLEAU DES COMMANDES ═══════════════════════ */
  const STATUS_DOT_HEX = { recu: 'var(--ink-4)', trait: '#D99A2B', pret: 'var(--emerald)', livre: 'var(--line)' };

  function payPill(o) {
    const { total } = orderTotals(o);
    if (o.pay.mode === 'compte') return '<span class="px-pill ok">Compte B2B</span>';
    const due = Math.max(0, total - o.pay.paid);
    if (due <= 0) return '<span class="px-pill ok">Payé</span>';
    if (o.pay.paid > 0) return `<span class="px-pill warn">Acompte · solde ${due} MAD</span>`;
    return `<span class="px-pill due">Au retrait · ${due} MAD</span>`;
  }

  function matchesQuery(o, q) {
    if (!q) return true;
    const c = custOf(o);
    /* Le client dicte son numéro comme il l'a en tête : « zéro six… » ou
       « plus deux cent douze six… ». Les deux doivent trouver la même commande,
       donc on ramène la RECHERCHE au même format local que la fiche avant de
       comparer — sinon +212 6… ne retrouvait jamais un 06… enregistré. */
    const digits = searchDigits(q);
    return o.id.toLowerCase().includes(q.toLowerCase()) ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (digits.length >= 2 && searchDigits(c.phone || '').includes(digits));
  }

  function orderCard(o) {
    const c = custOf(o);
    const late = isLate(o);
    const st = orderStatus(o);
    const when = st === 'livre'
      ? `remis ${fmtDay(o.collectedAt || o.readyAt)}`
      : `prêt ${fmtDT(o.readyAt)}`;
    return `<button class="px-ocard ${late ? 'is-late' : ''}" data-px-order="${o.id}">
      <span class="px-ocard-top"><span class="px-ocard-num">${o.id}</span>
        <span class="px-ocard-when ${late ? 'late' : ''}">${late ? 'EN RETARD · ' : ''}${esc(when)}</span></span>
      <span class="px-ocard-client"><i data-lucide="${o.b2b ? 'building-2' : 'user'}"></i>${esc(c.name)}</span>
      <span class="px-ocard-meta">
        <span class="px-pill"><i data-lucide="tag"></i>${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}</span>
        ${payPill(o)}
        ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
        ${o.notified && st === 'pret' ? '<span class="px-pill wa">Notifié</span>' : ''}
      </span>
      <span class="px-piece-dots">${o.pieces.map((p) => `<i class="px-pdot ${p.status}"></i>`).join('')}</span>
    </button>`;
  }

  function renderBoard() {
    const panel = $('[data-px-panel="commandes"]', root);
    const q = state.boardQuery;
    panel.innerHTML = `
      <div class="px-board">
        <header class="px-head">
          <div><h1>Tableau des commandes</h1><div class="px-head-sub">Chaque pièce a son statut, pas seulement le ticket</div></div>
          <div class="px-search"><i data-lucide="search"></i>
            <input id="px-board-q" placeholder="Téléphone, nom ou n° de ticket…" value="${esc(q)}" /></div>
        </header>
        <div class="px-board-cols">
          ${STATUS_FLOW.map((s) => {
            const list = ORDERS.filter((o) => orderStatus(o) === s && matchesQuery(o, q));
            return `<div class="px-bcol">
              <div class="px-bcol-head"><i style="background:${STATUS_DOT_HEX[s]}"></i>${STATUS[s].label} <span class="ct">${list.length}</span></div>
              ${list.map(orderCard).join('') || '<div class="px-bempty">—</div>'}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    $('#px-board-q', panel).oninput = (e) => {
      state.boardQuery = e.target.value;
      renderBoard(); icons();
      const i = $('#px-board-q', panel); i.focus(); moveCaretEnd(i);
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-px-order]');
      if (b) openDetail(b.dataset.pxOrder);
    };
    icons();
  }

  /* ---------- détail commande + statuts par pièce ---------- */
  function openDetail(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    /* On retient la commande affichée pour que refreshOps() puisse la
       repeindre : sans ça, une remise au client ou une libération de cintre
       déclenchée ailleurs laissait la fiche ouverte sur un état périmé. */
    state.detailId = o.id;
    const el = $('#px-detailm', root);
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    const st = orderStatus(o);
    const delivered = st === 'livre';
    const carePieces = o.pieces.map((p) => ({ p, care: [...(p.notes || []), p.freeNote].filter(Boolean) })).filter((x) => x.care.length);

    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-dt-head">
        <div>
          <h3>${o.id}</h3>
          <div class="px-dt-sub">${esc(c.name)} ${c.phone ? `<span class="tel">${esc(c.phone)}</span>` : ''}
            ${o.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
            <span class="px-pill ${st === 'pret' ? 'ok' : st === 'trait' ? 'warn' : ''}">${STATUS[st].label}</span>
            ${isLate(o) ? '<span class="px-pill due">En retard</span>' : ''}
            ${payPill(o)}
            ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
          </div>
          <div class="px-dt-sub" style="margin-top:5px;">Déposé ${fmtDT(o.droppedAt)} · promis ${fmtDT(o.readyAt)}${o.collectedAt ? ` · retiré ${fmtDT(o.collectedAt)}` : ''}</div>
        </div>
      </div>
      ${carePieces.length ? `<div class="px-dt-care-summary"><i data-lucide="triangle-alert"></i><div><b>${carePieces.length} pièce${carePieces.length > 1 ? 's' : ''} avec instruction${carePieces.length > 1 ? 's' : ''} à respecter</b><span>${carePieces.map((x) => `${esc(x.p.label)} : ${x.care.map(esc).join(' · ')}`).join(' — ')}</span></div></div>` : ''}
      <div class="px-dt-grid">
        ${o.pieces.map((p, i) => {
          const care = [...(p.notes || []), p.freeNote].filter(Boolean);
          return `
          <div class="px-piece">
            <span class="px-piece-art">${garmentIcon({ ...(ITEMS[p.itemId] || {}), variantId: p.variantId })}</span>
            <span class="px-piece-mid">
              <span class="px-piece-name"><i class="dot" style="background:${COLOR[p.color] ? COLOR[p.color].hex : '#ccc'}"></i>${esc(p.label)} · ${esc((COLOR[p.color] || {}).label || 'Couleur non précisée')} · <span style="font-family:var(--mono);font-size:11px;">${svcCodes(p.svcs)}</span></span>
              <span class="px-piece-id">${p.pid}${p.photos ? `<span class="ph"><i data-lucide="camera"></i>${p.photos} photo${p.photos > 1 ? 's' : ''}</span>` : ''}</span>
              ${care.length ? `<span class="px-piece-care"><i data-lucide="triangle-alert"></i>${care.map(esc).join(' · ')}</span>` : ''}
            </span>
            ${delivered || p.status === 'livre'
              ? '<span class="px-pill">Livré</span>'
              : `<span class="px-pstatus">
                  ${['recu', 'trait', 'pret'].map((s) => `<button class="px-pstep ${p.status === s ? 'on ' + s : ''}" data-px-piece="${i}" data-px-st="${s}">${s === 'recu' ? 'Reçu' : s === 'trait' ? 'Trait.' : 'Prêt'}</button>`).join('')}
                </span>`}
          </div>`;
        }).join('')}
      </div>
      <div class="px-dt-actions">
        ${delivered ? '' : `
          ${o.pieces.some((p) => p.status === 'recu') ? '<button class="px-btn secondary" data-px-all="trait"><i data-lucide="loader"></i>Tout en traitement</button>' : ''}
          ${o.pieces.some((p) => p.status !== 'pret' && p.status !== 'livre') ? '<button class="px-btn secondary" data-px-all="pret"><i data-lucide="check-check"></i>Tout prêt</button>' : ''}`}
        <button class="px-btn secondary" id="px-dt-tags"><i data-lucide="printer"></i>Étiquettes</button>
        ${due > 0 && !delivered ? `<button class="px-btn secondary" id="px-dt-pay"><i data-lucide="banknote"></i>Solde · ${due} MAD</button>` : ''}
        ${st === 'pret' ? `<button class="px-btn ${o.notified ? 'secondary' : 'primary'}" id="px-dt-wa"><i data-lucide="message-circle"></i>${o.notified ? 'Re-notifier' : 'WhatsApp « c’est prêt »'}</button>` : ''}
        ${st === 'pret' && o.draftOpenedAt && !o.notified ? '<button class="px-btn primary" id="px-dt-wa-confirm"><i data-lucide="check-check"></i>Confirmer l’envoi</button>' : ''}
        ${st === 'pret' && !o.rack ? '<button class="px-btn primary" id="px-dt-rack"><i data-lucide="archive"></i>Ranger</button>' : ''}
        ${st === 'pret' ? `<button class="px-btn primary" id="px-dt-handover"><i data-lucide="check"></i>${due > 0 ? `Encaisser puis remettre · ${due} MAD` : 'Passer au retrait'}</button>` : ''}
        ${o.rack && !delivered ? '<button class="px-btn ghost" id="px-dt-unrack">Libérer le cintre</button>' : ''}
      </div>`;
    openVeil('#px-detail-veil');
    icons();

    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-detail-veil'); });
    $$('[data-px-piece]', el).forEach((b) => {
      b.onclick = () => {
        const p = o.pieces[+b.dataset.pxPiece];
        const wasPret = orderStatus(o) === 'pret';
        p.status = b.dataset.pxSt;
        queueIfOffline('Statut pièce');
        afterStatusChange(o, wasPret);
      };
    });
    $$('[data-px-all]', el).forEach((b) => {
      b.onclick = () => {
        const wasPret = orderStatus(o) === 'pret';
        o.pieces.forEach((p) => { if (p.status !== 'livre') p.status = b.dataset.pxAll; });
        queueIfOffline('Statut commande');
        afterStatusChange(o, wasPret);
      };
    });
    /* tags/pay veils precede the detail veil in the DOM — close detail first
       so they don't paint underneath it */
    $('#px-dt-tags', el).onclick = () => { closeVeil('#px-detail-veil'); openTags(o, { fresh: false }); };
    const payB = $('#px-dt-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#px-detail-veil');
      openPay(o, { settle: true, onSettled: () => { openDetail(o.id); refreshOps(); } });
    };
    const waB = $('#px-dt-wa', el);
    if (waB) waB.onclick = () => openWa(o);
    const waConfirm = $('#px-dt-wa-confirm', el);
    if (waConfirm) waConfirm.onclick = () => {
      o.notified = true;
      o.notifiedAt = new Date();
      queueIfOffline('Notification client confirmée');
      toast(`${o.id}, notification confirmée`);
      openDetail(o.id); refreshOps();
    };
    const rackB = $('#px-dt-rack', el);
    if (rackB) rackB.onclick = () => {
      closeVeil('#px-detail-veil');
      state.rackSelect = o.id;
      switchView('rangement');
    };
    const handoverB = $('#px-dt-handover', el);
    if (handoverB) handoverB.onclick = () => {
      closeVeil('#px-detail-veil');
      state.rtQuery = o.id;
      switchView('retrait');
    };
    const unrackB = $('#px-dt-unrack', el);
    if (unrackB) unrackB.onclick = () => {
      releaseSlot(o);
      toast(`${o.id}, cintre libéré`);
      openDetail(o.id); refreshOps();
    };
  }

  function afterStatusChange(o, wasPret) {
    const nowSt = orderStatus(o);
    syncOwnerOps();
    /* refreshOps() repeint désormais la fiche ouverte : plus besoin de la
       rouvrir ici, et surtout plus de rendu en double. */
    refreshOps();
    if (nowSt === 'pret' && !wasPret && !o.notified) {
      toast(`${o.id} est prêt, prévenez ${custOf(o).name.split(' ')[0]} ?`);
      setTimeout(() => openWa(o), 450);
    }
  }

  /* re-render whatever ops view is behind the modal + the rail badges */
  function refreshOps() {
    renderBadges();
    if (state.view === 'commandes') renderBoard();
    if (state.view === 'retrait') renderRetrait();
    if (state.view === 'rangement') renderRack();
    /* La fiche ouverte fait partie de « ce qu'il y a à repeindre ». Elle était
       la seule surface oubliée : après une remise au client ou une libération
       de cintre, elle continuait d'annoncer « Prêt », d'afficher le cintre
       rendu et de proposer « Tout prêt » sur une commande déjà partie. On ne
       la rouvre jamais — seulement si elle est déjà à l'écran. */
    if (state.detailId && $('#px-detail-veil', root).classList.contains('is-open')) openDetail(state.detailId);
    icons();
  }

  /* ═══════════════════════ WHATSAPP « C'EST PRÊT » ═══════════════════════ */
  function waMessage(o) {
    const c = custOf(o);
    const first = c.b2b ? c.name : c.name.split(' ')[0];
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `Bonjour ${first}, votre commande ${o.id} (${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}) est prête chez ${pvName('Pressing Marshan')}.`
      + `\nRetrait dès maintenant.`
      + (due > 0 ? `\nSolde à régler au retrait : ${due} MAD.` : '')
      + `\n— envoyé via Kiwi`;
  }

  function openWa(o) {
    const el = $('#px-wam', root);
    const c = custOf(o);
    const photoPiece = o.pieces.find((p) => p.photos > 0) || o.pieces[0];
    let withPhoto = false;
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, c'est prêt</h3>
      <p class="modal-subtle">${esc(c.name)} ${c.phone ? `· ${esc(c.phone)}` : '· numéro manquant (passage)'}</p>
      <div class="px-wa-bubblewrap">
        <div class="px-wa-bubble">
          <textarea id="px-wa-text">${esc(waMessage(o))}</textarea>
          <div class="px-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <button class="px-wa-photo" id="px-wa-photo">
        <span class="th">${garmentIcon({ ...(ITEMS[photoPiece.itemId] || {}), variantId: photoPiece.variantId })}</span>
        <span class="l">Joindre une photo du vêtement fini, le client voit son linge avant de se déplacer</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="px-sheet-foot">
        <button class="px-btn ghost" data-px-close>Plus tard</button>
        <button class="px-btn primary" id="px-wa-send" ${c.phone ? '' : 'disabled'}><i data-lucide="external-link"></i>Ouvrir WhatsApp</button>
      </div>`;
    openVeil('#px-wa-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-wa-veil'); });
    $('#px-wa-photo', el).onclick = () => {
      withPhoto = !withPhoto;
      $('#px-wa-photo', el).classList.toggle('on', withPhoto);
    };
    /* Ce bouton annonçait « WhatsApp envoyé » et marquait la commande notifiée
       alors qu'aucun message ne partait : le client attendait chez lui un
       message qui n'existait pas. Une page web ne peut pas envoyer un WhatsApp
       toute seule, on ouvre donc le brouillon pré-rempli (texte tel qu'édité) et
       c'est le pressing qui appuie sur envoyer. Le lien ne transporte pas la
       photo, on le dit au lieu de le prétendre. */
    $('#px-wa-send', el).onclick = () => {
      const txt = $('#px-wa-text', el);
      const body = txt ? txt.value : waMessage(o);
      const num = whatsappPhone(c.phone);
      if (!num) { toast(`Pas de numéro pour ${c.name}, ajoutez-le à sa fiche`); return; }
      o.draftOpenedAt = new Date();
      closeVeil('#px-wa-veil');
      queueIfOffline('Brouillon WhatsApp');
      let opened = null;
      try {
        opened = window.open('', '_blank');
        if (opened) {
          opened.opener = null;
          opened.location.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(body);
        }
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      if (!opened) { toast('WhatsApp n’a pas pu s’ouvrir, autorisez les fenêtres puis réessayez'); return; }
      toast(`Brouillon WhatsApp ouvert pour ${c.name}${withPhoto ? ' · joignez la photo dans WhatsApp' : ''}`);
      const foot = $('.px-sheet-foot', el);
      foot.innerHTML = `
        <button class="px-btn ghost" data-px-close>Pas encore envoyé</button>
        <button class="px-btn primary" id="px-wa-confirm"><i data-lucide="check"></i>J’ai envoyé le message</button>`;
      icons();
      $('[data-px-close]', foot).onclick = () => closeVeil('#px-wa-veil');
      $('#px-wa-confirm', foot).onclick = () => {
        o.notified = true;
        syncOwnerOps();
        queueIfOffline('Notification WhatsApp confirmée');
        closeVeil('#px-wa-veil');
        toast(`${c.name} marqué comme prévenu`);
        refreshOps();
      };
    };
  }

  /* ═══════════════════════ RETRAIT ═══════════════════════ */
  function renderRetrait() {
    const panel = $('[data-px-panel="retrait"]', root);
    const q = state.rtQuery;
    const active = ORDERS.filter((o) => orderStatus(o) !== 'livre');
    /* Retrait is an operational queue, not an empty search page. With no query
       it shows every ready order; typing or scanning narrows the same truth. */
    const hits = q ? active.filter((o) => matchesQuery(o, q)) : active.filter((o) => orderStatus(o) === 'pret');
    const prets = hits.filter((o) => orderStatus(o) === 'pret');
    const others = q ? hits.filter((o) => orderStatus(o) !== 'pret') : [];
    panel.innerHTML = `
      <div class="px-retrait">
        <div class="px-rt-inner">
          <header class="px-head" style="padding:22px 0 0;">
            <div><h1>Retrait</h1><div class="px-head-sub">${prets.length} commande${prets.length > 1 ? 's' : ''} prête${prets.length > 1 ? 's' : ''} · recherchez, scannez, encaissez si nécessaire, puis confirmez la remise</div></div>
          </header>
          <div class="px-rt-search">
            <div class="px-phone-in"><i data-lucide="phone"></i>
              <input id="px-rt-q" inputmode="tel" placeholder="Téléphone, nom ou n° de ticket" value="${esc(q)}" autocomplete="off" /></div>
          </div>
          <div class="px-rt-or">ou</div>
          <button class="px-rt-scan" id="px-rt-scan"><i data-lucide="scan-line"></i>Scanner ticket ou étiquette</button>
          <div class="px-rt-results">
            ${prets.map(rtCard).join('')}
            ${others.map((o) => `
              <div class="px-rt-card">
                <div class="px-rt-top">
                  <div class="px-rt-who"><b>${o.id} · ${esc(custOf(o).name)}</b><span>${o.pieces.length} pièces · ${STATUS[orderStatus(o)].label}</span></div>
                  <span class="px-pill warn">Pas encore prêt, promis ${fmtDT(o.readyAt)}</span>
                </div>
              </div>`).join('')}
            ${q && !hits.length ? `<div class="px-bempty">Rien pour « ${esc(q)} », vérifiez le numéro, ou cherchez au tableau.</div>` : ''}
            ${!q && !prets.length ? '<div class="px-bempty">Aucune commande prête à remettre pour le moment.</div>' : ''}
          </div>
        </div>
      </div>`;
    $('#px-rt-q', panel).oninput = (e) => {
      state.rtQuery = e.target.value;
      renderRetrait(); icons();
      const i = $('#px-rt-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#px-rt-scan', panel).onclick = openScan;
    $$('[data-px-rt-pay]', panel).forEach((b) => {
      b.onclick = () => {
        const o = findOrder(b.dataset.pxRtPay);
        openPay(o, { settle: true, onSettled: refreshOps });
      };
    });
    $$('[data-px-rt-give]', panel).forEach((b) => {
      b.onclick = () => deliverOrder(b.dataset.pxRtGive);
    });
    $$('[data-px-rt-wa]', panel).forEach((b) => {
      b.onclick = () => openWa(findOrder(b.dataset.pxRtWa));
    });
    $$('[data-px-rt-wa-confirm]', panel).forEach((b) => {
      b.onclick = () => {
        const o = findOrder(b.dataset.pxRtWaConfirm);
        if (!o) return;
        o.notified = true; o.notifiedAt = new Date();
        queueIfOffline('Notification client confirmée');
        renderRetrait(); toast(`${o.id}, notification confirmée`);
      };
    });
    icons();
  }

  function rtCard(o) {
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `<div class="px-rt-card">
      <div class="px-rt-top">
        <div class="px-rt-who"><b>${o.id} · ${esc(c.name)}</b><span>${c.phone ? esc(c.phone) + ' · ' : ''}déposé ${fmtDay(o.droppedAt)}${o.notified ? ' · notifié' : ''}</span></div>
        <div class="px-rt-slot ${o.rack ? '' : 'none'}">${o.rack ? `<b>${o.rack}</b><span>cintre</span>` : '<b>—</b><span>non rangé</span>'}</div>
      </div>
      <div class="px-rt-pieces">
        ${o.pieces.map((p) => {
          const care = [...(p.notes || []), p.freeNote].filter(Boolean);
          return `<div class="px-rt-piece"><i data-lucide="check-circle-2"></i><span>${esc(p.label)} · ${esc((COLOR[p.color] || {}).label || 'Couleur non précisée')} · ${svcCodes(p.svcs)}${care.length ? `<small>Attention · ${care.map(esc).join(' · ')}</small>` : ''}</span><span class="pid">${p.pid}</span></div>`;
        }).join('')}
      </div>
      <div class="px-rt-balance ${due > 0 ? '' : 'paid'}">
        <span>${due > 0 ? 'Solde à encaisser' : o.pay.mode === 'compte' ? 'Sur compte B2B, facture fin de mois' : 'Déjà réglé'}</span>
        <span class="amt">${due > 0 ? fmtMAD(due) : '✓'}</span>
      </div>
      <div class="px-rt-actions">
        ${due > 0 ? `<button class="px-btn secondary" style="flex:1;" data-px-rt-pay="${o.id}"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(due)}</button>` : ''}
        <button class="px-btn primary" style="flex:1;" data-px-rt-give="${o.id}" ${due > 0 ? 'disabled title="Encaissez le solde d’abord"' : ''}><i data-lucide="check"></i>Remettre au client</button>
        ${!o.notified ? `<button class="px-btn ghost" data-px-rt-wa="${o.id}" title="Ouvrir le brouillon WhatsApp"><i data-lucide="message-circle"></i></button>` : ''}
        ${o.draftOpenedAt && !o.notified ? `<button class="px-btn secondary" data-px-rt-wa-confirm="${o.id}"><i data-lucide="check-check"></i>Confirmer envoi</button>` : ''}
      </div>
    </div>`;
  }

  function deliverOrder(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    o.pieces.forEach((p) => { p.status = 'livre'; });
    o.collectedAt = new Date();
    releaseSlot(o);
    syncOwnerOps();
    queueIfOffline('Retrait');
    toast(`${o.id} remis à ${custOf(o).name}, cintre libéré`);
    refreshOps();
  }

  let scannerStop = null;
  function stopScanner() {
    if (!scannerStop) return;
    const stop = scannerStop; scannerStop = null;
    try { stop(); } catch (_) {}
  }
  function findScannedOrder(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/^\*|\*$/g, '');
    if (!code) return null;
    return ORDERS.find((o) => String(o.id).toUpperCase() === code
      || (o.pieces || []).some((p) => String(p.pid).toUpperCase() === code)) || null;
  }
  function acceptScan(raw) {
    const target = findScannedOrder(raw);
    if (!target) { toast('Code inconnu · vérifiez le ticket ou l’étiquette'); return false; }
    if (orderStatus(target) === 'livre') { toast(`${target.id} a déjà été remis au client`); return false; }
    stopScanner();
    closeVeil('#px-scan-veil');
    state.rtQuery = target.id;
    renderRetrait(); icons();
    toast(`Étiquette lue, ${target.id}${target.rack ? ' · cintre ' + target.rack : ''}`);
    return true;
  }
  async function startCameraScan(el) {
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      toast('Caméra-scanner indisponible · utilisez la douchette ou saisissez le code');
      return;
    }
    stopScanner();
    try {
      const supported = window.BarcodeDetector.getSupportedFormats
        ? await window.BarcodeDetector.getSupportedFormats() : ['code_39', 'code_128', 'qr_code'];
      const formats = ['code_39', 'code_128', 'qr_code'].filter((f) => supported.includes(f));
      if (!formats.length) throw new Error('format');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!$('#px-scan-veil', root).classList.contains('is-open')) { stream.getTracks().forEach((t) => t.stop()); return; }
      const stage = $('#px-scan-stage', el);
      stage.innerHTML = '<video id="px-scan-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video><div class="px-scan-laser"></div>';
      const video = $('#px-scan-video', el);
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats });
      let live = true;
      scannerStop = () => { live = false; stream.getTracks().forEach((t) => t.stop()); };
      const frame = async () => {
        if (!live) return;
        try {
          const hits = await detector.detect(video);
          if (hits && hits[0] && acceptScan(hits[0].rawValue)) return;
        } catch (_) {}
        if (live) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } catch (_) {
      stopScanner();
      toast('Caméra non ouverte · autorisez-la ou utilisez la douchette');
    }
  }
  function openScan() {
    stopScanner();
    const el = $('#px-scanm', root);
    el.innerHTML = `
      <button class="px-modal-x" id="px-scan-close" aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Scanner ticket ou étiquette</h3>
      <p class="modal-subtle">La douchette saisit le code automatiquement. Sur téléphone, utilisez la caméra si elle est disponible.</p>
      <div class="px-scan-stage" id="px-scan-stage"><i data-lucide="scan-line" style="width:58px;height:58px;color:var(--mint)"></i></div>
      <div class="cash-input-row"><label class="cash-input-label" for="px-scan-input">N° commande ou étiquette</label>
        <input class="cash-input mono" id="px-scan-input" autocomplete="off" autocapitalize="characters" placeholder="P-1045 ou P-1045-1" />
      </div>
      <div class="px-sheet-foot" style="margin-top:12px">
        <button class="px-btn secondary" id="px-scan-camera"><i data-lucide="camera"></i>Caméra</button>
        <button class="px-btn primary" id="px-scan-accept"><i data-lucide="scan-line"></i>Lire le code</button>
      </div>`;
    openVeil('#px-scan-veil');
    icons();
    const input = $('#px-scan-input', el);
    $('#px-scan-close', el).onclick = () => { stopScanner(); closeVeil('#px-scan-veil'); };
    $('#px-scan-accept', el).onclick = () => acceptScan(input.value);
    $('#px-scan-camera', el).onclick = () => startCameraScan(el);
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); acceptScan(input.value); } };
    setTimeout(() => input.focus(), 50);
  }
  function tagInner(p, o) {
    const c = custOf(o);
    return `<div class="px-tag-top"><span class="px-tag-num">${o.id}</span><span class="px-tag-i">pièce ${p.n}/${p.of}</span></div>
      <div class="px-tag-client">${esc(c.name)}</div>
      <div class="px-tag-item">${esc(p.label)} · <span class="svc">${svcCodes(p.svcs)}</span></div>
      ${barcode(p.pid, 22)}
      <div class="px-tag-id">${p.pid}</div>`;
  }

  /* ═══════════════════════ RANGEMENT (rack) ═══════════════════════ */
  function releaseSlot(o) {
    if (o.rack) { delete rackSlots[o.rack]; o.rack = null; syncOwnerOps(); }
  }
  function assignSlot(o, slot) {
    releaseSlot(o);
    rackSlots[slot] = o.id;
    o.rack = slot;
    syncOwnerOps();
  }

  function renderRack() {
    const panel = $('[data-px-panel="rangement"]', root);
    const queue = ORDERS.filter((o) => orderStatus(o) === 'pret' && !o.rack);
    if (state.rackSelect && !queue.some((o) => o.id === state.rackSelect)) state.rackSelect = null;
    const sel = state.rackSelect;
    panel.innerHTML = `
      <div class="px-rack">
        <div class="px-rack-queue">
          <div class="px-rack-queue-head"><i data-lucide="archive"></i>À ranger <span class="ct">${queue.length}</span></div>
          ${queue.map((o) => `
            <button class="px-qcard ${sel === o.id ? 'on' : ''}" data-px-q="${o.id}">
              <div class="num">${o.id}</div>
              <div class="who">${esc(custOf(o).name)}</div>
              <div class="sub">${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''} · ${o.notified ? 'client notifié' : 'pas encore notifié'}</div>
            </button>`).join('') || '<div class="px-rack-hint">Rien à ranger.<br>Quand une commande passe « prête », elle arrive ici.</div>'}
          ${queue.length ? `<div class="px-rack-hint">${sel ? 'Touchez un emplacement libre →' : 'Sélectionnez une commande, puis son emplacement.'}</div>` : ''}
        </div>
        <div class="px-rails">
          ${RAILS.map((r) => {
            const free = Array.from({ length: RAIL_SIZE }, (_, i) => `${r}-${pad2(i + 1)}`).filter((s) => !rackSlots[s]).length;
            return `<div class="px-rail-row">
              <div class="px-rail-lbl"><i data-lucide="move-horizontal"></i>RAIL ${r}<span class="free">${free} libres</span></div>
              <div class="px-slots">
                ${Array.from({ length: RAIL_SIZE }, (_, i) => {
                  const slot = `${r}-${pad2(i + 1)}`;
                  const oid = rackSlots[slot];
                  if (oid) return `<button class="px-slot is-full" data-px-slot-full="${oid}"><span class="pos">${slot}</span><span class="oid">${oid.replace('P-', '')}</span></button>`;
                  return `<button class="px-slot ${sel ? 'is-target' : ''}" data-px-slot="${slot}"><span class="pos">${slot}</span></button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    panel.onclick = (e) => {
      const qc = e.target.closest('[data-px-q]');
      if (qc) { state.rackSelect = state.rackSelect === qc.dataset.pxQ ? null : qc.dataset.pxQ; renderRack(); icons(); return; }
      const full = e.target.closest('[data-px-slot-full]');
      if (full) { openDetail(full.dataset.pxSlotFull); return; }
      const slot = e.target.closest('[data-px-slot]');
      if (slot && state.rackSelect) {
        const o = findOrder(state.rackSelect);
        assignSlot(o, slot.dataset.pxSlot);
        state.rackSelect = null;
        queueIfOffline('Rangement');
        toast(`${o.id} → cintre ${o.rack}, retrouvable en un scan`);
        renderRack(); renderBadges(); icons();
        const flash = $(`[data-px-slot-full="${o.id}"]`, panel);
        if (flash) flash.classList.add('flash');
      }
    };
    icons();
  }

  /* ═══════════════════════ OFFLINE — browser/network truth ═══════════════════════ */
  function browserOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  function toggleOffline() {
    state.offline = browserOffline();
    if (!state.offline && state.queued) {
      try { pressingOps?.store?.cloud?.()?.flush?.(); } catch (_) {}
    }
    toast(state.offline
      ? 'Connexion absente · les changements restent sur cette tablette'
      : (state.queued ? `${state.queued} changement${state.queued > 1 ? 's' : ''} local${state.queued > 1 ? 'aux' : ''} · envoi serveur relancé` : 'Connexion réseau disponible'));
    renderNet();
  }
  function networkChanged(online) {
    state.offline = !online;
    if (!online) {
      toast('Connexion perdue · la caisse continue et conserve les changements localement');
    } else if (state.queued) {
      try { pressingOps?.store?.cloud?.()?.flush?.(); } catch (_) {}
      toast(`${state.queued} changement${state.queued > 1 ? 's' : ''} conservé${state.queued > 1 ? 's' : ''} · envoi serveur relancé`);
    } else {
      toast('Connexion rétablie');
    }
    renderNet();
  }
  window.addEventListener('offline', () => networkChanged(false));
  window.addEventListener('online', () => networkChanged(true));
  function renderNet() {
    if (!root) return;
    const net = $('#px-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    net.title = 'État réseau détecté par cet appareil';
    $('.px-net-label', net).textContent = state.offline ? 'Hors-ligne' : (state.queued ? 'Envoi en attente' : 'En ligne');
    let q = $('.px-net-queue', net);
    if (state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'px-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#px-offline-note', root);
    note.hidden = !state.offline && !state.queued;
    note.firstChild.textContent = state.offline
      ? 'Hors-ligne, les changements restent sur cette tablette et seront reproposés au retour du réseau. '
      : 'Connexion rétablie, envoi serveur relancé. La copie locale reste conservée. ';
    $('#px-queue-count', root).textContent = state.queued ? `${state.queued} changement${state.queued > 1 ? 's' : ''} local${state.queued > 1 ? 'aux' : ''}` : '';
  }

  /* ═══════════════════════ enregistrement ═══════════════════════ */
  /* Chargé à la demande par le dispatcher au premier 0000 : plus de DOM injecté
   * au démarrage de la caisse restaurant, plus de CSS ni de JS pressing sur le
   * chemin critique des quinze autres métiers. */
  if (window.KiwiPosDispatch) {
    window.KiwiPosDispatch.register({
      id: 'pressing',
      greet: { line1: 'Bonjour Sanae,', em: 'bienvenue.',
               sub: 'Pressing Marshan <em>·</em> comptoir de dépôt' },
      mount(rootEl) {
        restorePressingDocument(readPressingDocument());
        build(rootEl); enter();
        const catalog = window.KiwiPressingCatalog;
        if (catalog) {
          catalog.subscribe(() => {
            loadCatalog();
            if (state.cat !== 'tous' && !counterCatalog().some((c) => c.id === state.cat)) state.cat = 'tous';
            if (root && state.unlocked) renderAll();
          });
          Promise.resolve(catalog.bind()).then(() => {
            loadCatalog();
            restorePressingDocument(readPressingDocument());
            if (root && state.unlocked) renderAll();
            const orderCloud = pressingCloud();
            if (orderCloud) orderCloud.bind();
          });
        } else {
          const orderCloud = pressingCloud();
          if (orderCloud) orderCloud.bind();
        }
      },
      onShow() { loadCatalog(); enter(); },
    });
  }

  /* Compat : d'anciens raccourcis (et les tests) appellent encore
   * KiwiPressing.unlock() directement. */
  window.KiwiPressing = {
    unlock() {
      if (window.KiwiPosDispatch) return window.KiwiPosDispatch.unlockById('pressing');
    },
    lock,
    rules: Object.freeze({
      normalizePhone,
      normalizeMoroccanPhone,
      whatsappPhone,
      clampQty,
      validDeposit,
      validReady,
      readyOptions,
      suggestReady,
      findScannedOrder,
      barcode,
      maxQty: MAX_QTY,
    }),
  };
})();

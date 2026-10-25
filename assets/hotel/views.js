/* Owner: hotel views. Exposes a private factory; immutable dependencies are explicit, mutable owner state is accessed through live scope getters/setters. */
(window.__kiwiHotelSections ||= {}).views = (scope) => {
'use strict';
const { ARRIVALS, DEPARTURES, FLOORS, FORECAST, GUESTS, HK_QUEUE, HX_PDV_KINDS, K, MAD, NATIONALITIES, NOSHOW_RISK, R, ROOMS, STAYS, TAPE_DAYS, TODAY_IDX, TYPES, cuAllStays, cuBoards, cuCaptureEconomatDraft, cuChannelMerchant, cuCharLabel, cuCommercialState, cuDay, cuDraftMoney, cuDraftStatus, cuEconomatDraft, cuEconomatState, cuFloorRows, cuHasActiveFilters, cuInHouseSnapshots, cuKinds, cuLang, cuLoadCommercial, cuMerchantSlug, cuMoney, cuNationalities, cuNationalityLabel, cuNormalizeText, cuOutletsMapped, cuQty, cuRackFilter, cuReceptionBuckets, cuReceptionSelection, cuRenderPhotoEditor, cuRoomLive, cuRoomStatus, cuSafePhoto, cuShrinkHotelPhoto, cuStamp, cuState, cuStayCache, cuStayLoads, cuStayScope, cuStaysChanged, cuStrip, cuToday, cuTonight, cuTypes, cuVenueId, cuViewLabel, donutCss, esc, hxLang, hxLocale, hxTo, isCustomHotel, ltr, occupancyByDay, rerender, roomTypeOf, srcPill, toast, tx, txk, txn, typeOf } = scope;
function counts() {
    if (isCustomHotel()) {
      const rs = Object.values(R());
      const tonight = cuTonight();
      return {
        occToNight: tonight.sold,
        tonightKnown: tonight.known,
        toClean: rs.filter((r) => cuRoomStatus(r).key === 'sale').length,
        arrDone: 0, depPending: 0,
      };
    }
    const occToNight = Object.values(ROOMS).filter((r) => ['occ', 'depart', 'arrivee', 'sale'].includes(r.status) && r.guest).length;
    const toClean = HK_QUEUE.length;
    const arrDone = ARRIVALS.filter((a) => a.done).length;
    const depPending = DEPARTURES.filter((d) => !d.settled).length;
    return { occToNight, toClean, arrDone, depPending };
  }

function receptionBody() {
    const c = counts();
    const arr = ARRIVALS.map((a) => `
      <div class="hx-arr${a.done ? ' done' : ''}">
        <span class="tm">${a.t}</span>
        <div class="who">
          <b>${a.guest} · Ch. ${a.room}</b>${a.repeat ? ' <span class="hx-pill ok">FIDÈLE ×2</span>' : ''}
          <div class="sub">${srcPill(a.src)} ${a.nights} nuit${a.nights > 1 ? 's' : ''} · ${a.pax} pers · ${a.note}</div>
        </div>
        <span>${a.done ? '<span class="hx-pill ok">ARRIVÉ ✓</span>' : '<span class="hx-pill neutral">À VENIR</span>'}</span>
        ${a.done
          ? `<button class="hx-btn ghost" data-action="hx-folio" data-arg="${a.room}">Folio</button>`
          : `<button class="hx-btn atlas" data-action="hx-checkin" data-arg="${a.id}">Check-in</button>`}
      </div>`).join('');
    const dep = DEPARTURES.map((d) => `
      <div class="hx-arr${d.settled ? ' done' : ''}">
        <span class="tm">${d.t}</span>
        <div class="who">
          <b>${d.guest} · Ch. ${d.room}</b>
          <div class="sub">${d.settled ? 'Folio soldé · ' + MAD(d.folio) : 'Late check-out réglé 150 MAD · chambre encore occupée'}</div>
        </div>
        <span>${d.settled ? '<span class="hx-pill ok">SOLDÉ ✓</span>' : '<span class="hx-pill late">EN RETARD</span>'}</span>
        ${d.settled
          ? `<span style="font-size:11px;color:var(--n-500);font-family:var(--mono);">9h0${DEPARTURES.indexOf(d) + 1} → IBAN</span>`
          : `<button class="hx-btn atlas" data-action="hx-checkout" data-arg="${d.room}">Check-out</button>`}
      </div>`).join('');
    const inHouse = Object.values(ROOMS).filter((r) => r.status === 'occ');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Occupation ce soir</div><div class="v">${c.occToNight} / 24</div><div class="d up">${(window.KiwiNumber?.number((c.occToNight / 24 * 100), 1) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1}).format((c.occToNight / 24 * 100)))} % · +2,4 pts vs hier</div></div>
        <div class="hx-kpi"><div class="l">Arrivées</div><div class="v">${ARRIVALS.length} <small>· ${c.arrDone} faites</small></div><div class="d">premier ETA 15h30</div></div>
        <div class="hx-kpi"><div class="l">Départs</div><div class="v">5 <small>· ${5 - c.depPending} soldés</small></div><div class="d ${c.depPending ? 'warn' : 'up'}">${c.depPending ? '1 en retard · Ch. 9' : 'tous soldés ✓'}</div></div>
        <div class="hx-kpi"><div class="l">À nettoyer</div><div class="v">${c.toClean} <small>/ 24</small></div><div class="d">ménage en cours · Ch. 12</div></div>
        <div class="hx-kpi"><div class="l">ADR ce soir</div><div class="v">985 <small>MAD</small></div><div class="d up">RevPAR 862 MAD</div></div>
      </div>
      <div class="hx-h"><span class="t">Arrivées du jour</span><span class="s">check-in en un geste · la chambre passe « occupée » et le folio s'ouvre</span>
        <button class="hx-demo" data-action="hx-demo-folio"><i></i>Démo · thé + hammam → folio Ch. 7</button>
      </div>
      <div class="block" style="padding:6px 14px;"><div class="hx-list">${arr}</div></div>
      <div class="hx-h"><span class="t">Départs du jour</span><span class="s">folio encaissé en un geste · taxe de séjour incluse · règlement T+1</span></div>
      <div class="block" style="padding:6px 14px;"><div class="hx-list">${dep}</div></div>
      <div class="hx-h"><span class="t">En maison · ${inHouse.length} chambres</span>
        <span class="a" data-action="nav-chambres">Plan des chambres →</span>
        <button class="hx-btn ghost" data-action="hx-walkin">+ Walk-in · vendre une chambre</button>
      </div>
      <div class="block" style="padding:12px 14px;font-size:12.5px;color:var(--n-500);line-height:2;">
        ${inHouse.map((r) => `<span style="display:inline-block;margin-right:14px;"><b style="color:var(--ink);font-family:var(--mono);">Ch. ${r.n}</b> ${r.guest}</span>`).join('')}
      </div>
    </div>`;
  }

function rackBody() {
    const stLbl = { occ: 'Occupée', depart: 'Départ du jour', arrivee: 'Arrivée du jour', libre: 'Libre · propre', sale: 'Libre · sale', hs: 'Hors-service' };
    const floors = FLOORS.map((f) => `
      <div class="hx-floor-lbl">${f.lbl}</div>
      <div class="hx-rack">${f.rooms.map((n) => {
        const r = ROOMS[n];
        const bdg = r.status === 'depart' ? '<span class="bdg">DÉPART</span>'
          : r.status === 'arrivee' ? '<span class="bdg">ARRIVÉE</span>'
          : r.status === 'sale' ? '<span class="bdg">MÉNAGE</span>' : '';
        return `<div class="hx-room st-${r.status}" data-action="hx-room" data-arg="${n}">
          ${bdg}
          <div><div class="no">CH. ${n}</div><div class="ty">${TYPES[r.type].name}</div></div>
          <div><div class="gu">${r.guest || (r.status === 'hs' ? 'Hors-service' : 'Libre')}</div><div class="mt">${r.meta || ''}</div></div>
        </div>`;
      }).join('')}</div>`).join('');
    return `<div class="hx-page">
      <div class="hx-legend">
        <span><span class="sw" style="background:var(--atlas);border-color:var(--atlas);"></span>Occupée</span>
        <span><span class="sw" style="background:var(--atlas);border-top:3px solid var(--warning);"></span>Départ du jour</span>
        <span><span class="sw" style="background:var(--mint-soft);border:1.5px dashed var(--atlas);"></span>Arrivée du jour</span>
        <span><span class="sw" style="background:var(--surface,#fff);"></span>Libre · propre</span>
        <span><span class="sw" style="background:var(--warn-soft);border-color:var(--warning);"></span>Libre · sale</span>
        <span><span class="sw" style="background:repeating-linear-gradient(45deg,var(--n-100),var(--n-100) 4px,transparent 4px,transparent 8px);"></span>Hors-service</span>
        <span style="margin-left:auto;">Toucher une chambre → client + folio</span>
      </div>
      ${floors}
    </div>`;
  }

function cuConnectingAvail(cr, dates) {
    if (!cr) return '';
    const crStatus = cuRoomStatus(cr);
    if (!dates || !dates.startAt || !dates.endAt) {
      return tx('Disponibilité non vérifiée (dates requises)');
    }
    const doc = window.KiwiReservations?.get?.();
    if (!doc || !Array.isArray(doc.bookings)) {
      return tx('Disponibilité non vérifiée (réservations non chargées)');
    }
    if (typeof window.KiwiReservations.resourceFree !== 'function') {
      return tx('Disponibilité non vérifiée');
    }
    const parseTime = (v) => typeof v === 'number' ? v : Date.parse(v);
    const start = parseTime(dates.startAt), end = parseTime(dates.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return tx('Disponibilité non vérifiée (dates invalides)');
    let isFree;
    try { isFree = window.KiwiReservations.resourceFree(doc, cr.id, start, end); }
    catch (_) { return tx('Disponibilité non vérifiée'); }
    if (!isFree) {
      return tx('Occupée / réservée sur ces dates');
    }
    return cr.status === 'libre' ? tx('Disponible pour ces dates') : crStatus.label;
  }

function tapeBody() {
    const occ = occupancyByDay();
    const head = `<div class="hx-tape" style="--days:${TAPE_DAYS.length};">
      <div class="hd" style="text-align:left;padding-left:8px;">CHAMBRE</div>
      ${TAPE_DAYS.map((d, i) => `<div class="hd${i === TODAY_IDX ? ' today' : ''}">${d}${i === TODAY_IDX ? ' ·' : ''}</div>`).join('')}
      ${FLOORS.flatMap((f) => f.rooms).map((rn) => {
        const cells = TAPE_DAYS.map((_, di) => `<div class="cell${di === TODAY_IDX ? ' today' : ''}" style="grid-column:${di + 1};"></div>`).join('');
        const stays = STAYS.filter((s) => s.r === rn && s.s + s.n > 0 && s.s < TAPE_DAYS.length).map((s) => {
          const from = Math.max(0, s.s), to = Math.min(TAPE_DAYS.length, s.s + s.n);
          return `<div class="stay src-${s.src}" style="grid-column:${from + 1} / ${to + 1};" data-action="hx-stay" data-arg="${s.r}|${s.g}|${s.n}|${s.src}">${s.g}</div>`;
        }).join('');
        return `<div class="rm">Ch. ${rn} · ${TYPES[typeOf(rn)].name.split(' ')[0]}${ROOMS[rn].status === 'hs' ? ' ⊘' : ''}</div>` +
          `<div class="rw" style="--days:${TAPE_DAYS.length};">${cells}${stays}</div>`;
      }).join('')}
      <div class="occ-lbl">Occupation</div>
      ${occ.map((c, i) => `<div class="occ-cell${i === TODAY_IDX ? ' today' : ''}" style="background:rgba(11,110,79,${(c / 24 * 0.55).toFixed(2)});${c >= 22 ? 'color:#fff;font-weight:700;' : ''}">${Math.round(c / 24 * 100)} %</div>`).join('')}
    </div>`;
    return `<div class="hx-page">
      <div class="hx-legend">
        <span><span class="sw" style="background:var(--riad);"></span>Booking.com</span>
        <span><span class="sw" style="background:var(--atlas);"></span>Direct</span>
        <span><span class="sw" style="background:var(--warning);"></span>Airbnb</span>
        <span><span class="sw" style="background:var(--n-400);"></span>Expedia</span>
        <span><span class="sw" style="background:var(--mint-soft);border-color:var(--atlas);"></span>Walk-in</span>
        <span style="margin-left:auto;">Samedi 13 · 96 %, pensez aux tarifs weekend (Tarifs & occupation)</span>
      </div>
      <div class="block hx-tape-wrap" style="padding:14px;">${head}</div>
    </div>`;
  }

function hotesBody() {
    const rows = GUESTS.map((g) => `
      <div class="hx-guest" data-action="hx-guest" data-arg="${g.id}">
        <span class="hx-av ${g.repeat ? '' : 'd'}">${g.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
        <div>
          <div class="nm">${g.name}
            ${g.repeat ? `<span class="hx-pill ok">FIDÈLE ×${g.stays}</span>` : ''}
            ${g.arrivingToday ? '<span class="hx-pill dark">ARRIVE AUJOURD\'HUI</span>' : ''}
          </div>
          <div class="meta">${g.country} · ${g.stays} séjour${g.stays > 1 ? 's' : ''} · dernier : ${g.last}</div>
          <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap;">${g.prefs.map((p) => `<span class="hx-pref${/allergie/i.test(p) ? ' allergy' : ''}">${p}</span>`).join('')}</div>
        </div>
        <span></span>
        <div class="ltv">${g.ltv ? MAD(g.ltv) : '·'}<small>valeur vie client</small></div>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-strip">
        <div class="hx-kpi"><div class="l">Profils clients</div><div class="v">612</div><div class="d up">+38 ce mois</div></div>
        <div class="hx-kpi"><div class="l">Clients fidèles ≥2 séjours</div><div class="v">134</div><div class="d up">22 % du fichier</div></div>
        <div class="hx-kpi"><div class="l">Valeur vie moyenne</div><div class="v">6 840 <small>MAD</small></div><div class="d">chambres + resto + hammam</div></div>
        <div class="hx-kpi"><div class="l">Fidèles revenus via OTA</div><div class="v">22</div><div class="d warn">~28 200 MAD de commission évitable</div></div>
      </div>
      <div class="hx-row r-21">
        <div class="block" style="padding:6px 14px;">
          <div class="hx-h" style="margin:10px 2px 2px;"><span class="t">Fichier clients</span><span class="s">reconnaissance automatique au check-in · préférences servies sans demander</span></div>
          ${rows}
        </div>
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 12px;"><span class="t">Mix nationalités · 30 j</span></div>
          <div class="hx-donut-wrap">
            <div class="hx-donut" style="${donutCss(NATIONALITIES)}"><div class="ctr"><b>34 %</b><span>FRANCE</span></div></div>
            <div class="hx-dlg">${NATIONALITIES.map((n) => `<div class="r"><span class="sw" style="background:${n.color};"></span><span>${n.c}</span><span class="pc">${n.pct} %</span><span></span></div>`).join('')}</div>
          </div>
          <div style="font-size:11.5px;color:var(--n-500);margin-top:12px;line-height:1.6;">Le couple FR + MA pèse 56 % des nuitées, alignez petits-déjeuners, langues du staff et horaires hammam.</div>
        </div>
      </div>
    </div>`;
  }

function forecastSvg() {
    const W = 720, Hh = 200, pad = 28;
    const pts = FORECAST.occ.map((v, i) => {
      const x = pad + i * ((W - pad * 2) / (FORECAST.occ.length - 1));
      const y = Hh - pad - (v / 100) * (Hh - pad * 2);
      return [x, y];
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${Hh - pad} L ${pad} ${Hh - pad} Z`;
    const labels = FORECAST.months.map((m, i) => `<text x="${pts[i][0]}" y="${Hh - 8}" text-anchor="middle" font-size="9.5" font-family="var(--mono)" fill="var(--n-400)">${m}</text>`).join('');
    const marks = Object.keys(FORECAST.notes).map((idx) => {
      const i = +idx;
      return `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="4.5" fill="${i === 7 ? 'var(--warning)' : 'var(--mint)'}" stroke="var(--riad)" stroke-width="1.5"/>
        <text x="${pts[i][0]}" y="${pts[i][1] - 11}" text-anchor="middle" font-size="9" font-family="var(--mono)" fill="var(--n-500)">${FORECAST.notes[i].toUpperCase()}</text>`;
    }).join('');
    const grid = [25, 50, 75, 100].map((g) => {
      const y = Hh - pad - (g / 100) * (Hh - pad * 2);
      return `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="var(--n-100)" stroke-width="1"/><text x="${pad - 6}" y="${y + 3}" text-anchor="end" font-size="9" font-family="var(--mono)" fill="var(--n-400)">${g}</text>`;
    }).join('');
    const vals = FORECAST.occ.map((v, i) => `<text x="${pts[i][0]}" y="${pts[i][1] - (Object.keys(FORECAST.notes).includes(String(i)) ? 22 : 9)}" text-anchor="middle" font-size="9.5" font-weight="600" font-family="var(--mono)" fill="var(--atlas)">${v}</text>`).join('');
    return `<svg class="hx-fc-svg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Prévision d'occupation 12 mois">
      ${grid}
      <path d="${area}" fill="rgba(11,110,79,0.09)"/>
      <path d="${line}" fill="none" stroke="var(--atlas)" stroke-width="2.2" stroke-linecap="round"/>
      ${vals}${marks}${labels}
    </svg>`;
  }

function intelBody() {
    const ns = NOSHOW_RISK.map((n) => `
      <div class="hx-q">
        <i class="dot" style="background:${n.high ? 'var(--danger)' : 'var(--warning)'};"></i>
        <div><div class="nm">${n.ref} · ${n.room} · ${n.when}</div><div class="nt">${n.src} · ${n.why}</div></div>
        <span class="hx-pill ${n.high ? 'late' : 'pend'}">RISQUE ${n.risk} %</span>
        <button class="hx-btn ghost" data-action="hx-noshow-secure" data-arg="${n.ref}">Demander prépaiement</button>
      </div>`).join('');
    return `<div class="hx-page">
      <div class="hx-h"><span class="t">Prévision d'occupation · 12 mois</span><span class="s">saisonnalité Marrakech + calendrier hégirien + événements ville, comme la prévision de stock du restaurant</span></div>
      <div class="block" style="padding:16px;">
        ${forecastSvg()}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <span class="hx-ev peak">HAUTE SAISON · OCT → DÉC</span>
          <span class="hx-ev dip">RAMADAN · 8 FÉV → 9 MARS 2027 · −20 pts</span>
          <span class="hx-ev peak">AÏD AL-FITR · ≈10-13 MARS · PIC FAMILLES MRE</span>
          <span class="hx-ev dip">ÉTÉ · JUIL-AOÛT · CHALEUR</span>
        </div>
      </div>
      <div class="hx-row r-2">
        <div class="block" style="padding:16px;">
          <div class="hx-h" style="margin:0 0 8px;"><span class="t">Suggestions tarifaires</span><span class="a" data-action="nav-tarifs">Ouvrir les tarifs →</span></div>
          <div style="font-size:12.5px;color:var(--n-500);line-height:1.8;">
            <div>· Weekend 13-14 juin : <b style="color:var(--ink);">+18 %</b> sur Confort & Suites, 96 % de remplissage anticipé.</div>
            <div>· Suite Terrasse Royale <b style="color:var(--ink);">sous-cotée de ~200 MAD</b> vs comp-set premium médina.</div>
            <div>· Mardi-mercredi : promo directe −10 %, remplirait <b style="color:var(--ink);">~2 chambres / semaine</b> en creux.</div>
          </div>
        </div>
        <div class="block" style="padding:6px 14px;">
          <div class="hx-h" style="margin:10px 2px 2px;"><span class="t">Risque no-show · 7 jours</span><span class="s">historique + garantie + délai de réservation</span></div>
          ${ns}
        </div>
      </div>
      <div class="hx-bleed">
        <div class="lbl">OÙ PART L'ARGENT · 30 JOURS</div>
        <div class="big">−${MAD(67190 + 3850 + 950)}</div>
        <div class="sub">Trois fuites mesurées par Kiwi sur votre exploitation, et le manque à gagner des nuits invendues à surveiller.</div>
        <div style="margin-top:14px;">
          <div class="hx-bleed-row"><div>Commissions OTA<div class="nt">Booking 56 180 · Expedia 8 810 · Airbnb 2 200</div></div><span class="am">−${MAD(67190)}</span></div>
          <div class="hx-bleed-row"><div>Late check-outs · 9 rotations bloquées<div class="nt">2 arrivées retardées + 1 surclassement offert</div></div><span class="am">−${MAD(3850)}</span></div>
          <div class="hx-bleed-row"><div>No-shows · 4 ce mois<div class="nt">3 800 MAD récupérés (1ʳᵉ nuit retenue) · 1 non garanti perdu</div></div><span class="am">−${MAD(950)}</span></div>
          <div class="hx-bleed-row"><div>Nuits invendues · 173 nuits<div class="nt">60 % en milieu de semaine → promo directe mar-mer suggérée</div></div><span class="am" style="color:#A8C8B8;">~154 000 MAD de potentiel</span></div>
        </div>
      </div>
    </div>`;
  }

function cuEvaluateStayExceptions(b, today) {
    const errs = [];
    if (!b || !b.hotel || b.status === 'cancelled' || b.status === 'no_show') return errs;
    const cin = b.hotel.checkIn, cout = b.hotel.checkOut;
    const guests = Array.isArray(b.guests) ? b.guests : [];
    const partySize = +b.partySize || 1;

    // Stale check-out (in-house guest past departure date)
    if (b.status === 'checked_in' && cout < today) {
      errs.push({
        code: 'stale_checkout',
        severity: 'danger',
        label: tx('Départ dépassé non clôturé'),
        detail: tx('Départ prévu le {date}', { date: cout }),
      });
    }

    // In-house missing guest manifest
    if (b.status === 'checked_in') {
      if (guests.length < partySize) {
        errs.push({
          code: 'missing_manifest',
          severity: 'warn',
          label: tx('Fiche incomplète ({n}/{total} pers.)', { n: guests.length, total: partySize }),
          detail: tx('Voyageurs physiques non enregistrés'),
        });
      }
      guests.forEach((g, idx) => {
        const num = idx + 1;
        if (!g.idDocNumber || !g.idDocType) {
          errs.push({
            code: 'missing_identity',
            severity: 'danger',
            label: tx('Pièce d’identité manquante (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
        if (!g.nationality) {
          errs.push({
            code: 'missing_nationality',
            severity: 'danger',
            label: tx('Nationalité manquante (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
        if (!g.residenceCountry) {
          errs.push({
            code: 'missing_residence',
            severity: 'warn',
            label: tx('Pays de résidence manquant (Voyageur {n})', { n: num }),
            detail: g.name || tx('Nom non renseigné'),
          });
        }
      });
    } else if ((b.status === 'confirmed' || b.status === 'requested') && cin <= today) {
      if (!guests.length) {
        errs.push({
          code: 'unconfirmed_arrival',
          severity: 'info',
          label: tx('Arrivée & fiche en attente'),
          detail: tx('Arrivée prévue le {date}', { date: cin }),
        });
      }
    }

    return errs;
  }

function cuReceptionJournal(stays, today) {
    const filter = cuReceptionSelection(), day = filter.date || today;
    const buckets = cuReceptionBuckets(stays, day, today);
    const inhouse = cuInHouseSnapshots.get(cuStayScope());
    if (inhouse) {
      const current = (b) => inhouse.ids.has(b.id) || (+b.updatedAt || 0) > inhouse.startedAt;
      buckets.inhouse = buckets.inhouse.filter(current);
      buckets.attention = buckets.attention.filter((b) => b.status !== 'checked_in' || current(b));
    }
    const views = { arrivals: tx('Arrivées'), departures: tx('Départs'), inhouse: tx('En maison maintenant'), attention: tx('Retards à vérifier') };
    const labels = { requested: tx('Demandée'), confirmed: tx('Confirmée'), checked_in: tx('En maison'), completed: tx('Terminée') };
    const channels = { direct: tx('Direct'), booking: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb', walkin: tx('Walk-in'), other: tx('Autre') };
    const normalized = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = normalized(filter.q);
    const rooms = Object.values(R());
    const rows = (buckets[filter.view] || buckets.arrivals).filter((b) => {
      const room = rooms.find((r) => r.id === b.resourceId);
      return normalized([b.customer?.name, b.code, b.hotel.externalRef, room?.n, channels[b.hotel.channel]].join(' ')).includes(q);
    }).sort((a, b) => String(a.customer?.name || '').localeCompare(String(b.customer?.name || ''), 'fr'));
    const load = cuStayLoads.get(cuStayScope());
    return `<section class="block hx-daily" aria-label="${tx('Journal de réception')}">
      <div class="hx-daily-head"><div><span class="hx-kicker">${tx('JOURNAL DE RÉCEPTION')}</span><h3>${views[filter.view] || views.arrivals} · ${rows.length}</h3><p>${tx('Dates de séjour à l’heure du Maroc. Ouvrez un dossier pour modifier ses détails.')}</p></div><div class="hx-commercial-tools"><button type="button" class="hx-btn ghost" data-action="hx-commercial">${tx('Clients, agences & sociétés')}</button>${cuHasGroupRecovery() ? `<button type="button" class="hx-btn ghost" data-action="hx-group-resume">${tx('Reprendre le dossier groupe')}</button>` : ''}<button type="button" class="hx-btn ghost" data-action="hx-group-new">+ ${tx('Réservation de groupe')}</button><button type="button" class="hx-btn atlas" data-action="hx-stay-new">+ ${tx('Réservation')}</button></div></div>
      <div class="hx-daily-controls">
        <label>${tx('Date des mouvements')}<input type="date" data-hx-daily-date value="${esc(day)}"></label>
        <label>${tx('Vue')}<select data-hx-daily-view>${Object.entries(views).map(([key, label]) => `<option value="${key}" ${filter.view === key ? 'selected' : ''}>${label} (${buckets[key].length})</option>`).join('')}</select></label>
        <label class="hx-daily-search">${tx('Rechercher')}<input type="search" data-hx-daily-search value="${esc(filter.q)}" placeholder="${tx('Client, chambre, référence')}"></label>
        <button class="hx-btn ghost" data-action="hx-daily-apply">${tx('Afficher')}</button>
        <button class="hx-btn ghost" data-action="hx-daily-refresh" ${load?.loading ? 'disabled' : ''}>${load?.loading ? tx('Actualisation…') : tx('Actualiser')}</button>
      </div>
      ${load?.error ? `<p class="hx-daily-warning" role="status">${esc(tx(load.error))}</p>` : ''}
      ${['inhouse', 'attention'].includes(filter.view) ? `<p class="hx-daily-note">${tx('Cette vue suit les statuts actuels, indépendamment de la date des mouvements choisie.')}</p>` : ''}
      <div class="hx-daily-list">${rows.map((b) => {
        const room = rooms.find((r) => r.id === b.resourceId);
        const who = b.customer?.name || tx('client');
        return `<article class="hx-daily-row"><div class="hx-daily-room">${room ? tx('Ch. {n}', { n: esc(room.n) }) : tx('Non attribuée')}</div><div class="hx-daily-guest"><b>${esc(b.customer?.name || tx('Client'))}</b><span>${esc(b.code || '')} · ${esc(channels[b.hotel.channel] || tx('Autre'))} ${b.hotel.externalRef ? '· ' + esc(b.hotel.externalRef) : ''}</span><span>${esc(cuDay(b.hotel.checkIn))}${hxTo()}${esc(cuDay(b.hotel.checkOut))} · ${esc(txn(b.partySize || 1, 'personne'))} · ${esc(b.hotel.roomTypeName || '')}</span>${b.note ? `<span class="hx-daily-note">${esc(b.note)}</span>` : ''}</div><span class="hx-daily-status">${esc(labels[b.status] || b.status)}</span>${b.status === 'confirmed' && b.hotel.checkIn <= today ? `<button data-activation=write class="hx-btn atlas" data-action="hx-stay-checkin" data-arg="${esc(b.id)}" aria-label="${esc(tx('Enregistrer l’arrivée de {name}', { name: who }))}">${tx('Check-in')}</button>` : ''}${b.status === 'checked_in' && b.hotel.checkOut <= today ? `<button data-activation=write class="hx-btn atlas" data-action="hx-stay-checkout" data-arg="${esc(b.id)}" aria-label="${esc(tx('Enregistrer le départ de {name}', { name: who }))}">${tx('Check-out')}</button>` : ''}${b.status === 'completed' ? `<button class="hx-btn ghost" data-action="hx-stay-reopen" data-arg="${esc(b.id)}" aria-label="${esc(tx('Rouvrir le dossier de {name} pour corriger sa facturation', { name: who }))}">${tx('Rouvrir le dossier')}</button>` : ''}${b.status === 'checked_in' ? `<button data-activation=write class="hx-btn ghost" data-action="hx-stay-undo-checkin" data-arg="${esc(b.id)}" aria-label="${esc(tx('Annuler l’arrivée enregistrée pour {name}', { name: who }))}">${tx('Annuler l’arrivée')}</button>` : ''}${(b.status === 'confirmed' || b.status === 'requested') && b.hotel.checkIn <= today ? `<button class="hx-btn ghost" data-action="hx-stay-noshow" data-arg="${esc(b.id)}" aria-label="${esc(tx('Marquer {name} comme non présenté', { name: who }))}">${tx('Non présenté')}</button>` : ''}<button data-activation=write class="hx-btn ghost" data-action="hx-stay-edit" data-arg="${esc(b.id)}" aria-label="${esc(tx('Ouvrir le dossier {ref}', { ref: b.code || b.customer?.name || tx('client') }))}">${tx('Ouvrir le dossier')}</button></article>`;
      }).join('') || `<p class="hx-empty">${tx('Aucun dossier dans cette vue. Vérifiez la date, les filtres et l’état de l’actualisation.')}</p>`}</div>
      <p class="hx-daily-note">${tx('Les walk-ins encaissés séparément restent accessibles dans le plan des chambres et les folios. Cette liste présente les dossiers de réservation.')}</p>
    </section>`;
  }

function cuReceptionBody() {
    const allStaysMap = cuAllStays();
    const today = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const activeStays = Array.from(allStaysMap.values()).filter((b) => b.hotel && b.status !== 'cancelled' && b.status !== 'no_show');

    const exceptionsList = [];
    activeStays.forEach((b) => {
      const errs = cuEvaluateStayExceptions(b, today);
      if (errs.length) exceptionsList.push({ booking: b, errs });
    });

    const criticalCount = exceptionsList.filter((x) => x.errs.some((e) => e.severity === 'danger')).length;
    const warningCount = exceptionsList.length - criticalCount;

    let auditCard = '';
    if (exceptionsList.length > 0) {
      const itemsHtml = exceptionsList.slice(0, 6).map(({ booking: b, errs }) => {
        const room = R()[b.resourceId] || Object.values(R()).find((r) => r.id === b.resourceId);
        const roomLabel = room ? tx('Ch. {n}', { n: room.n }) : (b.hotel.roomTypeName || tx('Chambre'));
        const badgesHtml = errs.map((e) => `<span class="hx-exc-badge ${e.severity}" title="${esc(e.detail)}">${esc(e.label)}</span>`).join('');
        return `<div class="hx-exc-row">
          <div>
            <div class="hx-exc-meta"><b>${esc(roomLabel)}</b> · ${esc(b.customer?.name || tx('Client'))} <span>(${cuDay(b.hotel.checkIn)}${hxTo()}${cuDay(b.hotel.checkOut)})</span></div>
            <div class="hx-exc-badges">${badgesHtml}</div>
          </div>
          <button data-activation=write class="hx-btn ghost hx-btn-sm" data-action="hx-stay-edit" data-arg="${esc(b.id)}">${tx('Compléter la fiche')}</button>
        </div>`;
      }).join('');

      auditCard = `<div class="block hx-audit ${criticalCount ? 'danger' : 'warn'}">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ${criticalCount ? 'danger' : 'warn'}">${tx('CONTRÔLE RÉCEPTION · REVUE INTERNE')}</span>
            <h3 class="hx-audit-title">
              ${criticalCount ? tx('{n} à régulariser avant le départ', { n: txn(criticalCount, 'dossier') }) : tx('{n} à compléter', { n: txn(warningCount, 'dossier') })}
            </h3>
            <p class="hx-audit-sub">${tx('Cohérence des fiches voyageurs et des départs. Contrôle interne, sans valeur déclarative.')}</p>
          </div>
          <button class="hx-btn atlas hx-btn-sm" data-action="hx-monthly-closing">${tx('Contrôle mensuel')}</button>
        </div>
        <div class="hx-audit-list">
          ${itemsHtml}
        </div>
      </div>`;
    } else {
      auditCard = `<div class="block hx-audit ok">
        <div class="hx-audit-head">
          <div>
            <span class="hx-kicker hx-audit-kicker ok">${tx('CONTRÔLE RÉCEPTION · REVUE INTERNE')}</span>
            <div class="hx-audit-title">${activeStays.length > 0 ? tx('Dossiers en maison cohérents (0 anomalie bloquante)') : tx('Aucun séjour actif. Le contrôle mensuel reste disponible.')}</div>
          </div>
          <button class="hx-btn ghost hx-btn-sm" data-action="hx-monthly-closing">${tx('Contrôle mensuel')}</button>
        </div>
      </div>`;
    }

    return `<div class="hx-page">
      ${cuStrip()}
      ${auditCard}
      ${cuReceptionJournal(Array.from(allStaysMap.values()), today)}
    </div>`;
  }

function cuParseRoomNumbers(value) {
    const out = [];
    const seen = new Set();
    String(value || '').split(/[,;\s]+/).filter(Boolean).forEach((part) => {
      const range = part.match(/^(\d{1,4})-(\d{1,4})$/);
      if (range) {
        const a = +range[1], b = +range[2];
        if (a < 1 || b < a || b - a > 99) return;
        for (let n = a; n <= b; n++) if (!seen.has(n)) { seen.add(n); out.push(n); }
      } else if (/^\d{1,4}$/.test(part)) {
        const n = +part;
        if (n > 0 && !seen.has(n)) { seen.add(n); out.push(n); }
      }
    });
    return out.slice(0, 100);
  }

async function cuUploadTypePhotos(root, files) {
    const status = root?.querySelector('[data-hx-type-photo-status]'), typeName = String(root?.querySelector('[data-hx-type-name]')?.value || 'Chambre').trim() || 'Chambre';
    const queue = Array.from(files || []).filter((f) => /^image\/(jpeg|png|webp|gif|avif)$/i.test(f.type || '')).slice(0, Math.max(0, 8 - (root.__hxPhotos || []).length));
    if (!queue.length) { if (status) status.textContent = tx('Choisissez une image JPG, PNG, WebP, GIF ou AVIF.'); return; }
    const uploader = window.KiwiPlatformOps?.uploads;
    if (!uploader?.upload) { if (status) status.textContent = tx('Le stockage photo n’est pas disponible sur cet appareil.'); return; }
    for (let i = 0; i < queue.length; i++) {
      if (status) status.textContent = tx('Préparation de la photo {i} / {n}…', { i: i + 1, n: queue.length });
      try {
        const ready = await cuShrinkHotelPhoto(queue[i]);
        const uploaded = await uploader.upload(ready, { merchant: window.KiwiStore?.slugFor?.(cuVenueId()) || '', scope: 'hotel-room', progress: (pct) => { if (status) status.textContent = tx('Envoi {i} / {n} · {pct} %', { i: i + 1, n: queue.length, pct }); } });
        const photo = cuSafePhoto({ url: uploaded.url, alt: typeName + ' · photo ' + ((root.__hxPhotos || []).length + 1), updatedAt: cuStamp() }, (root.__hxPhotos || []).length, typeName);
        if (photo) root.__hxPhotos.push(photo);
        cuRenderPhotoEditor(root);
      } catch (error) {
        const code = error?.code || error?.message;
        if (status) status.textContent = code === 'too-large' ? tx('Photo trop lourde même après compression.') : code === 'bad-type' ? tx('Format photo non accepté.') : tx('Envoi interrompu. Les autres photos restent intactes.');
        return;
      }
    }
    if (status) status.textContent = tx(queue.length > 1 ? '{n} ajoutées · enregistrez le type pour publier.' : '{n} ajoutée · enregistrez le type pour publier.', { n: txn(queue.length, 'photo') });
  }

function cuUpdateFloorsManagerModal() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const listEl = document.querySelector('.hx-floors-modal .hx-floor-manager-list');
    if (!listEl) return;
    const st = cuState();
    const rows = cuFloorRows().map((f, index, list) => {
      const count = Object.values(st.rooms).filter((r) => r.floorId === f.id).length;
      return `<div class="hx-floor-manager-row">
        <span class="hx-floor-manager-grip">⋮⋮</span>
        <span class="hx-floor-manager-copy"><b>${esc(f.name)}</b><small>${txn(count, 'chambre')}</small></span>
        <span class="hx-floor-manager-order">
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:-1" ${index === 0 ? 'disabled' : ''} aria-label="${tx('Monter')}">↑</button>
          <button data-action="hx-floor-move" data-arg="${esc(f.id)}:1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="${tx('Descendre')}">↓</button>
        </span>
        <button data-activation=write class="hx-floor-manager-edit" data-action="hx-floor-edit" data-arg="${esc(f.id)}">${tx('Modifier')}</button>
      </div>`;
    }).join('');
    listEl.innerHTML = rows || `<p>${tx('Aucune section.')}</p>`;
  }

async function cuRegisterWalkin(n, guest, clientRef) {
    const slug = cuMerchantSlug();
    const r = R()[n];
    if (!slug || !r || !r.id || !r.typeId || typeof fetch !== 'function') return null;
    const today = cuToday();
    const next = new Date(today + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
    const body = { action: 'save', merchant: slug, clientRef: String(clientRef).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
      roomTypeId: r.typeId, resourceId: r.id, checkIn: today, checkOut: next.toISOString().slice(0, 10),
      partySize: 1, channel: 'walkin', status: 'checked_in', customer: { name: guest } };
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.booking) return null;
      try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {}
      cuStaysChanged();
      return data.booking;
    } catch (_) { return null; }
  }

function cuUnlinkConnectingRooms(st, roomA, roomB) {
    if (!roomA || !roomB) return;
    const now = cuStamp();
    if (Array.isArray(roomA.connectingRoomIds)) {
      roomA.connectingRoomIds = roomA.connectingRoomIds.filter((id) => id !== roomB.id);
    }
    if (Array.isArray(roomB.connectingRoomIds)) {
      roomB.connectingRoomIds = roomB.connectingRoomIds.filter((id) => id !== roomA.id);
    }
    roomA.connectingMeta = { ...(roomA.connectingMeta || {}) };
    roomB.connectingMeta = { ...(roomB.connectingMeta || {}) };
    roomA.connectingMeta[roomB.id] = { at: now, linked: false };
    roomB.connectingMeta[roomA.id] = { at: now, linked: false };
    roomA.updatedAt = now;
    roomB.updatedAt = now;
  }

function cuSetConnectingRooms(st, targetRoom, targetConnectingIds) {
    if (!targetRoom) return;
    const now = cuStamp();
    const targetId = String(targetRoom.id);
    const newSet = new Set((targetConnectingIds || []).map(String).filter((id) => id && id !== targetId));
    const currentSet = new Set((targetRoom.connectingRoomIds || []).map(String));
    const allRooms = Object.values(st.rooms || {});

    targetRoom.connectingMeta = { ...(targetRoom.connectingMeta || {}) };

    for (const cid of currentSet) {
      if (!newSet.has(cid)) {
        targetRoom.connectingMeta[cid] = { at: now, linked: false };
        const other = allRooms.find((r) => String(r.id) === cid);
        if (other) {
          if (Array.isArray(other.connectingRoomIds)) {
            other.connectingRoomIds = other.connectingRoomIds.filter((id) => String(id) !== targetId);
          }
          other.connectingMeta = { ...(other.connectingMeta || {}) };
          other.connectingMeta[targetId] = { at: now, linked: false };
          other.updatedAt = now;
        }
      }
    }
    for (const cid of newSet) {
      if (!currentSet.has(cid)) {
        targetRoom.connectingMeta[cid] = { at: now, linked: true };
        const other = allRooms.find((r) => String(r.id) === cid);
        if (other) {
          if (!Array.isArray(other.connectingRoomIds)) other.connectingRoomIds = [];
          if (!other.connectingRoomIds.map(String).includes(targetId)) other.connectingRoomIds.push(targetId);
          other.connectingMeta = { ...(other.connectingMeta || {}) };
          other.connectingMeta[targetId] = { at: now, linked: true };
          other.updatedAt = now;
        }
      }
    }
    targetRoom.connectingRoomIds = Array.from(newSet);
    targetRoom.updatedAt = now;
  }

function cuRoomMatchesFilter(r) {
    if (!r) return false;
    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') {
      if (r.floor !== cuRackFilter.floor && r.floorId !== cuRackFilter.floor) return false;
    }
    if (cuRackFilter.floors.size > 0) {
      if (!cuRackFilter.floors.has(r.floorId) && !cuRackFilter.floors.has(r.floor)) return false;
    }
    if (cuRackFilter.categories.size > 0) {
      if (!cuRackFilter.categories.has(r.typeId)) return false;
    }
    if (cuRackFilter.status !== 'all') {
      if (cuRoomStatus(r).key !== cuRackFilter.status) return false;
    }
    if (cuRackFilter.hasView) {
      if (!r.view) return false;
    }
    if (cuRackFilter.views.size > 0) {
      if (!r.view || !cuRackFilter.views.has(r.view)) return false;
    }
    if (cuRackFilter.characteristics.size > 0) {
      const chars = Array.isArray(r.characteristics) ? r.characteristics : [];
      for (const c of cuRackFilter.characteristics) {
        if (!chars.includes(c)) return false;
      }
    }
    if (cuRackFilter.connectingOnly) {
      if (!Array.isArray(r.connectingRoomIds) || r.connectingRoomIds.length === 0) return false;
    }
    if ((cuRackFilter.minCapacity || 0) > 0) {
      const type = roomTypeOf(r.n);
      const cap = type?.maxGuests || 2;
      if (cap < cuRackFilter.minCapacity) return false;
    }
    if (cuRackFilter.q) {
      const q = cuRackFilter.q.toLocaleLowerCase('fr');
      const type = roomTypeOf(r.n);
      const chars = (r.characteristics || []).map((cid) => cuCharLabel(cid));
      const haystack = [
        r.n,
        type?.name,
        cuRoomLive(r)?.stay?.customer?.name || r.guest,
        r.meta,
        r.floor,
        r.view ? ('vue ' + r.view + ' ' + cuViewLabel(r.view)) : '',
        ...chars,
      ].map((x) => String(x || '').toLocaleLowerCase('fr'));
      if (!haystack.some((x) => x.includes(q))) return false;
    }
    return true;
  }

function cuFilterChipsMarkup(matchingCount, totalCount) {
    if (!cuHasActiveFilters()) return '';
    const st = cuState();
    const chips = [];

    if (cuRackFilter.floor && cuRackFilter.floor !== 'all') {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Section : {name}', { name: esc(cuRackFilter.floor) })}</span><button type="button" data-action="hx-filter-remove" data-arg="floor:${esc(cuRackFilter.floor)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const fid of cuRackFilter.floors) {
      const name = st.floors[fid]?.name || fid;
      chips.push(`<span class="hx-filter-chip"><span>${tx('Section : {name}', { name: esc(name) })}</span><button type="button" data-action="hx-filter-remove" data-arg="floors:${esc(fid)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const cid of cuRackFilter.categories) {
      const name = st.roomTypes[cid]?.name || cid;
      chips.push(`<span class="hx-filter-chip"><span>${tx('Type : {name}', { name: esc(name) })}</span><button type="button" data-action="hx-filter-remove" data-arg="categories:${esc(cid)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.status !== 'all') {
      const statusLabels = { libre: tx('Libre · propre'), occ: tx('Occupée / Départ'), arrivee: tx('Arrivée attendue'), sale: tx('À nettoyer'), hs: tx('Hors-service') };
      const lbl = statusLabels[cuRackFilter.status] || cuRackFilter.status;
      chips.push(`<span class="hx-filter-chip"><span>${tx('État : {s}', { s: esc(lbl) })}</span><button type="button" data-action="hx-filter-remove" data-arg="status:${esc(cuRackFilter.status)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.hasView) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Avec vue')}</span><button type="button" data-action="hx-filter-remove" data-arg="hasView" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const v of cuRackFilter.views) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Vue {v}', { v: esc(cuViewLabel(v)) })}</span><button type="button" data-action="hx-filter-remove" data-arg="views:${esc(v)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    for (const c of cuRackFilter.characteristics) {
      const lbl = cuCharLabel(c);
      chips.push(`<span class="hx-filter-chip"><span>${esc(lbl)}</span><button type="button" data-action="hx-filter-remove" data-arg="characteristics:${esc(c)}" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.connectingOnly) {
      chips.push(`<span class="hx-filter-chip"><span>${tx('Communicantes')}</span><button type="button" data-action="hx-filter-remove" data-arg="connectingOnly" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }
    if (cuRackFilter.minCapacity > 0) chips.push(`<span class="hx-filter-chip"><span>≥ ${txn(cuRackFilter.minCapacity, 'voyageur')}</span><button type="button" data-action="hx-filter-remove" data-arg="minCapacity" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    if (cuRackFilter.q) {
      chips.push(`<span class="hx-filter-chip"><span>${hxLang() === 'en' ? '“' + esc(cuRackFilter.q) + '”' : '« ' + esc(cuRackFilter.q) + ' »'}</span><button type="button" data-action="hx-filter-remove" data-arg="q" aria-label="${tx('Retirer ce filtre')}">×</button></span>`);
    }

    return `<div class="hx-filter-chips-wrap">
      <div class="hx-filter-chips">${chips.join('')}</div>
      <button type="button" class="hx-filter-reset-btn" data-action="hx-room-filter-reset">${tx('Effacer les filtres')}</button>
      <span class="hx-room-matching-count">${tx(matchingCount > 1 ? '{n} chambres affichées sur {total}' : '{n} chambre affichée sur {total}', { n: matchingCount, total: totalCount })}</span>
    </div>`;
  }

function cuMatchNationality(val, opts = {}) {
    if (!val) return null;
    const raw = String(val).trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const byCode = cuNationalities.find((n) => n.code === upper);
    if (byCode) return byCode.code;

    const needle = cuNormalizeText(raw);
    if (!needle) return null;

    const exact = cuNationalities.filter((n) => {
      if (n.code.toLowerCase() === needle) return true;
      if (cuNormalizeText(n.demonym.fr) === needle) return true;
      if (cuNormalizeText(n.demonym.en) === needle) return true;
      if (cuNormalizeText(n.demonym.ar) === needle) return true;
      if (cuNormalizeText(n.name.fr) === needle) return true;
      if (cuNormalizeText(n.name.en) === needle) return true;
      if (cuNormalizeText(n.name.ar) === needle) return true;
      return (n.aliases || []).some((a) => cuNormalizeText(a) === needle);
    });
    if (exact.length === 1) return exact[0].code;
    if (exact.length > 1) return null;

    if (opts && opts.allowPrefix) {
      const prefixMatches = cuNationalities.filter((n) => {
        if (n.demonym.fr && cuNormalizeText(n.demonym.fr).startsWith(needle)) return true;
        if (n.demonym.en && cuNormalizeText(n.demonym.en).startsWith(needle)) return true;
        if (n.name.fr && cuNormalizeText(n.name.fr).startsWith(needle)) return true;
        if (n.name.en && cuNormalizeText(n.name.en).startsWith(needle)) return true;
        return (n.aliases || []).some((a) => cuNormalizeText(a).startsWith(needle));
      });
      if (prefixMatches.length === 1) return prefixMatches[0].code;
    }

    return null;
  }

function cuNationalitySelectorHtml(g, idx, prefix = '', disabled = false) {
    const raw = g?.nationality || '';
    const matched = cuMatchNationality(raw);
    const isLegacyUnmatched = !!raw && !matched;
    const canonicalCode = matched || (isLegacyUnmatched ? raw : '');
    const displayLabel = matched ? cuNationalityLabel(matched) : (isLegacyUnmatched ? raw : '');
    const uid = 'nat_' + (prefix || 'gst_') + idx + '_' + Math.random().toString(36).slice(2, 8);
    const inputId = uid + '_inp';
    const menuId = uid + '_menu';

    return `
      <div class="hx-nat-combobox" data-hx-nat-box id="${uid}">
        <input type="hidden" data-hx-guest-nationality value="${esc(canonicalCode)}">
        <div class="hx-nat-input-wrap">
          <input type="text" id="${inputId}" class="hx-nat-search" data-hx-nat-search autocomplete="off" placeholder="${tx('Rechercher une nationalité…')}" value="${esc(displayLabel)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="listbox" ${disabled ? 'disabled' : ''}>
          <button type="button" class="hx-nat-clear" data-hx-nat-clear aria-label="${tx('Effacer la sélection')}" ${displayLabel && !disabled ? '' : 'hidden'}>&times;</button>
        </div>
        <div id="${menuId}" class="hx-nat-menu" data-hx-nat-menu role="listbox" aria-label="${tx('Nationalités')}" hidden></div>
        ${isLegacyUnmatched ? `
          <div class="hx-nat-legacy-alert" data-hx-nat-legacy role="status">
            <span class="hx-badge-legacy">${tx('Valeur existante à vérifier : « {v} »', { v: esc(raw) })}</span>
            ${!disabled ? `<button type="button" class="hx-link-btn" data-hx-nat-clear-legacy>${tx('Corriger')}</button>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

function cuWireNationalitySelectors(container) {
    if (!container) return;
    const boxes = container.querySelectorAll('[data-hx-nat-box]');
    boxes.forEach((box) => {
      if (box.__hxWired) return;
      box.__hxWired = true;
      const hidden = box.querySelector('[data-hx-guest-nationality]');
      const search = box.querySelector('[data-hx-nat-search]');
      const clear = box.querySelector('[data-hx-nat-clear]');
      const menu = box.querySelector('[data-hx-nat-menu]');
      const legacy = box.querySelector('[data-hx-nat-legacy]');
      const legacyBtn = box.querySelector('[data-hx-nat-clear-legacy]');
      const menuId = menu?.id || ('hx_nat_menu_' + Math.random().toString(36).slice(2, 8));
      if (menu && !menu.id) menu.id = menuId;

      let activeIndex = -1;

      const updateActiveDescendant = (items) => {
        items.forEach((it, i) => {
          const isAct = i === activeIndex;
          it.classList.toggle('is-selected', isAct);
          it.setAttribute('aria-selected', isAct ? 'true' : 'false');
          if (isAct) {
            search.setAttribute('aria-activedescendant', it.id);
            it.scrollIntoView({ block: 'nearest' });
          }
        });
        if (activeIndex < 0) {
          search.removeAttribute('aria-activedescendant');
        }
      };

      const renderMenu = (items) => {
        if (!items.length) {
          menu.innerHTML = `<div class="hx-nat-empty" role="none">${tx('Aucune nationalité correspondante')}</div>`;
          menu.hidden = false;
          search.setAttribute('aria-expanded', 'true');
          activeIndex = -1;
          search.removeAttribute('aria-activedescendant');
          return;
        }
        const lang = cuLang();
        menu.innerHTML = items.slice(0, 40).map((n, idx) => `
          <div class="hx-nat-item" role="option" id="${menuId}_opt_${idx}" data-idx="${idx}" data-code="${esc(n.code)}" aria-selected="false" tabindex="-1">
            <div class="hx-nat-item-main">
              <span class="hx-nat-item-code">${esc(n.code)}</span>
              <span class="hx-nat-item-label">${esc(n.demonym[lang] || n.demonym.fr || n.code)}</span>
            </div>
            <span class="hx-nat-item-name">${esc(n.name[lang] || n.name.fr || n.code)}</span>
          </div>
        `).join('');
        menu.hidden = false;
        search.setAttribute('aria-expanded', 'true');
        activeIndex = -1;
        search.removeAttribute('aria-activedescendant');
      };

      const filterList = (query) => {
        const q = cuNormalizeText(query);
        if (!q) return cuNationalities;
        return cuNationalities.filter((n) => {
          if (n.code.toLowerCase().includes(q)) return true;
          if (cuNormalizeText(n.demonym.fr).includes(q)) return true;
          if (cuNormalizeText(n.demonym.en).includes(q)) return true;
          if (cuNormalizeText(n.demonym.ar).includes(q)) return true;
          if (cuNormalizeText(n.name.fr).includes(q)) return true;
          if (cuNormalizeText(n.name.en).includes(q)) return true;
          if (cuNormalizeText(n.name.ar).includes(q)) return true;
          return (n.aliases || []).some((a) => cuNormalizeText(a).includes(q));
        });
      };

      const selectCode = (code) => {
        const item = cuNationalities.find((n) => n.code === code);
        if (!item) return;
        hidden.value = item.code;
        search.value = cuNationalityLabel(item.code);
        search.classList.remove('is-invalid');
        clear.hidden = false;
        menu.hidden = true;
        search.setAttribute('aria-expanded', 'false');
        search.removeAttribute('aria-activedescendant');
        activeIndex = -1;
        if (legacy) legacy.remove();
        search.dispatchEvent(new Event('change', { bubbles: true }));
      };

      search.addEventListener('input', () => {
        const q = search.value.trim();
        clear.hidden = !q;
        search.classList.remove('is-invalid');
        // Immediately decouple canonical hidden input when user edits search text
        // to prevent silent submission of prior country:
        if (hidden.value) {
          const currentLabel = cuNationalityLabel(hidden.value);
          if (cuNormalizeText(currentLabel) !== cuNormalizeText(q)) {
            hidden.value = '';
          }
        }
        search.removeAttribute('aria-activedescendant');
        renderMenu(filterList(q));
      });

      search.addEventListener('focus', () => {
        renderMenu(filterList(search.value));
      });

      search.addEventListener('keydown', (e) => {
        const items = menu.querySelectorAll('.hx-nat-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (menu.hidden) { renderMenu(filterList(search.value)); return; }
          activeIndex = Math.min(activeIndex + 1, items.length - 1);
          updateActiveDescendant(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (menu.hidden) return;
          activeIndex = Math.max(activeIndex - 1, 0);
          updateActiveDescendant(items);
        } else if (e.key === 'Enter') {
          if (!menu.hidden && activeIndex >= 0 && items[activeIndex]) {
            e.preventDefault();
            selectCode(items[activeIndex].dataset.code);
          }
        } else if (e.key === 'Tab') {
          if (!menu.hidden && activeIndex >= 0 && items[activeIndex]) {
            selectCode(items[activeIndex].dataset.code);
          } else {
            menu.hidden = true;
            search.setAttribute('aria-expanded', 'false');
            search.removeAttribute('aria-activedescendant');
          }
        } else if (e.key === 'Escape') {
          menu.hidden = true;
          search.setAttribute('aria-expanded', 'false');
          search.removeAttribute('aria-activedescendant');
          activeIndex = -1;
        }
      });

      menu.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.hx-nat-item');
        if (item && item.dataset.code) {
          e.preventDefault();
          selectCode(item.dataset.code);
        }
      });

      clear.addEventListener('click', (e) => {
        e.preventDefault();
        hidden.value = '';
        search.value = '';
        search.classList.remove('is-invalid');
        clear.hidden = true;
        menu.hidden = true;
        search.setAttribute('aria-expanded', 'false');
        search.removeAttribute('aria-activedescendant');
        activeIndex = -1;
        if (legacy) legacy.remove();
        search.focus();
        search.dispatchEvent(new Event('change', { bubbles: true }));
      });

      if (legacyBtn) {
        legacyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          hidden.value = '';
          search.value = '';
          search.classList.remove('is-invalid');
          clear.hidden = true;
          legacy.remove();
          search.focus();
          renderMenu(cuNationalities);
          search.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      document.addEventListener('click', (e) => {
        if (!box.contains(e.target)) {
          menu.hidden = true;
          search.setAttribute('aria-expanded', 'false');
          search.removeAttribute('aria-activedescendant');
          activeIndex = -1;
          const currentCode = hidden.value;
          if (currentCode) {
            const matched = cuMatchNationality(currentCode);
            if (matched) {
              search.value = cuNationalityLabel(matched);
              search.classList.remove('is-invalid');
            }
          } else {
            const txt = search.value.trim();
            if (txt) {
              const matched = cuMatchNationality(txt);
              if (matched) {
                selectCode(matched);
              } else {
                search.classList.add('is-invalid');
              }
            } else {
              search.value = '';
              clear.hidden = true;
              search.classList.remove('is-invalid');
            }
          }
        }
      });
    });
  }

function cuParseDelimitedLine(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    const len = line.length;
    while (i < len) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          current += c;
          i++;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
        } else if (c === ',' || c === '\t' || c === ';') {
          parts.push(current.trim());
          current = '';
          i++;
        } else {
          current += c;
          i++;
        }
      }
    }
    parts.push(current.trim());
    return parts;
  }

function cuHasGroupRecovery() {
    const merchant = cuMerchantSlug();
    if (!merchant) return false;
    try {
      const staged = JSON.parse(localStorage.getItem('kiwi:hotel-group-staged:' + merchant) || 'null');
      if (staged && staged.merchant === merchant) return true;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('kiwi_hx_intent_')) continue;
        const intent = JSON.parse(localStorage.getItem(key) || 'null');
        if (intent && intent.merchant === merchant && intent.status !== 'complete') return true;
      }
    } catch (_) {}
    return false;
  }

async function cuMoveStayStatus(id, next, button, reopen, force = false) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return;
    const scope = cuStayScope(), cache = cuStayCache();
    /* Quatre mouvements passent par ici, pas deux : arrivée, départ, annulation
       d'une arrivée saisie par erreur, et non-présentation. Les messages les
       nomment tous — « Départ non enregistré » sur une annulation d'arrivée
       ferait douter la réception de ce qu'elle vient de faire. */
    const WORDING = {
      checked_in: { fail: tx('Arrivée non enregistrée'), done: tx('Client arrivé'), desc: tx('La chambre apparaît occupée dans le plan.') },
      completed: { fail: tx('Départ non enregistré'), done: tx('Départ enregistré'), desc: tx('La chambre passe à nettoyer. Les nuits réservées restent dues, même en cas de départ anticipé. Aucun frais d’annulation supplémentaire.') },
      confirmed: { fail: tx('Arrivée non annulée'), done: tx('Arrivée annulée'), desc: tx('Le séjour repart de « confirmé » et la chambre est rendue. Le geste est tracé au journal.') },
      no_show: { fail: tx('Non-présentation non enregistrée'), done: tx('Client non présenté'), desc: tx('Le séjour est clos sans facturation de séjour. La chambre est libérée.') },
    };
    if (reopen) WORDING.checked_in = { fail: tx('Dossier non rouvert'), done: tx('Dossier rouvert'),
      desc: tx('La facturation redevient modifiable. Reclôturez le séjour une fois le dossier réparé.') };
    const words = WORDING[next] || WORDING.completed;
    if (button) button.disabled = true;
    try {
      const res = await fetch('/api/hotel/stays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', merchant: slug, id, status: next, force,
          /* Réouverture d'un dossier clos : un geste explicite, jamais un
             effet de bord d'un changement de statut ordinaire. */
          ...(reopen ? { reopen: true } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) return;
      if (res.status === 409 && body.error === 'stay-unpaid' && !force) {
        if (confirm(tx('Il reste {amount} MAD à régler. Confirmer le départ avec ce solde impayé ?', { amount: cuDraftMoney(body.owedCents) }))) return await cuMoveStayStatus(id, next, button, reopen, true);
        return;
      }
      if (!res.ok || !body.booking) {
        toast(words.fail, {
          type: 'warn',
          desc: body.error === 'invalid-status-transition'
            ? tx('Statut actuel : {status}. Ouvrez le dossier.', { status: body.from ? cuDraftStatus(body.from) : tx('inconnu') })
            : body.error === 'reopen-forbidden'
              ? tx('Seul le propriétaire du compte peut rouvrir un dossier clos.')
            : body.error === 'room-occupied'
              ? tx('Cette chambre est déjà occupée par un autre séjour. Vérifiez le plan et attribuez une autre chambre.')
              : (body.error || tx('Réessayez.')),
        });
        return;
      }
      cache.set(body.booking.id, body.booking);
      cuStaysChanged();
      if (scope !== cuStayScope() || cuMerchantSlug() !== slug) return;
      const doc = window.KiwiReservations?.get?.();
      if (doc && Array.isArray(doc.bookings)) {
        const i = doc.bookings.findIndex((x) => x.id === body.booking.id);
        if (i >= 0) doc.bookings[i] = body.booking;
      }
      toast(words.done, { type: 'success', desc: words.desc });
      rerender();
    } catch (_) {
      toast(tx('Confirmation non reçue'), { type: 'warn', desc: tx('Actualisez le journal pour vérifier si le mouvement a été enregistré.') });
    } finally { if (button) button.disabled = false; }
  }

function cuBirthIso(raw) {
    const s = String(raw || '').trim().replace(/-/g, '/');
    if (!s) return { ok: true, iso: '' };
    const iso = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    let y = 0, m = 0, d = 0;
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (fr) { d = +fr[1]; m = +fr[2]; y = +fr[3]; }
    else return { ok: false, iso: '' };
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, iso: '' };
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false, iso: '' };
    const p = (n) => String(n).padStart(2, '0');
    return { ok: true, iso: `${y}-${p(m)}-${p(d)}` };
  }

function cuCommercialError(code) {
    return tx(({ stale: txk('Le répertoire a changé sur un autre appareil. Actualisez avant de reprendre votre modification.'),
      'rate-gap': txk('Une ou plusieurs nuits n’ont aucun tarif. Complétez les dates du contrat.'),
      'rate-overlap': txk('Deux tarifs couvrent les mêmes dates pour ce compte, cette catégorie, cette occupation et cette formule.'),
      'mixed-tax-basis': txk('Le séjour mélange des tarifs HT et TTC. Harmonisez le contrat.'),
      'account-required': txk('Sélectionnez un compte commercial avant de simuler un contrat.'),
      'account-archived': txk('Le compte commercial sélectionné est archivé. Choisissez un compte actif ou réactivez-le dans le Cardex.'),
      'account-not-found': txk('Le compte commercial sélectionné est introuvable pour cet établissement.'),
      'account-unavailable': txk('Le compte commercial est absent ou archivé.'),
      'room-type-not-found': txk('La catégorie choisie ne peut pas accueillir ce nombre d’occupants ou est introuvable.'),
      'room-unavailable': txk('Cette chambre vient d’être prise sur ces dates. Choisissez-en une autre.'),
      'invalid-price': txk('Saisissez un montant positif ou nul, avec deux décimales maximum.'),
      'quote-required': txk('Simulez puis acceptez le tarif pour les dates et voyageurs sélectionnés.'),
      'reprice-required': txk('Les dates, la chambre, la formule ou le compte ont changé : vérifiez le nouveau tarif affiché puis confirmez.'),
      'direct-pricing-required': txk('Formule sans tarif : affichez le prix maison ci-dessus, ou convenez un prix avec le client.'),
      'rate-missing': txk('Aucun tarif configuré pour cette formule. Renseignez-le dans Types de chambres, ou convenez un prix.'),
      'price-mismatch': txk('Le tarif affiché ne correspond plus à la configuration. Recommencez la réservation.'),
      'price-overflow': txk('Montant trop élevé pour être enregistré. Vérifiez le tarif.'),
      'mixed-pricing': txk('Un séjour ne peut pas combiner compte commercial et tarif maison. Choisissez un seul mode.'),
      'agreed-invalid': txk('Prix convenu invalide : montant positif et motif de 3 caractères minimum.'),
      'agreed-forbidden': txk('Un prix convenu exige un responsable (propriétaire ou gérant).'),
      'tax-configuration-required': txk('Un tarif HT ne peut pas être confirmé avant configuration de la fiscalité hôtelière.'),
      'feed-contract-unsupported': txk('Un séjour importé par iCal ne peut pas encore recevoir un contrat tarifaire.'),
      'closed-commercial': txk('Les informations commerciales d’un dossier clôturé sont verrouillées.'),
      'invalid-day-use': txk('Le day-use nécessite une arrivée et un départ le même jour, avec une heure de départ après l’arrivée.'),
      'day-use-price-required': txk('Indiquez le forfait day-use convenu, sans tarif automatique par nuit.'),
      'stay-mode-locked': txk('Le type de séjour est fixé à la création. Créez un nouveau séjour pour le modifier.'),
      'day-use-contract-unsupported': txk('Les contrats par nuit ne sont pas applicables au day-use. Indiquez son forfait TTC.'),
      'linked-stay-not-found': txk('Le dossier d’origine est introuvable dans cet hôtel.'),
      unauthorized: txk('Accès réservé au compte propriétaire ou à la console opérateur.'),
      'invalid-dates': txk('Vérifiez les dates de début et de fin.'),
      'invalid-formula': txk('La tarification contractuelle couvre de 1 à 3 personnes (Single, Double ou Triple). Ajustez le nombre d’occupants.') })[code] || txk('Enregistrement indisponible. Vérifiez les champs et réessayez.'));
  }

function cuCommercialBody() {
    const st = cuCommercialState(), needle = st.search.toLocaleLowerCase('fr');
    const accounts = st.accounts.filter(a => (!st.kind || a.kind === st.kind) && [a.name, a.legalName, a.contact, a.ice].join(' ').toLocaleLowerCase('fr').includes(needle));
    const accountIds = new Set(accounts.map(a => a.id));
    const contracts = st.contracts.filter(r => accountIds.has(r.accountId));
    const active = st.accounts.filter(a => !a.archived);
    return `<div class="hx-page hx-commercial"><div class="hx-commercial-head"><div><span class="hx-kicker">${tx('RELATIONS HÔTELIÈRES')}</span><h3>${tx('Chaque relation,<br>ses accords.')}</h3><p>${tx('Clients, agences & sociétés. Le voyageur reste distinct du réservant et du compte à facturer. Les tarifs acceptés sont conservés dans chaque séjour.')}</p></div><div class="hx-commercial-tools"><button data-activation=write class="hx-btn atlas" data-action="hx-account-new">${tx('+ Nouveau compte')}</button><button class="hx-btn ghost" data-action="clients-directory">${tx('Cardex voyageurs')}</button></div></div>
      <div class="hx-commercial-summary" aria-label="${tx('Comptes actifs')}">${Object.entries(cuKinds).map(([kind, label]) => `<div><span>${label}</span><strong>${st.loaded ? active.filter(a => a.kind === kind).length : '…'}</strong><small>${tx('comptes actifs')}</small></div>`).join('')}<div><span>${tx('Tarifs contractuels')}</span><strong>${st.loaded ? st.contracts.filter(r => !r.archived).length : '…'}</strong><small>${tx('périodes définies')}</small></div></div>
      <div class="hx-commercial-tools"><button class="hx-btn ghost" data-action="hx-contract-new">${tx('+ Tarif contractuel')}</button><button class="hx-btn ghost" data-action="hx-production">${tx('Production mensuelle')}</button><button class="hx-btn ghost" data-action="hx-commercial-refresh" ${st.loading ? 'disabled' : ''}>${tx('Actualiser')}</button></div>
      <form class="hx-commercial-filter" data-hx-commercial-filter><label>${tx('Type')}<select name="kind"><option value="">${tx('Tous les comptes')}</option>${Object.entries(cuKinds).map(([v,l]) => `<option value="${v}" ${st.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>${tx('Recherche')}<input name="search" type="search" value="${esc(st.search)}" placeholder="${tx('Nom, contact, ICE')}"></label><button class="hx-btn ghost" type="submit">${tx('Filtrer')}</button></form>
      <p class="hx-commercial-feedback" role="status">${esc(st.error || (st.loading ? tx('Chargement du répertoire…') : tx('{a} compte(s) · {b} tarif(s) actif(s) dans cette sélection', { a: accounts.length, b: contracts.filter(r => !r.archived).length })))}</p>
      <div class="hx-commercial-grid">${accounts.map(a => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${cuKinds[a.kind]}${a.archived ? ' · ' + tx('ARCHIVÉ') : ''}</span><h3>${esc(a.name)}</h3><p>${esc(a.legalName || a.contact || tx('Identité de facturation à compléter'))}</p><small>${esc([a.city, a.ice ? 'ICE ' + a.ice : '', tx('Échéance {n} j', { n: a.paymentDays })].filter(Boolean).join(' · '))}</small></div><div class="hx-commercial-tools"><button data-activation=write class="hx-btn ghost" data-action="hx-account-edit" data-arg="${esc(a.id)}">${tx('Modifier')} <span class="sr-only">${esc(a.name)}</span></button><button class="hx-btn ghost" data-action="hx-account-stays" data-arg="${esc(a.id)}">${tx('Voir les séjours')} <span class="sr-only">${esc(a.name)}</span></button></div></article>`).join('') || `<p>${tx('Aucun compte dans cette sélection. Créez une agence, une société ou un particulier.')}</p>`}</div>
      <div class="hx-h"><span class="t">${tx('Grille contractuelle')}</span><span class="s">${tx('Bornes inclusives · MAD · aucun tarif implicite hors période')}</span></div>
      <div class="hx-commercial-grid">${contracts.map(r => `<article class="block hx-commercial-card"><div><span class="hx-kicker">${esc(st.accounts.find(a => a.id === r.accountId)?.name || tx('Compte indisponible'))}${r.archived ? ' · ' + tx('ARCHIVÉ') : ''}</span><h3>${esc(r.name)}</h3><p>${esc(cuTypes().find(t => t.id === r.roomTypeId)?.name || r.roomTypeId)} · ${['', 'Single', 'Double', 'Triple'][r.occupancy]} · ${cuBoards[r.board]}</p><small>${ltr(`${esc(r.from)} → ${esc(r.to)}`)}</small><p class="hx-commercial-price">${ltr(cuDraftMoney(r.amountCents))} <small>${tx(r.unit === 'person' ? 'MAD / personne / nuit' : 'MAD / chambre / nuit')} · ${r.taxBasis === 'inclusive' ? tx('TTC') : tx('HT')}</small></p></div><button data-activation=write class="hx-btn ghost" data-action="hx-contract-edit" data-arg="${esc(r.id)}">${tx('Modifier')} <span class="sr-only">${esc(r.name)}</span></button></article>`).join('') || `<p class="hx-commercial-empty">${tx('Aucun tarif dans cette sélection. Ajoutez une période négociée avec ses dates exactes. Septembre à décembre doit être défini explicitement.')}</p>`}</div></div>`;
  }

async function cuCommercialEditor(kind, id) {
    const scope = cuStayScope();
    await cuLoadCommercial();
    if (scope !== cuStayScope()) return;
    const st = cuCommercialState();
    if (!st.loaded || st.error) { toast(st.error || tx('Répertoire indisponible'), { type: 'warn' }); return; }
    const key = kind === 'account' ? 'accounts' : 'contracts';
    const old = st[key].find(x => x.id === id);
    if (id && !old) return;
    const item = old || { id: 'hc-' + crypto.randomUUID(), kind: 'agency', paymentDays: 0, occupancy: 1, board: 'room_only', unit: 'room', taxBasis: 'inclusive' };
    const field = (name, label, type = 'text', attrs = '') => `<label><span>${label}</span><input name="${name}" type="${type}"${['email', 'tel', 'date', 'number'].includes(type) || ['ice', 'taxId', 'rc'].includes(name) ? ' dir="ltr"' : ''} value="${esc(item[name] ?? '')}" ${attrs}></label>`;
    const select = (name, label, options) => `<label><span>${label}</span><select name="${name}">${Object.entries(options).map(([v,l]) => `<option value="${esc(v)}" ${String(item[name]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const accountFields = () => select('kind', tx('Type de compte'), cuKinds) + field('name', tx('Nom usuel'), 'text', 'required maxlength="160"') + field('legalName', tx('Raison sociale / nom facturé'), 'text', 'maxlength="160"') + field('contact', tx('Contact'), 'text', 'maxlength="160"') + field('address', tx('Adresse de facturation'), 'text', 'maxlength="500"') + field('city', tx('Ville'), 'text', 'maxlength="100"') + field('country', tx('Pays'), 'text', 'maxlength="100"') + field('ice', tx('ICE'), 'text', 'maxlength="40"') + field('taxId', tx('Identifiant fiscal'), 'text', 'maxlength="40"') + field('rc', tx('Registre de commerce'), 'text', 'maxlength="40"') + field('email', tx('E-mail'), 'email', 'maxlength="160"') + field('phone', tx('Téléphone'), 'tel', 'maxlength="40"') + field('paymentDays', tx('Délai de paiement (jours)'), 'number', 'required min="0" max="365" step="1"') + field('notes', tx('Notes internes'), 'text', 'maxlength="600"');
    const contractFields = () => select('accountId', tx('Compte contractant'), Object.fromEntries(st.accounts.filter(a => !a.archived || a.id === item.accountId).map(a => [a.id, a.name]))) + field('name', tx('Libellé du tarif'), 'text', 'required maxlength="160"') + select('roomTypeId', tx('Catégorie'), Object.fromEntries(cuTypes().map(t => [t.id,t.name]))) + select('occupancy', tx('Occupation totale'), { 1: tx('Single · 1 personne'), 2: tx('Double · 2 personnes'), 3: tx('Triple · 3 personnes') }) + select('board', tx('Formule incluse'), cuBoards) + select('unit', tx('Prix par'), { room: tx('Chambre / nuit'), person: tx('Personne / nuit') }) + field('from', tx('À partir du (inclus)'), 'date', 'required') + field('to', tx('Jusqu’au (inclus)'), 'date', 'required') + `<label><span>${tx('Montant MAD')}</span><input name="amount" dir="ltr" type="number" required min="0" max="1000000" step="0.01" value="${item.amountCents == null ? '' : (item.amountCents / 100).toFixed(2)}"></label>` + select('taxBasis', tx('Base du prix'), { inclusive: tx('TTC'), exclusive: tx('HT · simulation seulement') });
    const m = K().modal({ tag: kind === 'account' ? tx('COMPTE HÔTEL') : tx('TARIF CONTRACTUEL'), title: old ? tx('Modifier la fiche') : tx('Créer une fiche'), width: 720,
      desc: kind === 'account' ? tx('Les modifications ne remplacent pas l’identité de facturation déjà acceptée dans un séjour.') : tx('Prix de la formule par nuit. Aucune taxe locale ou réduction enfant n’est ajoutée automatiquement. Faites valider le traitement fiscal avant facturation.'),
      body: `<form data-hx-commercial-editor><div class="hx-room-form hx-type-form">${kind === 'account' ? accountFields() : contractFields()}<label><span>${tx('État')}</span><select name="archived"><option value="false">${tx('Actif')}</option><option value="true" ${item.archived ? 'selected' : ''}>${tx('Archivé')}</option></select></label></div><p role="status" data-hx-commercial-error></p><div class="hx-room-form-actions"><button data-activation=write class="hx-btn atlas" type="submit">${tx('Enregistrer')}</button></div></form>` });
    const form = m.el.querySelector('form'), revision = st.rev, merchant = cuChannelMerchant();
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (form.__busy) return;
      const error = form.querySelector('[data-hx-commercial-error]');
      if (scope !== cuStayScope()) { error.textContent = tx('L’hôtel actif a changé. Rouvrez cette fiche.'); return; }
      const fd = Object.fromEntries(new FormData(form)), row = { ...fd, id: item.id, archived: fd.archived === 'true' };
      if (kind === 'account') row.paymentDays = Number(fd.paymentDays);
      else { row.occupancy = Number(fd.occupancy); row.amountCents = Math.round(Number(fd.amount) * 100); }
      form.__busy = true; const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const res = await fetch('/api/hotel/commercial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: kind, rev: revision, item: row }) });
        const b = await res.json(); if (!res.ok) { error.textContent = cuCommercialError(b.error); return; }
        Object.assign(st, { accounts: b.accounts, contracts: b.contracts, rev: b.rev });
        m.close(); if (scope === cuStayScope()) { rerender(); toast(tx('Fiche enregistrée'), { type: 'success' }); }
      } catch (_) { error.textContent = tx('Confirmation non reçue. Actualisez le répertoire avant de réessayer, votre référence de fiche est conservée.'); }
      finally { form.__busy = false; button.disabled = false; }
    });
  }

function cuEconomatBody() {
    const s = cuEconomatState;
    if (!s.loaded && s.loading) return `<div class="hx-econ-loading"><i></i>${tx('Lecture de la configuration et des migrations…')}</div>`;
    const d = s.draft || cuEconomatDraft(s.registry);
    const registryReady = s.registry.units.length > 0 && cuOutletsMapped(d);
    const inventory = s.report ? `<div class="hx-econ-kpis">
      <div><span>${tx('Stock hôtel consolidé')}</span><b>${cuQty(s.report.consolidated?.closingMilli)}</b><small>${tx('{n} références', { n: s.report.consolidated?.items?.length || 0 })}</small></div>
      <div><span>${tx('Unités suivies')}</span><b>${s.report.units?.length || 0}</b><small>${s.report.units?.every((u) => u.reconciliation?.balanced) ? tx('réconciliées') : tx('écart à examiner')}</small></div>
      <div><span>${tx('Comptages physiques')}</span><b>${s.report.physicalCounts?.observed || 0}</b><small>${tx('{n} appliqués', { n: s.report.physicalCounts?.applied || 0 })}</small></div>
    </div><div class="hx-econ-unit-report">${(s.report.units || []).map((unit) => `<div><span><b dir="ltr">${esc(unit.locationId)}</b><small>${tx('{n} références', { n: unit.items?.length || 0 })}</small></span><strong>${cuQty(unit.reconciliation?.closingMilli)}</strong><i class="${unit.reconciliation?.balanced ? 'ok' : 'bad'}">${unit.reconciliation?.balanced ? tx('équilibré') : tx('à vérifier')}</i></div>`).join('')}</div>`
      : `<div class="hx-econ-empty">${esc(tx(s.reportError) || (s.registry.units.length ? tx('Le rapport sera disponible après les migrations de production.') : tx('Configurez les unités pour ouvrir le rapport consolidé.')))}</div>`;
    const shiftRows = s.shifts.length ? s.shifts.map((shift) => `<button data-action="hx-econ-shift" data-arg="${esc(shift.shiftId)}" class="${s.selectedShift === shift.shiftId ? 'on' : ''}"><span><b>${new Date(shift.lastTs).toLocaleString(hxLocale())}</b><small>${tx('{a} charges · {b} annulations', { a: shift.chargeCount, b: shift.reversalCount })}</small></span><strong>${cuMoney(shift.netCents)}</strong></button>`).join('') : `<div class="hx-econ-empty">${tx('Aucune charge chambre enregistrée sur les 30 derniers jours.')}</div>`;
    const cashiers = s.shiftReport ? `<div class="hx-econ-cashiers">${(s.shiftReport.cashiers || []).map((row) => `<div><span><b>${esc(row.cashierName || row.cashierId)}</b><small>${tx('{a} charges · {b} annulations', { a: row.chargeCount, b: row.reversalCount })}</small></span><strong>${cuMoney(row.netCents)}</strong></div>`).join('')}</div>` : '';
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>${tx('ÉCONOMAT · PILOTE')}</span><h3>${tx('La vérité opérationnelle de l’hôtel')}</h3><p>${tx('Configuration des unités, stock consolidé et charges chambre, sans données client.')}</p></div><button class="hx-btn ghost" data-action="hx-econ-refresh">${tx('Actualiser')}</button></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(tx(s.error))}</div>` : ''}
      <div class="hx-econ-readiness"><div class="${registryReady ? 'ok' : 'wait'}"><b>${registryReady ? tx('Registre prêt') : tx('Registre incomplet')}</b><span>${s.registry.units.length ? tx('{a} unités · {b} caisses', { a: s.registry.units.length, b: Object.keys(s.registry.terminalUnits || {}).length }) : tx('aucune écriture en production')}</span></div><div class="${s.report ? 'ok' : 'wait'}"><b>${s.report ? tx('Rapports disponibles') : tx('Migration à confirmer')}</b><span>${s.report ? tx('stock et comptages lisibles') : esc(tx(s.reportError) || tx('aucune donnée fabriquée'))}</span></div><div class="wait"><b>Discovery D</b><span>${tx('visite terrain requise · jamais validée par logiciel')}</span></div></div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Stock consolidé')}</span><span class="s">${tx('équation par unité et vue hôtel')}</span></div>${inventory}</div>
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Charges chambre par poste')}</span><span class="s">${tx('aucun nom de client ni numéro de chambre')}</span></div><div class="hx-econ-shifts">${shiftRows}</div>${cashiers}</div>
      ${cuUnitsEditorHtml(d)}
    </div>`;
  }

function cuUnitsEditorHtml(d) {
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    const allOutletsMapped = cuOutletsMapped(d);
    const unitRows = d.units.map((unit) => `<div class="hx-econ-unit" data-hx-econ-unit="${esc(unit.id)}">
      <span class="kind">${unit.kind === 'economat' ? tx('ÉCONOMAT') : unit.kind === 'department' ? tx('DÉPARTEMENT') : tx('POINT DE VENTE')}</span>
      <input data-hx-econ-name value="${esc(unit.name)}" maxlength="120" aria-label="${tx('Nom de l’unité')}">
      ${unit.kind === 'department' ? `<input data-hx-econ-store value="" type="hidden"><span class="type">${tx('service interne')}</span>` : unit.kind === 'economat' ? `<input data-hx-econ-store value="economat" type="hidden"><span class="type">${tx('stock central')}</span>` : `<select data-hx-econ-store><option value="restaurant" ${unit.storeType === 'restaurant' ? 'selected' : ''}>${HX_PDV_KINDS.restaurant}</option><option value="bar" ${unit.storeType === 'bar' ? 'selected' : ''}>${HX_PDV_KINDS.bar}</option><option value="cafe" ${unit.storeType === 'cafe' ? 'selected' : ''}>${HX_PDV_KINDS.cafe}</option><option value="spa" ${unit.storeType === 'spa' ? 'selected' : ''}>${HX_PDV_KINDS.spa}</option></select>`}
      <label><input data-hx-econ-active type="checkbox" ${unit.active ? 'checked' : ''} ${unit.kind === 'economat' ? 'disabled' : ''}> ${tx('active')}</label>
      <code>${esc(unit.locationId)}</code>
    </div>`).join('');
    const terminalRows = d.terminals.map((row, index) => `<div class="hx-econ-terminal" data-hx-econ-terminal-row>
      <input data-hx-econ-terminal dir="ltr" value="${esc(row.terminalId)}" maxlength="80" placeholder="term_…">
      <select data-hx-econ-terminal-unit><option value="">${tx('Choisir le point de vente')}</option>${outlets.map((unit) => `<option value="${esc(unit.id)}" ${row.unitId === unit.id ? 'selected' : ''}>${esc(unit.name)}</option>`).join('')}</select>
      <button data-action="hx-econ-remove-terminal" data-arg="${index}" aria-label="${tx('Retirer')}">×</button>
    </div>`).join('');
    return `<div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Unités et caisses')}</span><span class="s">${tx('un seul enregistrement atomique')}</span></div><div class="hx-econ-units">${unitRows}</div><div class="hx-econ-add"><button data-activation=write class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="outlet">${tx('+ Point de vente')}</button><button data-activation=write class="hx-btn ghost" data-action="hx-econ-add-unit" data-arg="department">${tx('+ Département')}</button></div>
        <div class="hx-econ-terminal-head"><b>${tx('Assignation des caisses')}</b><span>${tx('Copiez l’identifiant depuis chaque caisse physique.')}</span><button data-activation=write class="hx-btn ghost" data-action="hx-econ-add-terminal">${tx('+ Caisse')}</button></div><div>${terminalRows || `<div class="hx-econ-empty">${tx('Aucune caisse assignée. Le premier registre ne peut pas être activé ainsi.')}</div>`}</div>
        <label class="hx-econ-confirm"><input type="checkbox" data-hx-econ-confirm> ${tx('J’ai relevé toutes les caisses physiques et vérifié leur point de vente.')}</label>
        <div class="hx-econ-save"><span>${allOutletsMapped ? tx('Chaque point de vente actif a au moins une caisse.') : tx('Chaque point de vente actif doit avoir une caisse.')}</span><button data-activation=write class="hx-btn atlas" data-action="hx-econ-save" ${cuEconomatState.saving ? 'disabled' : ''}>${cuEconomatState.saving ? tx('Enregistrement…') : tx('Enregistrer unités + caisses')}</button></div>
      </div>`;
  }

function cuPdvBody() {
    const s = cuEconomatState;
    if (!s.loaded && s.loading) return `<div class="hx-econ-loading"><i></i>${tx('Lecture de la configuration…')}</div>`;
    const d = s.draft || cuEconomatDraft(s.registry);
    const outlets = d.units.filter((unit) => unit.kind === 'outlet');
    const cards = outlets.length ? outlets.map((unit) => {
      const terms = d.terminals.filter((row) => row.unitId === unit.id && row.terminalId).map((row) => row.terminalId);
      return `<article class="hx-pdv-card" data-hx-pdv-card="${esc(unit.id)}">
        <div><span class="kind">${tx('POINT DE VENTE')}${unit.active ? '' : ' · ' + tx('INACTIF')}</span><b>${esc(unit.name)}</b><small>${esc(HX_PDV_KINDS[unit.storeType] || tx('Genre à choisir'))} · <code>${esc(unit.locationId)}</code></small></div>
        <div><span>${terms.length ? terms.map((t) => `<code>${esc(t)}</code>`).join(' ') : tx('aucune caisse assignée')}</span></div>
        <div><button class="hx-btn ghost" data-action="hx-outlet-menu" data-arg="${esc(unit.id)}">${tx('Menu & prix')}</button></div>
      </article>`;
    }).join('') : `<div class="hx-econ-empty">${tx('Aucun point de vente. Ajoutez-en un ci-dessous : il partagera le registre de l’économat, sans doublon.')}</div>`;
    return `<div class="hx-econ-shell" data-hx-economat>
      <div class="hx-econ-head"><div><span>${tx('POINTS DE VENTE')}</span><h3>${tx('Restaurants, bars et caisses')}</h3><p>${tx('Nommez chaque point de vente, assignez ses caisses physiques, consultez ce qu’elles vendent. Un seul registre partagé avec l’économat : renommer ici, c’est renommer partout.')}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="hx-btn ghost" data-action="nav-economat">${tx('Économat · stock central')}</button><button class="hx-btn ghost" data-action="hx-econ-refresh">${tx('Actualiser')}</button></div></div>
      ${s.error ? `<div class="hx-econ-alert bad">${esc(tx(s.error))}</div>` : ''}
      <div class="hx-econ-section"><div class="hx-h"><span class="t">${tx('Vos points de vente')}</span><span class="s">${tx('{a} actifs · {b} caisses assignées', { a: outlets.filter((unit) => unit.active).length, b: d.terminals.filter((row) => row.terminalId && row.unitId).length })}</span></div><div class="hx-pdv-cards">${cards}</div></div>
      ${cuUnitsEditorHtml(d)}
    </div>`;
  }

async function cuLoadEconomat(force) {
    if (!isCustomHotel() || cuEconomatState.loading) return;
    const merchant = cuMerchantSlug();
    if (!merchant) { cuEconomatState.error = txk('Établissement hôtel introuvable.'); cuEconomatState.loaded = true; rerender(); return; }
    cuEconomatState.loading = true;
    if (!cuEconomatState.loaded) rerender();
    const qs = encodeURIComponent(merchant);
    try {
      const docResponse = await fetch(`/api/store?feature=hotel-units&merchant=${qs}`, { credentials: 'same-origin' });
      const doc = await docResponse.json();
      if (!docResponse.ok) throw new Error(doc.error || txk('unités indisponibles'));
      cuEconomatState.rev = Number(doc.rev) || 0;
      cuEconomatState.registry = doc.data && Array.isArray(doc.data.units) ? doc.data : { units: [], terminalUnits: {} };
      if (force || !cuEconomatState.draft) cuEconomatState.draft = cuEconomatDraft(cuEconomatState.registry);
      cuEconomatState.report = null; cuEconomatState.reportError = ''; cuEconomatState.shifts = [];
      if (cuEconomatState.registry.units.length) {
        const since = Date.now() - 30 * 86400000;
        const [inventoryResponse, shiftsResponse] = await Promise.all([
          fetch(`/api/inventory/hotel-reports?merchant=${qs}`, { credentials: 'same-origin' }),
          fetch(`/api/hotel/room-charges?merchant=${qs}&mode=shifts&since=${since}`, { credentials: 'same-origin' }),
        ]);
        const inventoryBody = await inventoryResponse.json();
        const shiftsBody = await shiftsResponse.json();
        if (inventoryResponse.ok) cuEconomatState.report = inventoryBody.report;
        else cuEconomatState.reportError = inventoryBody.dependency ? tx('Migration manquante : {name}', { name: inventoryBody.dependency }) : String(inventoryBody.error || txk('rapport indisponible'));
        if (shiftsResponse.ok) cuEconomatState.shifts = Array.isArray(shiftsBody.shifts) ? shiftsBody.shifts : [];
        else if (!cuEconomatState.reportError) cuEconomatState.reportError = String(shiftsBody.error || txk('charges chambre indisponibles'));
      }
      cuEconomatState.error = '';
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    cuEconomatState.loading = false; cuEconomatState.loaded = true;
    rerender();
  }

async function cuSaveEconomat(el) {
    if (cuEconomatState.saving) return;
    cuCaptureEconomatDraft();
    const host = el.closest('[data-hx-economat]');
    const d = cuEconomatState.draft;
    if (!host?.querySelector('[data-hx-econ-confirm]')?.checked) {
      toast(tx('Confirmez le relevé de toutes les caisses'), { type: 'warn', desc: tx('Une caisse oubliée continuerait à vendre sans synchroniser son stock.') }); return;
    }
    const outlets = d.units.filter((unit) => unit.kind === 'outlet' && unit.active);
    if (!outlets.length) { toast(tx('Ajoutez au moins un point de vente actif'), { type: 'warn' }); return; }
    if (d.units.some((unit) => !unit.name)) { toast(tx('Chaque unité doit avoir un nom'), { type: 'warn' }); return; }
    const terminalUnits = {};
    for (const row of d.terminals) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(row.terminalId) || !outlets.some((unit) => unit.id === row.unitId) || terminalUnits[row.terminalId]) {
        toast(tx('Corrigez les identifiants de caisse'), { type: 'warn', desc: tx('Chaque identifiant doit être unique et relié à un point de vente actif.') }); return;
      }
      terminalUnits[row.terminalId] = row.unitId;
    }
    if (outlets.some((unit) => !Object.values(terminalUnits).includes(unit.id))) {
      toast(tx('Une caisse manque pour un point de vente actif'), { type: 'warn' }); return;
    }
    const merchant = cuMerchantSlug();
    const data = { units: d.units.map((unit) => ({ id: unit.id, name: unit.name, kind: unit.kind, storeType: unit.storeType, locationId: unit.locationId, active: !!unit.active })), terminalUnits };
    cuEconomatState.saving = true; rerender();
    try {
      const response = await fetch('/api/store', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'hotel-units', merchant, baseRev: cuEconomatState.rev, data }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && body.data) { cuEconomatState.rev = body.rev; cuEconomatState.registry = body.data; cuEconomatState.draft = cuEconomatDraft(body.data); }
        throw new Error(body.detail || body.error || tx('enregistrement refusé'));
      }
      cuEconomatState.rev = body.rev; cuEconomatState.registry = data; cuEconomatState.draft = cuEconomatDraft(data);
      toast(tx('Unités et caisses enregistrées ensemble'), { type: 'success', desc: tx('{a} unités · {b} caisses.', { a: data.units.length, b: Object.keys(terminalUnits).length }) });
    } catch (error) { cuEconomatState.error = String(error && error.message || error); }
    cuEconomatState.saving = false; cuEconomatState.loaded = false;
    cuLoadEconomat(true);
  }

return Object.freeze({ counts, receptionBody, rackBody, cuConnectingAvail, tapeBody, hotesBody, forecastSvg, intelBody, cuEvaluateStayExceptions, cuReceptionJournal, cuReceptionBody, cuParseRoomNumbers, cuUploadTypePhotos, cuUpdateFloorsManagerModal, cuRegisterWalkin, cuUnlinkConnectingRooms, cuSetConnectingRooms, cuRoomMatchesFilter, cuFilterChipsMarkup, cuMatchNationality, cuNationalitySelectorHtml, cuWireNationalitySelectors, cuParseDelimitedLine, cuHasGroupRecovery, cuMoveStayStatus, cuBirthIso, cuCommercialError, cuCommercialBody, cuCommercialEditor, cuEconomatBody, cuUnitsEditorHtml, cuPdvBody, cuLoadEconomat, cuSaveEconomat });
};

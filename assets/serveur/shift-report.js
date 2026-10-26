function serveurShiftReport() {
(function () {
      /* --- ranks (serif names in the UI) --- */
      const KG_RANKS = [
        { name: 'Apprenti',         xp: 100  },
        { name: 'Garçon',           xp: 700  },
        { name: 'Serveur',          xp: 1700 },
        { name: 'Serveur Confirmé', xp: 2750 },
        { name: 'Maître',           xp: 4400 },
        { name: "Maître d'Hôtel",   xp: 6800 },
      ];

      /* Fourteen distinct challenges in a fixed shuffled order. A calendar day
         advances exactly one slot, so nothing repeats inside a two-week window. */
      const KG_DEFIS = [
        { text: 'Réglez 3 tables pendant ce service', target: 3,    metric: 'tables'  },
        { text: 'Atteignez 1 000 MAD ce service',     target: 1000, metric: 'revenue' },
        { text: 'Accompagnez 5 tables jusqu’au règlement', target: 5, metric: 'tables' },
        { text: 'Encaissez 500 MAD ce service',       target: 500,  metric: 'revenue' },
        { text: 'Réglez 8 tables avant la fermeture', target: 8,    metric: 'tables'  },
        { text: 'Atteignez 1 500 MAD ce service',     target: 1500, metric: 'revenue' },
        { text: 'Terminez 2 tables ce service',       target: 2,    metric: 'tables'  },
        { text: 'Encaissez 750 MAD ce service',       target: 750,  metric: 'revenue' },
        { text: 'Réglez 6 tables pendant ce service', target: 6,    metric: 'tables'  },
        { text: 'Atteignez 2 000 MAD ce service',     target: 2000, metric: 'revenue' },
        { text: 'Accompagnez 4 tables jusqu’au règlement', target: 4, metric: 'tables' },
        { text: 'Encaissez 300 MAD ce service',       target: 300,  metric: 'revenue' },
        { text: 'Réglez 7 tables avant la fermeture', target: 7,    metric: 'tables'  },
        { text: 'Atteignez 1 250 MAD ce service',     target: 1250, metric: 'revenue' },
      ];
      function kgDefi() {
        const dayNumber = Math.floor(Date.parse(employeeDayKey() + 'T12:00:00Z') / 86400000);
        return KG_DEFIS[((dayNumber % KG_DEFIS.length) + KG_DEFIS.length) % KG_DEFIS.length];
      }

      /* --- persistence (keyed by server initials) --- */
      const KG_KEY = 'kiwi-serveur-progress';
      const kgInitials  = (servers[currentUser] && servers[currentUser].initials) || 'YK';
      const kgFirstName = (((servers[currentUser] && servers[currentUser].name) || 'Yassir')).split(' ')[0];

      function kgDefaults() {
        return { lifetimeXP: 0, records: { bestNight: 0, streak: 0, bestSpeed: null }, updatedTs: 0 };
      }
      function kgLoad() {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(KG_KEY)) || {}; } catch (e) {}
        const s = all[currentUser] || all[kgInitials] || kgDefaults();
        const r = (s && s.records) || {};
        return {
          lifetimeXP: Number.isFinite(s.lifetimeXP) ? s.lifetimeXP : 0,
          records: {
            bestNight: Number.isFinite(r.bestNight) ? r.bestNight : 0,
            streak:    Number.isFinite(r.streak)    ? r.streak    : 0,
            bestSpeed: Number(r.bestSpeed) > 0 ? Number(r.bestSpeed) : null,
          },
          updatedTs: Number(s.updatedTs) || 0,
        };
      }
      function kgSave() {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(KG_KEY)) || {}; } catch (e) {}
        all[currentUser || kgInitials] = kgState;
        try { localStorage.setItem(KG_KEY, JSON.stringify(all)); } catch (e) {}
      }

      /* --- shift-local state (resets each shift / page reload) --- */
      let kgState        = kgLoad();
      let kgShiftRevenue = 0;  // MAD encaissé this shift (tallied via markTablePaid)
      let kgShiftTurnMin = 0;  // sum of occupancy minutes of paid tables
      let kgShareLine    = 'Service bouclé';
      const kgBroke      = { bestNight: false, bestSpeed: false };

      /* ── LE DÉCOMPTE DU SERVICE SURVIT AU RECHARGEMENT ─────────────────────
         « Tables réglées », « Défi du soir » (40 / 500 MAD) et l'XP versée à la
         fin du service ne vivaient qu'en mémoire : un rechargement, un onglet
         recyclé par iOS, et un serveur qui avait encaissé cinq tables lisait
         « 0 / 500 MAD » puis perdait ses points. On écrit le décompte, par
         commerce et par employé, avec l'heure de début du service ; il n'est
         relu que pour LE MÊME service (un nouveau pointage ne l'hérite pas). */
      let kgTallyFor = 0, kgTallyLast = '';
      function kgTallyKey() { return 'kiwi:service-shift-tally-v1:' + (svSlug() || 'store') + ':' + (currentUser || kgInitials); }
      function kgTallySync() {
        if (!shiftStart || SV_DEMO) return;
        const start = shiftStart.getTime();
        if (kgTallyFor !== start) {
          kgTallyFor = start;
          try {
            const d = JSON.parse(localStorage.getItem(kgTallyKey()) || 'null');
            if (d && d.start === start) {
              tablesPaid = Math.max(tablesPaid, Number(d.paid) || 0);
              kgShiftRevenue = Math.max(kgShiftRevenue, Number(d.rev) || 0);
              kgShiftTurnMin = Math.max(kgShiftTurnMin, Number(d.turn) || 0);
            }
          } catch (_) {}
        }
        const now = JSON.stringify({ start: start, paid: tablesPaid, rev: kgShiftRevenue, turn: kgShiftTurnMin });
        if (now !== kgTallyLast) {
          kgTallyLast = now;
          try { localStorage.setItem(kgTallyKey(), now); } catch (_) {}
        }
      }

      // Chaque part acquittée compte tout de suite, jamais le pourboire.
      function kgRecordPayment(amount, minutes = 0) {
        kgTallySync(); // Relire le cumul avant le premier ajout après rechargement.
        kgShiftRevenue = (Math.round(kgShiftRevenue * 100) + Math.round(amount * 100)) / 100;
        kgShiftTurnMin += minutes;
        kgTallySync();
        if (shiftStart) kgRenderProfil();
        kgUpdateRankChip();
      }
      servicePaymentTally = kgRecordPayment;

      /* --- helpers --- */
      const kgNum = n => new Intl.NumberFormat(employeeLocale(), { useGrouping: true }).format(Math.round(n || 0));
      function kgFmtDur(min) {
        const h = Math.floor(min / 60), m = min % 60;
        if (employeeLanguage === 'ar') return h > 0 ? (h + ' س ' + String(m).padStart(2, '0') + ' د') : (m + ' د');
        if (employeeLanguage === 'en') return h > 0 ? (h + 'h ' + String(m).padStart(2, '0') + 'm') : (m + ' min');
        return h > 0 ? (h + 'h ' + String(m).padStart(2, '0')) : (m + ' mn');
      }
      function kgRankName(rank) {
        if (!rank) return employeeTranslation('Aucun grade');
        const names = {
          en: { 'Apprenti': 'Apprentice', 'Garçon': 'Waiter', 'Serveur': 'Server', 'Serveur Confirmé': 'Senior server', 'Maître': 'Head waiter', "Maître d'Hôtel": "Maître d'" },
          ar: { 'Apprenti': 'متدرّب', 'Garçon': 'نادل', 'Serveur': 'مقدّم خدمة', 'Serveur Confirmé': 'مقدّم خدمة متمرس', 'Maître': 'رئيس القاعة', "Maître d'Hôtel": 'مدير القاعة' }
        };
        return ((names[employeeLanguage] || {})[rank.name]) || rank.name;
      }
      function kgChallengeText(defi) {
        if (employeeLanguage === 'ar') return defi.metric === 'tables'
          ? `سدّد ${defi.target} طاولات خلال هذه الوردية`
          : `حصّل ${kgNum(defi.target)} MAD خلال هذه الوردية`;
        if (employeeLanguage === 'en') return defi.metric === 'tables'
          ? `Settle ${defi.target} tables during this shift`
          : `Collect ${kgNum(defi.target)} MAD during this shift`;
        return defi.text;
      }
      function kgRankIdxFor(xp) {
        let idx = -1;
        for (let i = 0; i < KG_RANKS.length; i++) if (xp >= KG_RANKS[i].xp) idx = i;
        return idx;
      }
      function kgSyncCloud() {
        const cloud = liveEmployeeState && liveEmployeeState.progress;
        if (!cloud || Number(cloud.updatedTs) < Number(kgState.updatedTs || 0)) return;
        kgState = {
          lifetimeXP: Math.max(0, Number(cloud.lifetimeXP) || 0),
          records: {
            bestNight: Math.max(0, Number(cloud.records && cloud.records.bestNight) || 0),
            streak: Math.max(0, Number(cloud.records && cloud.records.streak) || 0),
            bestSpeed: Number(cloud.records && cloud.records.bestSpeed) > 0 ? Number(cloud.records.bestSpeed) : null,
          },
          updatedTs: Math.max(0, Number(cloud.updatedTs) || 0),
        };
        kgSave();
      }

      /* --- live shift snapshot (computed; never mutates app state) --- */
      function kgSnapshot() {
        kgTallySync();
        const durMin = shiftStart ? Math.max(0, Math.floor((Date.now() - shiftStart.getTime()) / 60000)) : 0;
        const cloudPayments = !SV_DEMO && liveEmployeeState && liveEmployeeState.shiftPayments;
        const revenue = cloudPayments ? Number(cloudPayments.amountCents) / 100 : kgShiftRevenue;
        const paid = tablesPaid;
        const occupied = Object.values(tables).filter(t =>
          t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'ka-tkhdam'
        ).length;
        const speed = paid > 0 ? Math.round(kgShiftTurnMin / paid) : null;
        const shiftXP = Math.round(paid * 10 + revenue * 0.01);
        const totalXP = kgState.lifetimeXP + shiftXP;
        const rankIdx = kgRankIdxFor(totalXP);
        const rank = rankIdx >= 0 ? KG_RANKS[rankIdx] : null;
        const next = KG_RANKS[rankIdx + 1] || null;
        const floorXP = rank ? rank.xp : 0;
        const progress = next ? (totalXP - floorXP) / (next.xp - floorXP) : 1;
        return {
          durMin: durMin, paid: paid, served: paid + occupied, occupied: occupied,
          speed: speed, shiftXP: shiftXP, totalXP: totalXP,
          rankIdx: rankIdx, rank: rank, next: next, progress: progress,
          revenue: revenue, ticket: paid > 0 ? revenue / paid : 0,
        };
      }
      function kgDefiProgress() {
        const snap = kgSnapshot();
        const challenge = kgDefi();
        const val = challenge.metric === 'tables' ? snap.paid : snap.revenue;
        return { val: val, target: challenge.target, frac: Math.min(1, val / challenge.target), done: val >= challenge.target };
      }

      /* --- profil card rendering --- */
      function kgSetRecTile(key, value, unit, isRecord) {
        const tile = document.getElementById('kg-rec-' + key);
        const num  = document.getElementById('kg-rec-' + key + '-num');
        if (!tile || !num) return;
        num.innerHTML = value == null
          ? '<span class="kg-rec-pending">' + employeeTranslation('À établir') + '</span>'
          : (unit ? (value + '<small>' + unit + '</small>') : String(value));
        const flagKey = key === 'night' ? 'bestNight' : (key === 'speed' ? 'bestSpeed' : null);
        if (isRecord) {
          tile.classList.add('is-record');
          if (flagKey && !kgBroke[flagKey]) {
            kgBroke[flagKey] = true;
            tile.classList.add('kg-just-broke');
            setTimeout(function () { tile.classList.remove('kg-just-broke'); }, 1500);
          }
        } else {
          tile.classList.remove('is-record');
        }
      }
      function kgRenderProfil() {
        kgSyncCloud();
        const snap = kgSnapshot();

        /* a) Niveau / Grade */
        const nameEl = document.getElementById('kg-rank-name');
        if (nameEl) nameEl.textContent = kgRankName(snap.rank);
        const xpEl = document.getElementById('kg-rank-xp');
        if (xpEl) xpEl.textContent = kgNum(snap.totalXP);
        const fillEl = document.getElementById('kg-rank-fill');
        if (fillEl) fillEl.style.width = Math.round(snap.progress * 100) + '%';
        const nextEl = document.getElementById('kg-rank-next');
        const gapEl  = document.getElementById('kg-rank-gap');
        if (snap.next) {
          if (nextEl) nextEl.innerHTML = (employeeLanguage === 'ar' ? 'التالي · ' : employeeLanguage === 'en' ? 'Next · ' : 'Prochain · ') + '<em>' + kgRankName(snap.next) + '</em>';
          if (gapEl)  gapEl.textContent = '+' + kgNum(snap.next.xp - snap.totalXP) + ' XP';
        } else {
          if (nextEl) nextEl.innerHTML = '<em>' + (employeeLanguage === 'ar' ? 'بلغت أعلى مستوى' : employeeLanguage === 'en' ? 'Highest rank reached' : 'Grade maximal atteint') + '</em>';
          if (gapEl)  gapEl.textContent = '';
        }

        /* b) Records personnels */
        const hasRecords = snap.paid > 0
          || kgState.records.bestNight > 0
          || kgState.records.streak > 0
          || kgState.records.bestSpeed != null;
        const recGrid = document.getElementById('kg-rec-grid');
        const recEmpty = document.getElementById('kg-rec-empty');
        if (recGrid) recGrid.hidden = !hasRecords;
        if (recEmpty) recEmpty.hidden = hasRecords;
        const nightBeat = snap.paid > kgState.records.bestNight;
        const speedBeat = snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed);
        kgSetRecTile('night',  Math.max(kgState.records.bestNight, snap.paid) || null, '', nightBeat);
        kgSetRecTile('streak', kgState.records.streak || null, '', false);
        kgSetRecTile('speed',  snap.speed != null ? snap.speed : kgState.records.bestSpeed, ' mn', speedBeat);

        /* c) Défi du soir */
        const dp = kgDefiProgress();
        const defiText = document.getElementById('kg-defi-text');
        if (defiText) defiText.textContent = dp.done
          ? (employeeLanguage === 'ar' ? 'اكتمل التحدي' : employeeLanguage === 'en' ? 'Challenge complete' : 'Défi accompli')
          : kgChallengeText(kgDefi());
        const defiFill = document.getElementById('kg-defi-fill');
        if (defiFill) defiFill.style.width = Math.round(dp.frac * 100) + '%';
        const defiMeta = document.getElementById('kg-defi-meta');
        if (defiMeta) {
          const tableUnit = employeeLanguage === 'ar' ? 'طاولات' : employeeLanguage === 'en' ? 'tables' : 'tables';
          defiMeta.textContent = kgDefi().metric === 'tables'
            ? (kgNum(dp.val) + ' / ' + kgNum(dp.target) + ' ' + tableUnit)
            : (kgNum(dp.val) + ' / ' + kgNum(dp.target) + ' MAD');
        }
        const defiCard = document.getElementById('kg-defi-card');
        if (defiCard) defiCard.classList.toggle('is-done', dp.done);

        if (window.lucide) lucide.createIcons();
      }

      /* --- rank chip on the card payment screen --- */
      function kgUpdateRankChip() {
        const roleEl = document.getElementById('kg-card-rank-role');
        const rank = kgSnapshot().rank;
        if (roleEl) roleEl.textContent = kgRankName(rank).toLocaleLowerCase(employeeLocale());
      }

      /* --- Carte du soir : pick the best thing about tonight --- */
      function kgBestHighlight(snap) {
        /* La carte du soir compose ses phrases (un chiffre au milieu, un grade
           en italique) : elles se choisissent ici dans la langue de l'app, le
           traducteur du DOM ne sait pas recoller des morceaux. */
        const P = employeePick;
        const startIdx = kgRankIdxFor(kgState.lifetimeXP);
        if (snap.rank && snap.rankIdx > startIdx) {
          const r = kgRankName(snap.rank);
          return { label: P('Niveau débloqué', 'Level unlocked', 'مستوى جديد'), icon: 'trending-up',
                   text: P('Tu passes <em>' + r + '</em> ce soir.', 'You move up to <em>' + r + '</em> tonight.', 'ترتقي إلى <em>' + r + '</em> هذا المساء.'),
                   share: P('Niveau ' + r + ' débloqué', 'Level ' + r + ' unlocked', 'مستوى ' + r + ' مفتوح') };
        }
        if (snap.paid > kgState.records.bestNight) {
          return { label: P('Nouveau record', 'New record', 'رقم قياسي جديد'), icon: 'trophy',
                   text: P('<em>' + snap.paid + ' tables</em> réglées, ton meilleur soir.', '<em>' + snap.paid + ' tables</em> paid, your best night.', '<em>' + snap.paid + ' طاولات</em> مدفوعة، أفضل مساء لك.'),
                   share: P('Nouveau record · ' + snap.paid + ' tables réglées', 'New record · ' + snap.paid + ' tables paid', 'رقم قياسي جديد · ' + snap.paid + ' طاولات مدفوعة') };
        }
        if (snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed)) {
          return { label: P('Nouveau record', 'New record', 'رقم قياسي جديد'), icon: 'zap',
                   text: P('<em>' + snap.speed + ' mn</em> par table, jamais aussi rapide.', '<em>' + snap.speed + ' min</em> per table, your fastest yet.', '<em>' + snap.speed + ' د</em> لكل طاولة، الأسرع حتى الآن.'),
                   share: P('Record de vitesse · ' + snap.speed + ' mn par table', 'Speed record · ' + snap.speed + ' min per table', 'رقم قياسي في السرعة · ' + snap.speed + ' د لكل طاولة') };
        }
        if (kgDefiProgress().done) {
          const d = kgChallengeText(kgDefi()).toLocaleLowerCase(employeeLocale());
          return { label: P('Défi accompli', 'Challenge done', 'تم التحدي'), icon: 'flag',
                   text: P('Défi du soir relevé, <em>' + d + '</em>.', "Tonight's challenge done, <em>" + d + '</em>.', 'أُنجز تحدي المساء، <em>' + d + '</em>.'),
                   share: P('Défi du soir accompli', "Tonight's challenge done", 'أُنجز تحدي المساء') };
        }
        const lines = P([
          'Service propre, du début à la fin.',
          'Chaque table comptée, beau travail.',
          'Un service de plus, bien mené.',
          'Régulier et solide, c\'est ça le métier.',
        ], [
          'A clean service, start to finish.',
          'Every table counted, nice work.',
          'One more service, well run.',
          "Steady and solid, that's the job.",
        ], [
          'خدمة نظيفة من البداية إلى النهاية.',
          'كل طاولة محسوبة، عمل جميل.',
          'خدمة أخرى أُديرت جيداً.',
          'منتظم وثابت، هذه هي المهنة.',
        ]);
        return { label: P('Ce soir', 'Tonight', 'هذا المساء'), icon: 'sparkles',
                 text: lines[(snap.paid + employeeCivilDate().getDate()) % lines.length],
                 share: P('Service bouclé', 'Shift wrapped', 'انتهت الخدمة') };
      }

      /* --- Carte du soir : open the shift report --- */
      function kgOpenShiftCard() {
        const veil = document.getElementById('kg-shiftcard');
        if (!veil) { clockOut(); return; }
        const snap = kgSnapshot();

        const now = employeeCivilDate();
        const metaEl = document.getElementById('kg-sc-meta');
        const dayLine = now.toLocaleDateString(employeeLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
        if (metaEl) metaEl.textContent = (svName('Café Atlas') ? svName('Café Atlas') + ' · ' : '') +
          dayLine.charAt(0).toLocaleUpperCase(employeeLocale()) + dayLine.slice(1);

        const rows = [
          ['Tables servies',          String(snap.served),                            false],
          ['Tables réglées',          String(snap.paid),                              false],
          ['Revenu encaissé',         kgNum(snap.revenue) + ' MAD',                   true ],
          ['Ticket moyen',            kgNum(snap.ticket) + ' MAD',                    true ],
          ['Durée du service',        kgFmtDur(snap.durMin),                          false],
          ['Vitesse moyenne / table', (snap.speed != null ? snap.speed + employeePick(' mn', ' min', ' د') : '·'), false],
        ];
        const rowsEl = document.getElementById('kg-sc-rows');
        if (rowsEl) rowsEl.innerHTML = rows.map(function (r, i) {
          return '<div class="kg-sc-row" style="animation-delay:' + (i * 80) + 'ms">' +
                   '<span class="kg-sc-row-label">' + r[0] + '</span>' +
                   '<span class="kg-sc-row-value' + (r[2] ? ' kg-mono' : '') + '">' + r[1] + '</span>' +
                 '</div>';
        }).join('');

        const hl = kgBestHighlight(snap);
        kgShareLine = hl.share;
        const hlEl    = document.getElementById('kg-sc-highlight');
        const hlIcon  = veil.querySelector('.kg-sc-hl-icon');
        const hlLabel = document.getElementById('kg-sc-hl-label');
        const hlText  = document.getElementById('kg-sc-hl-text');
        if (hlIcon)  hlIcon.innerHTML = '<i data-lucide="' + hl.icon + '"></i>';
        if (hlLabel) hlLabel.textContent = hl.label;
        if (hlText)  hlText.innerHTML = hl.text;
        if (hlEl) {
          hlEl.style.display = 'flex';
          hlEl.style.animation = 'none';
          void hlEl.offsetWidth;                      // restart the entrance animation
          hlEl.style.animation = '';
          hlEl.style.animationDelay = (rows.length * 80 + 60) + 'ms';
        }

        veil.classList.add('is-open');
        if (window.lucide) lucide.createIcons();
      }

      /* --- bank the shift into lifetime progress at clock-out --- */
      function kgBankShift() {
        const snap = kgSnapshot();
        window.__kiwiShiftProgress = { paid: snap.paid, revenue: snap.revenue, turnMinutes: kgShiftTurnMin };
        kgState.lifetimeXP += snap.shiftXP;
        if (snap.paid > kgState.records.bestNight) kgState.records.bestNight = snap.paid;
        if (snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed))
          kgState.records.bestSpeed = snap.speed;
        if (snap.paid >= 8) kgState.records.streak += 1;
        else if (snap.paid > 0) kgState.records.streak = 1;
        kgState.updatedTs = Date.now(); kgSave();
        /* reset shift-local accumulators for the next shift */
        kgShiftRevenue = 0; kgShiftTurnMin = 0;
        try { localStorage.removeItem(kgTallyKey()); } catch (_) {}
        kgTallyFor = 0; kgTallyLast = '';
        kgBroke.bestNight = false; kgBroke.bestSpeed = false;
      }

      /* --- share the shift card --- */
      function shareShiftCard() {
        const snap = kgSnapshot();
        const place = svName('Café Atlas');
        const txt = employeePick(
          'Mon service ce soir' + (place ? ' au ' + place : '') + '\n• ' + snap.served + ' tables servies\n• ' + kgNum(snap.revenue) + ' MAD encaissés\n• ' + kgShareLine + '\nvia Kiwi',
          'My shift tonight' + (place ? ' at ' + place : '') + '\n• ' + snap.served + ' tables served\n• ' + kgNum(snap.revenue) + ' MAD collected\n• ' + kgShareLine + '\nvia Kiwi',
          'خدمتي هذا المساء' + (place ? ' في ' + place : '') + '\n• ' + snap.served + ' طاولات مخدومة\n• ' + kgNum(snap.revenue) + ' MAD محصّلة\n• ' + kgShareLine + '\nعبر Kiwi');
        if (navigator.share) {
          navigator.share({ text: txt }).catch(function () {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () { toast('Copié'); })
                                            .catch(function () { toast('Copié'); });
        } else {
          toast('Copié');
        }
      }

      /* --- intercept markTablePaid: pass-through wrapper, tallies revenue only.
             The original runs unchanged — the payment flow is untouched. --- */
      const kgOrigMarkTablePaid = markTablePaid;
      markTablePaid = async function (id) {
        let rev = 0, occ = 0;
        try {
          rev = (typeof getTableTotal === 'function' && id) ? (getTableTotal(id) || 0) : 0;
          occ = (tables[id] && tables[id].elapsed) || 0;
        } catch (e) {}
        const result = await kgOrigMarkTablePaid.apply(this, arguments);
        if (!result) return result; // Aucun encaissement sur refus ou délai réseau.
        try {
          servicePaymentTally(rev, occ);
        } catch (e) {}
        return result;
      };

      /* --- wrap renderProfil so the gamification cards refresh with the tab --- */
      const kgOrigRenderProfil = renderProfil;
      renderProfil = function () {
        const r = kgOrigRenderProfil.apply(this, arguments);
        try { if (shiftStart) kgRenderProfil(); } catch (e) {}
        return r;
      };

      /* --- intercept the clock-out button in the capture phase, so it runs
             before the existing #profil-clockout listener (which never fires) --- */
      document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('#profil-clockout')) return;
        e.stopPropagation();
        e.preventDefault();
        kgOpenShiftCard();
      }, true);

      /* --- Carte du soir buttons --- */
      const kgShareBtn = document.getElementById('kg-sc-share');
      if (kgShareBtn) kgShareBtn.addEventListener('click', shareShiftCard);
      const kgClockoutBtn = document.getElementById('kg-sc-clockout');
      if (kgClockoutBtn) kgClockoutBtn.addEventListener('click', function () {
        kgBankShift();
        const veil = document.getElementById('kg-shiftcard');
        if (veil) veil.classList.remove('is-open');
        clockOut();  // the original clock-out logic
      });

      /* --- keep the card-screen rank chip fresh whenever the modal opens --- */
      const kgCardModal = document.getElementById('card-modal');
      if (kgCardModal && window.MutationObserver) {
        new MutationObserver(function () {
          if (kgCardModal.classList.contains('is-open')) kgUpdateRankChip();
        }).observe(kgCardModal, { attributes: true, attributeFilter: ['class'] });
      }

      /* --- init --- */
      const kgChipName = document.querySelector('#kg-card-rank-chip .kg-rank-chip-name');
      if (kgChipName) kgChipName.textContent = kgFirstName;
      kgUpdateRankChip();

      /* expose for the share button + console inspection */
      window.shareShiftCard = shareShiftCard;
      window.kgSnapshot = kgSnapshot;
      window.kgRenderProfil = kgRenderProfil;
    })();
}


/* Owner: interactive · the data-action handler map
 * Moved verbatim from assets/interactive.js (tools/interactive-split-test.mjs rebuilds the
 * original byte for byte). Loaded before interactive.js; registering runs nothing.
 * Borrows from interactive.js: CP_STR, CURRENCY_NAMES, GENERAL_STR, I, KPI_DESC, KPI_LONG, LOGIN_STR, NOTIFICATIONS_STR, SIGNUP_STR, aiResponses, appPage, commandPalette, confetti, currencyLabel, drawer, escape, kiwiLang, kpiData, kpiHero, kpiInsight, kpiSection, materialSymbol, menu, methodsKey, methodsSaved, modal, morningPush, settingsRow, toast, tr, txData. */
(function () {
  'use strict';
  (window.__kiwiInteractiveParts = window.__kiwiInteractiveParts || {}).handlers = function (__deps) {
    const { CP_STR, CURRENCY_NAMES, GENERAL_STR, I, KPI_DESC, KPI_LONG, LOGIN_STR, NOTIFICATIONS_STR, SIGNUP_STR, aiResponses, appPage, commandPalette, confetti, currencyLabel, drawer, escape, kiwiLang, kpiData, kpiHero, kpiInsight, kpiSection, materialSymbol, menu, methodsKey, methodsSaved, modal, morningPush, settingsRow, toast, tr, txData } = __deps;
/* <<split:handlers>> */
  /* ═══════════════════════ HANDLERS ═══════════════════════ */
  const handlers = {

    /* Generic "Annuler / Fermer" affordances for locally-built modals & drawers
     * (e.g. the Spa-CRM forms in pages-pro.js). They route the click to the
     * overlay's real close button so scroll-lock + focus-return run correctly. */
    'dismiss-modal': (el) => {
      const back = el?.closest?.('.kiwi-backdrop') || document.querySelector('.kiwi-backdrop');
      back?.querySelector('.kiwi-modal-close')?.click();
    },
    'dismiss-drawer': (el) => {
      const back = el?.closest?.('.kiwi-drawer-backdrop') || document.querySelector('.kiwi-drawer-backdrop');
      back?.querySelector('.kiwi-drawer-close')?.click();
    },

    'manage-billing': () => toast(
      tr({ fr: 'Gestion de l\'abonnement', en: 'Manage subscription', ar: 'إدارة الاشتراك' }),
      { type: 'info', desc: tr({
        fr: 'Kiwi Pro · 399 MAD/mois · prélèvement le 1er du mois. Sans engagement.',
        en: 'Kiwi Pro · 399 MAD/month · charged on the 1st. No commitment.',
        ar: 'كيوي برو · 399 درهم/شهر · الخصم يوم 1. بدون التزام.' }) }),

    'signup': () => {
      let step = 0;
      let business = 'resto';
      const s = SIGNUP_STR[kiwiLang()] || SIGNUP_STR.fr;
      const gen = GENERAL_STR[kiwiLang()] || GENERAL_STR.fr;

      const m = modal({
        tag: s.tag,
        title: s.title,
        desc: s.desc,
        body: render(),
        width: 560,
      });
      function render() {
        return `
          <div class="wiz-steps">
            <div class="wiz-step ${step >= 0 ? 'active' : ''}"></div>
            <div class="wiz-step ${step >= 1 ? 'active' : ''}"></div>
            <div class="wiz-step ${step >= 2 ? 'active' : ''}"></div>
          </div>
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; text-transform:uppercase; font-family:var(--mono); margin-bottom:10px;">${s.step_prefix} ${step + 1} / 3 · ${s.steps[step]}</div>
          ${step === 0 ? step0() : step === 1 ? step1() : step2()}
          <div style="display:flex; justify-content:space-between; margin-top:22px; gap:10px;">
            <button class="kb ghost" data-prev ${step === 0 ? 'disabled style="opacity:0.4;"' : ''}>${gen.back}</button>
            <button class="kb primary" data-next>${step === 2 ? s.finish_button : gen.continue}</button>
          </div>
        `;
      }
      function step0() {
        return `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="wiz-choice ${business==='resto'?'selected':''}" data-biz="resto">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3v7"/></svg></div>
              <div><div class="wc-t">${s.business_resto}</div><div class="wc-d">${s.business_resto_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='retail'?'selected':''}" data-biz="retail">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
              <div><div class="wc-t">${s.business_retail}</div><div class="wc-d">${s.business_retail_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='services'?'selected':''}" data-biz="services">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg></div>
              <div><div class="wc-t">${s.business_services}</div><div class="wc-d">${s.business_services_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='other'?'selected':''}" data-biz="other">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>
              <div><div class="wc-t">${s.business_other}</div><div class="wc-d">${s.business_other_desc}</div></div>
            </div>
          </div>
        `;
      }
      function step1() {
        return `
          <div class="kf-group">
            <label class="kf-label">${s.shop_name_label}</label>
            <input class="kf-input" placeholder="${s.shop_name_placeholder}" />
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">${s.first_name_label}</label>
              <input class="kf-input" placeholder="${s.first_name_placeholder}" />
            </div>
            <div class="kf-group">
              <label class="kf-label">${s.last_name_label}</label>
              <input class="kf-input" placeholder="${s.last_name_placeholder}" />
            </div>
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">${s.phone_label}</label>
              <input class="kf-input" placeholder="${s.phone_placeholder}" />
            </div>
            <div class="kf-group">
              <label class="kf-label">${s.city_label}</label>
              <input class="kf-input" placeholder="${s.city_placeholder}" value="Casablanca" />
            </div>
          </div>
          <div class="kf-help">${s.kyc_notice}</div>
        `;
      }
      function step2() {
        return `
          <div style="text-align:center; padding:10px 0 20px;">
            <div style="width:70px; height:70px; margin:0 auto 16px; border-radius:22px; background:var(--atlas); color:var(--mint); display:flex; align-items:center; justify-content:center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <h3 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; margin:0 0 8px;">${s.ready_title}</h3>
            <p style="color:var(--n-600); font-size:14px; margin:0 auto; max-width:380px;">${s.ready_desc}</p>
          </div>
          <div style="background:var(--paper-soft); border-radius:12px; padding:16px; display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.subscription_label}</div><b style="font-size:18px;">${s.subscription_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.settlement_label}</div><b style="font-size:18px;">${s.settlement_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.hardware_label}</div><b style="font-size:18px;">${s.hardware_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.commitment_label}</div><b style="font-size:18px;">${s.commitment_value}</b></div>
          </div>
        `;
      }
      m.el.addEventListener('click', (e) => {
        const biz = e.target.closest('[data-biz]');
        if (biz) { business = biz.dataset.biz; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        if (e.target.closest('[data-next]')) {
          if (step < 2) { step++; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
          else { m.close(); confetti(); toast(s.toast_success_title, {type: 'success', desc: s.toast_success_desc}); }
        }
        if (e.target.closest('[data-prev]')) {
          if (step > 0) { step--; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        }
      });
    },

    'login': () => {
      const s = (LOGIN_STR[kiwiLang()] || LOGIN_STR.fr);
      modal({
        title: s.title,
        desc: s.desc,
        width: 440,
        body: `
          <div class="kf-group">
            <label class="kf-label">${s.email_label}</label>
            <input class="kf-input" placeholder="you@yourbusiness.com" />
          </div>
          <div class="kf-group">
            <label class="kf-label">${s.password_label}</label>
            <input class="kf-input" type="password" placeholder="••••••••" />
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-top:8px;">
            <label style="display:flex; gap:6px; color:var(--n-600);"><input type="checkbox" checked style="accent-color:var(--atlas); width:15px; height:15px;"/> ${s.remember_me}</label>
            <a href="#" style="color:var(--atlas); font-weight:500;">${s.forgot_password}</a>
          </div>
          <button class="kb primary" style="width:100%; justify-content:center; margin-top:18px; padding:12px;" data-login-go>${s.login_button} →</button>
          <div style="text-align:center; margin-top:14px; font-size:13px; color:var(--n-500);">${s.no_account} <a href="#" data-to-signup style="color:var(--atlas); font-weight:500;">${s.create_account}</a></div>
        `
      });
      const loginHandler = (e) => {
        if (e.target.closest('[data-login-go]')) {
          document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
          setTimeout(() => location.href = 'dashboard.html', 200);
          document.body.removeEventListener('click', loginHandler);
        } else if (e.target.closest('[data-to-signup]')) {
          e.preventDefault();
          document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
          setTimeout(handlers.signup, 200);
          document.body.removeEventListener('click', loginHandler);
        }
      };
      document.body.addEventListener('click', loginHandler);
    },

    'search': () => commandPalette(),

    'notifications': () => {
      const s = (NOTIFICATIONS_STR[kiwiLang()] || NOTIFICATIONS_STR.fr);
      const money = (value) => window.KiwiNumber?.money(value) || `${value.toLocaleString('fr-FR')} MAD`;
      /* L'écran vide annonce ce qui viendra s'y ranger. Nommer « les alertes de
       * terminaux » à un client dont l'opérateur n'a pas ouvert le module
       * Terminaux, c'est lui promettre une page qu'il ne verra jamais — alors on
       * ne cite que les modules qu'il a. Il en reste toujours au moins un
       * (Kiwi AI), donc la phrase ne se vide pas. */
      const featOff = (k) => { try { return !!window.KiwiConfig?.off?.(k); } catch (_) { return false; } };
      const NOTIF_EMPTY = {
        fr: { head: 'Aucune notification', tail: 'apparaîtront ici.', and: ' et ',
              src: [[null, 'Les écarts entre vos clôtures de caisse et le serveur']] },
        en: { head: 'No notifications', tail: 'will appear here.', and: ' and ',
              src: [[null, 'Mismatches between your till closures and the server']] },
        ar: { head: 'لا إشعارات', tail: 'ستظهر هنا.', and: ' و',
              src: [[null, 'الفروق بين إغلاقات الصندوق والخادم']] },
      };
      // Real notifications first: a Z report that doesn't match the server.
      const zNotif = (() => { try { return window.KiwiZReconciliation?.notificationHtml?.() || ''; } catch (_) { return ''; } })();
      if (window.KiwiVenue?.isCustom?.() && zNotif) {
        return drawer({ title: s.title, subtitle: '', body: zNotif });
      }
      if (window.KiwiVenue?.isCustom?.()) {
        const b = NOTIF_EMPTY[kiwiLang()] || NOTIF_EMPTY.fr;
        const parts = b.src.filter(([k]) => !k || !featOff(k)).map(([, t]) => t);
        // Retirer un élément d'une énumération laisse une virgule là où il faut
        // une conjonction : « Les alertes de règlement, les suggestions Kiwi AI »
        // se lit comme une phrase tronquée.
        const list = parts.length > 1
          ? parts.slice(0, -1).join(', ') + b.and + parts[parts.length - 1]
          : parts.join('');
        const e = { head: b.head, msg: list + ' ' + b.tail };
        return drawer({
          title: s.title,
          subtitle: '',
          body: `<div style="text-align:center;padding:52px 16px;">` +
            `<div style="font-size:14px;font-weight:600;color:var(--ink);">${e.head}</div>` +
            `<div style="font-size:12.5px;color:var(--n-500);margin-top:6px;line-height:1.5;">${e.msg}</div>` +
            `</div>`,
        });
      }
      drawer({
      title: s.title,
      subtitle: s.subtitle,
      body: `
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--atlas) 14%, var(--surface)); color:var(--atlas);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.settlement_ready_title(money(23091))}</div>
            <div class="n-desc">${s.settlement_ready_desc}</div>
            <div class="n-time">${s.time_12_min}</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--warn-ink) 16%, var(--surface)); color:var(--warn-ink);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.terminal_offline_title}</div>
            <div class="n-desc">${s.terminal_offline_desc}</div>
            <div class="n-time">${s.time_1_hr}</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--info) 14%, var(--surface)); color:var(--info);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.ai_suggestion_title}</div>
            <div class="n-desc">${s.ai_suggestion_desc}</div>
            <div class="n-time">${s.time_2_hr}</div>
          </div>
        </div>
        <div class="notif">
          <!-- receipt_long.svg · un relevé de transactions, pas un rectangle vide -->
          <div class="n-ico"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.yesterday_tx_title}</div>
            <div class="n-desc">${s.yesterday_tx_desc(money(45310))}</div>
            <div class="n-time">${s.time_yesterday_2345}</div>
          </div>
        </div>
        <div class="notif">
          <div class="n-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12l-2-2m-6 6l-6 6H4v-4l6-6m4-4l6-6 4 4-6 6-4-4z"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.fatima_signed_title}</div>
            <div class="n-desc">${s.fatima_signed_desc}</div>
            <div class="n-time">${s.time_yesterday_2100}</div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" style="width:100%; justify-content:center;" data-mark-read>${s.mark_all_read}</button>
      `
    })},

    'settings': () => {
      const I18 = window.KiwiI18n;
      const lang = (I18 && I18.getLang && I18.getLang()) || 'fr';
      const LANGNAME = { fr: 'Français', en: 'English', ar: 'العربية' };
      const setOn = (k) => { try { return localStorage.getItem('kiwiSet:' + k) !== '0'; } catch (_) { return true; } };
      const KV = window.KiwiVenue;
      const cv = !!(KV && KV.isCustom && KV.isCustom());
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      const getSet = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
      const hoursRowValue = (venueData) => {
        const KH = window.KiwiHours;
        const legacy = (venueData && venueData.hours) || getSet('hours', '');
        const unset = tr({ fr: 'À définir', en: 'To set', ar: 'غير محدد' });
        if (!KH) return legacy || unset;
        if (!KH.isConfigured()) {
          return legacy ? tr({ fr: 'À convertir · ', en: 'To convert · ', ar: 'للتحويل · ' }) + legacy : unset;
        }
        return KH.summary(Date.now()).text;
      };
      const receiptRowValue = () => {
        const K = window.KiwiReceipt;
        if (!K) return tr({ fr: 'Ticket standard', en: 'Standard ticket', ar: 'وصل قياسي' });
        const miss = K.missing();
        if (miss.length) {
          return tr({
            fr: `${miss.length} mention${miss.length > 1 ? 's' : ''} légale${miss.length > 1 ? 's' : ''} à compléter`,
            en: `${miss.length} legal detail${miss.length > 1 ? 's' : ''} to complete`,
            ar: `${miss.length} بيان قانوني ينقص`,
          });
        }
        return K.isConfigured()
          ? tr({ fr: 'Personnalisé · prêt à imprimer', en: 'Customised · ready to print', ar: 'مخصّص · جاهز للطبع' })
          : tr({ fr: 'Modèle par défaut', en: 'Default template', ar: 'نموذج افتراضي' });
      };
      const fmtN = (n) => (window.KiwiNumber?.format((+n || 0), {}) ?? (+n || 0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));

      const venueTitle = escape((vd && (vd.fullDisplay || vd.name)) || (window.KiwiMe && window.KiwiMe.business) || (window.KiwiEnv?.isReal?.() ? tr({ fr: 'Mon établissement', en: 'My business', ar: 'منشأتي' }) : 'Café Atlas · Maarif'));
      const tradeLabel = escape((window.KiwiVenue?.getTypeLabel?.() || '') || tr({ fr: 'Restauration & Boissons', en: 'Food & Beverage', ar: 'المطاعم والمشروبات' }));

      return appPage('settings', {
        title: tr({ fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' }),
        subtitle: tr({
          fr: `${venueTitle} · Configuration · Matériel & Caisse · Sécurité · Intégrations`,
          en: `${venueTitle} · Configuration · Hardware & POS · Security · Integrations`,
          ar: `${venueTitle} · الإعدادات · الأجهزة والصندوق · الأمان · الربط`,
        }),
        body: `
          <style>
            .gp-settings-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 20px;
              margin-top: 10px;
            }
            @media (max-width: 920px) {
              .gp-settings-grid { grid-template-columns: minmax(0, 1fr); }
            }
            .gp-set-card {
              background: var(--surface, #FFFFFF);
              border: 1px solid var(--n-200, #E5E7EB);
              border-radius: 20px;
              box-shadow: 0 1px 3px rgba(10, 15, 13, 0.04), 0 12px 32px -16px rgba(10, 15, 13, 0.08);
              padding: 22px 24px;
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            :root[data-theme="dark"] .gp-set-card {
              background: rgba(14, 30, 23, 0.88);
              border-color: rgba(255, 255, 255, 0.10);
              box-shadow: 0 0 0 1px rgba(0, 255, 174, 0.05), 0 16px 40px -12px rgba(0, 0, 0, 0.5);
            }
            .gp-set-card-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 12px;
              border-bottom: 1px solid var(--n-150, rgba(0,0,0,0.06));
            }
            :root[data-theme="dark"] .gp-set-card-head {
              border-bottom-color: rgba(255, 255, 255, 0.08);
            }
            .gp-set-title {
              font-size: 15px;
              font-weight: 700;
              letter-spacing: -0.015em;
              color: var(--ink);
              display: flex;
              align-items: center;
              gap: 8px;
            }
            :root[data-theme="dark"] .gp-set-title { color: #F5FAF7; }
            .gp-set-tag {
              font-family: var(--mono);
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              padding: 3px 8px;
              border-radius: 999px;
            }
            :root[data-theme="dark"] .gp-set-tag {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.12);
            }
            .kset-row {
              display: flex;
              align-items: center;
              gap: 14px;
              padding: 10px 12px;
              cursor: pointer;
              transition: all 140ms ease;
              border-radius: 12px;
              border: 1px solid transparent;
            }
            .kset-row:hover {
              background: var(--paper-soft, rgba(0,0,0,0.03));
              border-color: var(--n-200, rgba(0,0,0,0.05));
              transform: translateX(2px);
            }
            :root[data-theme="dark"] .kset-row:hover {
              background: rgba(255, 255, 255, 0.05);
              border-color: rgba(255, 255, 255, 0.08);
            }
            .kset-ico {
              width: 34px; height: 34px;
              flex-shrink: 0;
              display: grid;
              place-items: center;
              border-radius: 10px;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              border: 1px solid rgba(12, 107, 78, 0.14);
            }
            :root[data-theme="dark"] .kset-ico {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.12);
              border-color: rgba(0, 255, 174, 0.20);
            }
            .kset-toggle {
              width: 38px; height: 22px;
              background: var(--n-300, #CBD5E1);
              border-radius: 999px;
              position: relative;
              transition: background 160ms;
              flex-shrink: 0;
              cursor: pointer;
            }
            .kset-toggle.on { background: var(--atlas, #0C6B4E); }
            :root[data-theme="dark"] .kset-toggle.on { background: #00FFAE; }
            .kset-knob {
              position: absolute;
              top: 2px;
              inset-inline-start: 2px;
              width: 18px; height: 18px;
              background: #FFFFFF;
              border-radius: 50%;
              transition: inset-inline-start 160ms;
              box-shadow: 0 1px 3px rgba(0,0,0,0.25);
            }
            .kset-toggle.on .kset-knob { inset-inline-start: 18px; }
            :root[data-theme="dark"] .kset-toggle.on .kset-knob { background: #04140E; }
            .kset-badge {
              font-family: var(--mono);
              font-size: 11px;
              font-weight: 600;
              letter-spacing: 0.08em;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              border: 1px solid rgba(12, 107, 78, 0.20);
              padding: 3px 9px;
              border-radius: 999px;
              flex-shrink: 0;
            }
            :root[data-theme="dark"] .kset-badge {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.14);
              border-color: rgba(0, 255, 174, 0.28);
            }
          </style>

          <div class="kx-kpi-strip">
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Établissement', en: 'Location', ar: 'المنشأة' })}</div>
              <div class="v" style="font-size:22px;">${venueTitle}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Activité', en: 'Business type', ar: 'نوع النشاط' })}</div>
              <div class="v" style="font-size:22px;">${tradeLabel}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Reçu de caisse', en: 'Receipt state', ar: 'حالة الوصل' })}</div>
              <div class="v" style="font-size:18px; color:var(--atlas);">${escape(receiptRowValue())}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Sécurité & Données', en: 'Security & Data', ar: 'الأمان والبيانات' })}</div>
              <div class="v" style="font-size:22px; color:var(--success, #0C6B4E);">${tr({ fr: 'Chiffrement actif', en: 'Encrypted', ar: 'مشفر' })}</div>
            </div>
          </div>

          <div class="gp-settings-grid">
            <!-- Card 1: Établissement -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('storefront')}
                  <span>${tr({ fr: 'Établissement & Boutique', en: 'Store & Business', ar: 'المنشأة والمتجر' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Identité', en: 'Identity', ar: 'الهوية' })}</span>
              </div>
              <div>
                ${cv ? `
                ${settingsRow('storefront', venueTitle, tradeLabel, { action: 'settings-edit-venue' })}
                ${settingsRow('schedule', tr({ fr: 'Heures d\'ouverture', en: 'Opening hours', ar: 'ساعات العمل' }), escape(hoursRowValue(vd)), { action: 'settings-hours' })}
                ${settingsRow('track_changes', tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), vd.goal ? fmtN(vd.goal) + ' MAD' : tr({ fr: 'À définir', en: 'To set', ar: 'غير محدد' }), { action: 'settings-edit-venue' })}
                ` : `
                ${settingsRow('storefront', venueTitle, escape(getSet('venueLoc', tr({ fr: 'Emplacement principal', en: 'Main location', ar: 'الموقع الرئيسي' }))), { action: 'settings-edit-store', arg: 'venue' })}
                ${settingsRow('schedule', tr({ fr: 'Heures d\'ouverture', en: 'Opening hours', ar: 'ساعات العمل' }), escape(hoursRowValue(null)), { action: 'settings-hours' })}
                ${settingsRow('track_changes', tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), escape(getSet('goal', '28 000')) + ' MAD', { action: 'settings-edit-store', arg: 'goal' })}
                `}
              </div>
            </div>

            <!-- Card 2: Caisse & Paiements -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('receipt_long')}
                  <span>${tr({ fr: 'Caisse & Reçu', en: 'POS & Receipt', ar: 'الصندوق والوصل' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Encaissement', en: 'Checkout', ar: 'الدفع' })}</span>
              </div>
              <div>
                ${settingsRow('receipt_long', tr({ fr: 'Reçu de caisse & Mentions légales', en: 'Receipt & Legal details', ar: 'وصل الصندوق والبيانات القانونية' }), escape(receiptRowValue()), { action: 'settings-receipt' })}
                ${settingsRow('credit_card', tr({ fr: 'Méthodes de paiement acceptées', en: 'Accepted payment methods', ar: 'وسائل الدفع المقبولة' }), escape(vd.methods || methodsSaved() || tr({ fr: 'À définir', en: 'To set', ar: 'غير محدد' })), { action: cv ? 'settings-edit-venue' : 'settings-methods' })}
                ${settingsRow('percent', tr({ fr: 'Pourcentages de remise', en: 'Discount percentages', ar: 'نسب التخفيض' }), escape((window.KiwiDiscountPolicy?.percentages?.(vd?.id) || [5,10,15,20]).map(n => n + ' %').join(' · ')), { action: 'settings-discounts' })}
                ${settingsRow('paid', tr({ fr: 'Devise d\'affichage', en: 'Display currency', ar: 'عملة العرض' }), escape(currencyLabel(getSet('currency', 'MAD'))), { action: 'settings-currency' })}
              </div>
            </div>

            <!-- Card 3: Préférences d'affichage -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('language')}
                  <span>${tr({ fr: 'Affichage & Interface', en: 'Display & Preferences', ar: 'العرض والتفضيلات' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Personnalisation', en: 'Design', ar: 'التخصيص' })}</span>
              </div>
              <div>
                ${settingsRow('language', tr({ fr: 'Langue de l\'application', en: 'App language', ar: 'لغة التطبيق' }), LANGNAME[lang] || 'Français', { action: 'settings-lang' })}
                ${(window.KiwiDesignIOS27 && window.KiwiDesignIOS27.isOn()) ? settingsRow('layers', 'Liquid Glass', ({ clear: tr({ fr: 'Clair', en: 'Clear', ar: 'شفاف' }), standard: tr({ fr: 'Standard', en: 'Standard', ar: 'قياسي' }), frosted: tr({ fr: 'Givré', en: 'Frosted', ar: 'مصنفر' }), opaque: tr({ fr: 'Opaque', en: 'Opaque', ar: 'معتم' }) })[window.KiwiDesignIOS27.getGlass()] || 'Standard', { action: 'glass-level' }) : ''}
                ${(document.documentElement.getAttribute('data-theme') === 'dark')
                  ? settingsRow('dark_mode', tr({ fr: 'Mode sombre', en: 'Dark mode', ar: 'الوضع الداكن' }), tr({ fr: 'Activé · Kiwi Ultra', en: 'On · Kiwi Ultra', ar: 'مفعّل · Kiwi Ultra' }), { badge: '✓' })
                  : settingsRow('dark_mode', tr({ fr: 'Mode sombre', en: 'Dark mode', ar: 'الوضع الداكن' }), tr({ fr: 'Interface nuit · confort du soir', en: 'Night interface · easy on the eyes', ar: 'واجهة ليلية · مريحة للعين' }), { action: 'settings-dark-ultra', badge: 'ULTRA' })}
                ${settingsRow('notifications', tr({ fr: 'Notifications WhatsApp', en: 'WhatsApp notifications', ar: 'إشعارات واتساب' }), tr({ fr: 'Résumé quotidien 19h', en: 'Daily summary 7pm', ar: 'ملخص يومي 19:00' }), { toggle: true, on: setOn('waNotif'), action: 'settings-toggle', arg: 'waNotif' })}
                ${settingsRow('notifications', tr({ fr: 'Le point du matin', en: 'Morning briefing', ar: 'ملخص الصباح' }), tr({ fr: 'Le total d\'hier à l\'ouverture · cet appareil', en: 'Yesterday\'s total at opening · this device', ar: 'مجموع الأمس عند الافتتاح · هذا الجهاز' }), { toggle: true, on: morningPush.isOn(), action: 'settings-morning' })}
              </div>
            </div>

            <!-- Card 4: Sécurité & Intégrations -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('shield_lock')}
                  <span>${tr({ fr: 'Sécurité & Intégrations', en: 'Security & Integrations', ar: 'الأمان والتكاملات' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Protection', en: 'Protection', ar: 'الحماية' })}</span>
              </div>
              <div>
                ${settingsRow('key', tr({ fr: 'Codes PIN de l\'équipe', en: 'Team PIN codes', ar: 'رموز الفريق' }), tr({ fr: 'Gérer les accès et rôles caisse', en: 'Manage till roles and access', ar: 'إدارة أدوار ووصول الصندوق' }), { action: 'nav-equipe' })}
                ${(cv || window.KiwiEnv?.isReal?.()) ? settingsRow('receipt_long', tr({ fr: 'Espace comptable', en: 'Accountant access', ar: 'فضاء المحاسب' }), tr({ fr: 'Lecture seule pour votre expert-comptable', en: 'Read-only for your accountant', ar: 'وصول للقراءة فقط لمحاسبك' }), { action: 'settings-accountant' }) : ''}
                ${document.documentElement.classList.contains('kiwi-native') ? '' : settingsRow('shield_lock', tr({ fr: 'Chiffrement des données', en: 'Data encryption', ar: 'تشفير البيانات' }), tr({ fr: 'En transit (TLS 1.3) et au repos', en: 'In transit (TLS 1.3) and at rest', ar: 'أثناء النقل وفي التخزين' }), { badge: tr({ fr: 'Certifié', en: 'Certified', ar: 'معتمد' }) })}
                ${settingsRow('file_upload', tr({ fr: 'Exporter mes données', en: 'Export my data', ar: 'تصدير بياناتي' }), tr({ fr: 'Ventes, produits, équipe · Fichier CSV', en: 'Sales, products, team · CSV file', ar: 'المبيعات والمنتجات والفريق · CSV' }), { action: 'export-csv' })}
                ${settingsRow('person_remove', tr({ fr: 'Supprimer mon compte', en: 'Delete my account', ar: 'حذف حسابي' }), tr({ fr: 'Demande traitée sous 30 jours', en: 'Handled within 30 days', ar: 'تُعالج خلال 30 يوماً' }), { action: 'settings-delete-account' })}
                ${cv ? settingsRow('local_shipping', tr({ fr: 'Canaux de livraison', en: 'Delivery channels', ar: 'قنوات التوصيل' }), tr({ fr: 'Connectez Glovo, Yassir et votre compta', en: 'Connect Glovo, Yassir and accounting', ar: 'اربط Glovo وYassir ومحاسبتك' }), { action: 'add-integration' }) : `
                ${document.documentElement.classList.contains('kiwi-native') ? '' : settingsRow('glovo', 'Glovo Delivery', tr({ fr: 'Connecté · Commandes en direct', en: 'Connected · Live orders', ar: 'متصل · طلبات مباشرة' }), { toggle: true, on: setOn('glovo'), action: 'settings-toggle', arg: 'glovo' })}
                ${document.documentElement.classList.contains('kiwi-native') ? '' : settingsRow('yassir', 'Yassir Express', tr({ fr: 'Connecté · 24 commandes', en: 'Connected · 24 orders', ar: 'متصل · 24 طلبًا' }), { toggle: true, on: setOn('yassir'), action: 'settings-toggle', arg: 'yassir' })}
                ${settingsRow('accounting', tr({ fr: 'Comptabilité OCP', en: 'Accounting export', ar: 'المحاسبة' }), tr({ fr: 'Export automatique quotidien', en: 'Daily automatic export', ar: 'تصدير تلقائي يومي' }), { toggle: true, on: setOn('compta'), action: 'settings-toggle', arg: 'compta' })}
                `}
              </div>
            </div>
          </div>
        `,
      });
    },

    /* Submit a durable owner-authenticated request, never an email-composer
     * handoff or a client-selected merchant deletion. Processing stays manual. */
    'settings-delete-account': () => {
      const copy = {
        loading: tr({ fr: 'Vérification du compte…', en: 'Checking account…', ar: 'جارٍ التحقق من الحساب…' }),
        send: tr({ fr: 'Confirmer la demande', en: 'Confirm request', ar: 'تأكيد الطلب' }),
        sending: tr({ fr: 'Enregistrement…', en: 'Recording request…', ar: 'جارٍ تسجيل الطلب…' }),
        received: tr({ fr: 'Demande enregistrée', en: 'Request recorded', ar: 'تم تسجيل الطلب' }),
        failed: tr({ fr: 'La demande n’a pas pu être enregistrée. Réessayez ; aucune suppression n’a été lancée.', en: 'The request could not be recorded. Try again; no deletion was started.', ar: 'تعذّر تسجيل الطلب. حاول مجدداً؛ لم تبدأ أي عملية حذف.' }),
        signin: tr({ fr: 'Connectez-vous au compte propriétaire pour demander sa suppression.', en: 'Sign in to the owner account to request its deletion.', ar: 'سجّل الدخول إلى حساب المالك لطلب حذفه.' }),
        password: tr({ fr: 'Confirmez avec votre mot de passe', en: 'Confirm with your password', ar: 'أكد باستخدام كلمة المرور' }),
        wrong: tr({ fr: 'Mot de passe incorrect. Réessayez.', en: 'Incorrect password. Try again.', ar: 'كلمة المرور غير صحيحة. حاول مجدداً.' }),
        limit: tr({ fr: 'Trop de tentatives. Réessayez dans 15 minutes.', en: 'Too many attempts. Try again in 15 minutes.', ar: 'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.' })
      };
      const m = modal({
        title: tr({ fr: 'Supprimer mon compte', en: 'Delete my account', ar: 'حذف حسابي' }),
        tag: tr({ fr: 'Compte', en: 'Account', ar: 'الحساب' }),
        desc: tr({
          fr: 'Cette demande concerne votre compte connecté et tous ses établissements, pas seulement l’écran affiché. Exportez vos données avant de confirmer. Notre équipe traite la suppression sous 30 jours et vous confirme par e-mail. Les données légalement requises peuvent être conservées ; nous vous préciserons lesquelles.',
          en: 'This request covers your signed-in account and all its locations, not only the current screen. Export your data before confirming. Our team processes deletion within 30 days and confirms by email. Legally required records may be retained; we will explain which ones.',
          ar: 'يشمل الطلب حسابك المتصل وجميع مؤسساته، وليس الشاشة الحالية فقط. صدّر بياناتك قبل التأكيد. يعالج فريقنا الحذف خلال 30 يوماً ويؤكده بالبريد. قد تُحتفظ بالسجلات المطلوبة قانونياً وسنوضح لك ما هي.',
        }),
        body: `<p data-delete-identity></p><label data-delete-form hidden>${copy.password}<input type="password" autocomplete="current-password" data-delete-password style="display:block;width:100%;min-height:44px;font-size:16px;margin-top:8px" /></label><p data-delete-status role="status" aria-live="polite">${copy.loading}</p>`,
        foot: `<button class="kb ghost" type="button" data-close>${tr({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' })}</button><button data-activation=write class="kb danger" type="button" data-delete-submit disabled>${copy.send}</button>`,
        width: 480,
      });
      const status = m.el.querySelector('[data-delete-status]'), button = m.el.querySelector('[data-delete-submit]');
      const form = m.el.querySelector('[data-delete-form]'), password = m.el.querySelector('[data-delete-password]');
      let ready = false, sending = false;
      const showRecorded = (request) => {
        ready = false; form.hidden = true; button.hidden = true; password.value = '';
        status.textContent = copy.received + ' · ' + request.reference + ' · ' + new Date(request.createdAt).toLocaleDateString(document.documentElement?.lang || 'fr');
      };
      const api = async (options) => {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch('/api/account/deletion-request', { credentials: 'include', cache: 'no-store', ...options, signal: controller.signal });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || 'unavailable');
          return body;
        } finally { clearTimeout(timeout); }
      };
      api().then((body) => {
        m.el.querySelector('[data-delete-identity]').textContent = body.account.email;
        if (body.request) { showRecorded(body.request); return; }
        ready = true; form.hidden = false; button.disabled = false; status.textContent = '';
      }).catch((err) => { status.textContent = err.message === 'unauthenticated' ? copy.signin : copy.failed; });
      const submit = async () => {
        if (!ready || sending) return;
        if (!password.value) { password.focus(); return; }
        sending = true; button.disabled = true; button.textContent = copy.sending; status.textContent = '';
        const body = JSON.stringify({ confirm: true, password: password.value }); password.value = '';
        try { const result = await api({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); showRecorded(result.request); }
        catch (err) {
          status.textContent = err.message === 'bad-creds' ? copy.wrong : err.message === 'unauthenticated' ? copy.signin : err.message === 'too_many_attempts' ? copy.limit : copy.failed;
          password.focus();
        } finally { sending = false; button.disabled = !ready; button.textContent = copy.send; }
      };
      button.addEventListener('click', submit);
      password.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
      m.el.querySelector('[data-close]').addEventListener('click', () => { password.value = ''; m.close(); });
    },

    /* Espace comptable : le propriétaire invite son expert-comptable, voit le
     * lien UNE fois, liste les accès et en révoque un (deux appuis). Tout passe
     * par /api/comptable/access, réservé à la session propriétaire : le lien et
     * la liste ne sont jamais fabriqués ici. Le jeton n'est gardé nulle part. */
    'settings-accountant': () => {
      const merchant = String((window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || '');
      const c = {
        title: tr({ fr: 'Espace comptable', en: 'Accountant access', ar: 'فضاء المحاسب' }),
        tag: tr({ fr: 'Lecture seule', en: 'Read only', ar: 'للقراءة فقط' }),
        desc: tr({
          fr: 'Votre expert-comptable consulte les ventes, factures, caisse et clôtures de cet établissement et télécharge les exports CSV. Il ne peut rien modifier.',
          en: 'Your accountant reads this location\'s sales, invoices, cash and closings and downloads the CSV exports. They cannot change anything.',
          ar: 'يطّلع محاسبك على مبيعات هذا المحل وفواتيره وصندوقه وإقفالاته ويحمّل ملفات CSV. لا يمكنه تعديل أي شيء.'
        }),
        name: tr({ fr: 'Nom (facultatif)', en: 'Name (optional)', ar: 'الاسم (اختياري)' }),
        email: tr({ fr: 'E-mail (facultatif)', en: 'Email (optional)', ar: 'البريد الإلكتروني (اختياري)' }),
        invite: tr({ fr: 'Créer un lien d\'accès', en: 'Create an access link', ar: 'إنشاء رابط وصول' }),
        creating: tr({ fr: 'Création…', en: 'Creating…', ar: 'جارٍ الإنشاء…' }),
        linkTitle: tr({ fr: 'Lien d\'accès, affiché une seule fois', en: 'Access link, shown only once', ar: 'رابط الوصول، يظهر مرة واحدة فقط' }),
        warn: tr({
          fr: 'Ce lien fonctionne comme une clé : toute personne qui l\'a peut lire les livres de ce magasin. Envoyez-le seulement à votre comptable. Il ne sera plus affiché ; en cas de doute, révoquez l\'accès.',
          en: 'This link works like a key: anyone who has it can read this store\'s books. Send it only to your accountant. It will not be shown again; if in doubt, revoke the access.',
          ar: 'يعمل هذا الرابط كمفتاح: كل من يملكه يستطيع قراءة دفاتر هذا المتجر. أرسله لمحاسبك فقط. لن يظهر مرة أخرى، وعند الشك ألغِ الوصول.'
        }),
        copy: tr({ fr: 'Copier le lien', en: 'Copy link', ar: 'نسخ الرابط' }),
        copied: tr({ fr: 'Lien copié', en: 'Link copied', ar: 'تم نسخ الرابط' }),
        accesses: tr({ fr: 'Accès existants', en: 'Existing access', ar: 'عمليات الوصول الحالية' }),
        none: tr({ fr: 'Aucun accès pour le moment.', en: 'No access yet.', ar: 'لا يوجد وصول بعد.' }),
        loading: tr({ fr: 'Chargement…', en: 'Loading…', ar: 'جارٍ التحميل…' }),
        never: tr({ fr: 'Jamais ouvert', en: 'Never opened', ar: 'لم يُفتح بعد' }),
        seen: tr({ fr: 'Dernière visite', en: 'Last visit', ar: 'آخر زيارة' }),
        until: tr({ fr: 'Valable jusqu\'au', en: 'Valid until', ar: 'صالح حتى' }),
        active: tr({ fr: 'Actif', en: 'Active', ar: 'نشط' }),
        revoked: tr({ fr: 'Révoqué', en: 'Revoked', ar: 'ملغى' }),
        expired: tr({ fr: 'Expiré', en: 'Expired', ar: 'منتهٍ' }),
        revoke: tr({ fr: 'Révoquer', en: 'Revoke', ar: 'إلغاء الوصول' }),
        confirm: tr({ fr: 'Confirmer la révocation', en: 'Confirm revoke', ar: 'تأكيد الإلغاء' }),
        close: tr({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' }),
        generic: tr({ fr: 'Action impossible pour le moment. Réessayez.', en: 'Not possible right now. Try again.', ar: 'تعذّر تنفيذ الإجراء الآن. أعد المحاولة.' }),
        forbidden: tr({ fr: 'Réservé au propriétaire du compte.', en: 'Reserved for the account owner.', ar: 'مخصص لصاحب الحساب.' }),
        badEmail: tr({ fr: 'Adresse e-mail invalide.', en: 'Invalid email address.', ar: 'عنوان البريد غير صالح.' }),
        tooMany: tr({ fr: 'Trop d\'accès actifs : révoquez-en un d\'abord.', en: 'Too many active accesses: revoke one first.', ar: 'عدد الوصولات النشطة كبير: ألغِ واحداً أولاً.' }),
        noStore: tr({ fr: 'Établissement introuvable. Rechargez la page.', en: 'Location not found. Reload the page.', ar: 'تعذّر العثور على المحل. أعد تحميل الصفحة.' })
      };
      const field = 'display:block;width:100%;min-height:44px;font-size:16px;margin-top:4px;padding:0 12px;border:1px solid var(--n-200);border-radius:10px;background:var(--surface);color:var(--ink);box-sizing:border-box;';
      const m = modal({
        title: c.title, tag: c.tag, desc: c.desc,
        body: `<div data-acc-form>
            <label style="display:block;font-size:13px;margin-bottom:10px;">${c.name}<input type="text" maxlength="80" autocomplete="off" data-acc-name style="${field}"></label>
            <label style="display:block;font-size:13px;margin-bottom:12px;">${c.email}<input type="email" maxlength="254" autocomplete="off" dir="ltr" data-acc-email style="${field}"></label>
            <button data-activation=write class="kb atlas" type="button" data-acc-create>${c.invite}</button>
          </div>
          <p data-acc-status role="status" style="font-size:13px;color:var(--danger);margin:10px 0 0;min-height:18px;"></p>
          <div data-acc-link hidden style="margin-top:6px;padding:14px;border:1px solid var(--n-200);border-radius:12px;background:var(--paper);">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${c.linkTitle}</div>
            <input type="text" readonly dir="ltr" data-acc-url style="${field}margin-top:0;font-family:var(--mono);font-size:13px;">
            <p style="font-size:12.5px;color:var(--n-600);margin:10px 0;">${c.warn}</p>
            <button class="kb ghost" type="button" data-acc-copy>${c.copy}</button>
          </div>
          <div style="margin-top:18px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${c.accesses}</div>
            <div data-acc-list style="font-size:13px;color:var(--n-600);">${c.loading}</div>
          </div>`,
        foot: `<button class="kb ghost" type="button" data-close>${c.close}</button>`,
        width: 560
      });
      const el = m.el;
      const status = el.querySelector('[data-acc-status]'), list = el.querySelector('[data-acc-list]');
      const createBtn = el.querySelector('[data-acc-create]');
      const api = async (path, options) => {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...options, signal: controller.signal });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) { const e = new Error(body.error || 'unavailable'); e.status = response.status; throw e; }
          return body;
        } finally { clearTimeout(timeout); }
      };
      const say = (err) => {
        status.textContent = !err ? '' : err.message === 'bad-email' ? c.badEmail : err.message === 'too-many-accesses' ? c.tooMany
          : err.status === 403 ? c.forbidden : c.generic;
      };
      const day = (ts) => new Date(ts).toLocaleDateString(({ fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA-u-nu-latn' })[kiwiLang()] || 'fr-FR');
      const draw = (rows) => {
        list.textContent = '';
        if (!rows.length) { list.textContent = c.none; return; }
        rows.forEach((r) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--n-200);';
          const info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0;';
          const name = document.createElement('div'); name.style.cssText = 'color:var(--ink);font-weight:500;overflow-wrap:anywhere;';
          name.textContent = r.label || r.email || tr({ fr: 'Comptable', en: 'Accountant', ar: 'محاسب' });
          const meta = document.createElement('div'); meta.style.cssText = 'font-size:12px;color:var(--n-500);';
          const state = r.status === 'active' ? c.active : r.status === 'revoked' ? c.revoked : c.expired;
          meta.textContent = state + ' · ' + c.seen + ' : ' + (r.lastSeenTs ? day(r.lastSeenTs) : c.never) + ' · ' + c.until + ' ' + day(r.expiresTs);
          info.appendChild(name); info.appendChild(meta); row.appendChild(info);
          if (r.status === 'active') {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'kb ghost'; b.textContent = c.revoke;
            let armed = false, timer = 0;
            b.addEventListener('click', async () => {
              if (!armed) {
                armed = true; b.className = 'kb danger'; b.textContent = c.confirm;
                timer = setTimeout(() => { armed = false; b.className = 'kb ghost'; b.textContent = c.revoke; }, 4000);
                return;
              }
              clearTimeout(timer); b.disabled = true; say(null);
              try { await api('/api/comptable/access?merchant=' + encodeURIComponent(merchant) + '&id=' + encodeURIComponent(r.id), { method: 'DELETE' }); await refresh(); }
              catch (err) { b.disabled = false; armed = false; b.className = 'kb ghost'; b.textContent = c.revoke; say(err); }
            });
            row.appendChild(b);
          }
          list.appendChild(row);
        });
      };
      const refresh = async () => {
        if (!merchant) { list.textContent = ''; status.textContent = c.noStore; createBtn.disabled = true; return; }
        try { draw((await api('/api/comptable/access?merchant=' + encodeURIComponent(merchant))).accesses || []); }
        catch (err) { list.textContent = ''; say(err); if (err.status === 403) createBtn.disabled = true; }
      };
      createBtn.addEventListener('click', async () => {
        if (!merchant) { status.textContent = c.noStore; return; }
        createBtn.disabled = true; createBtn.textContent = c.creating; say(null);
        const nameInput = el.querySelector('[data-acc-name]'), emailInput = el.querySelector('[data-acc-email]');
        try {
          const made = await api('/api/comptable/access', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant, label: nameInput.value.trim(), email: emailInput.value.trim() }) });
          nameInput.value = ''; emailInput.value = '';
          const box = el.querySelector('[data-acc-link]'), url = el.querySelector('[data-acc-url]');
          url.value = made.url; box.hidden = false; url.focus(); url.select();
          await refresh();
        } catch (err) { say(err); }
        finally { createBtn.disabled = false; createBtn.textContent = c.invite; }
      });
      el.querySelector('[data-acc-copy]').addEventListener('click', async () => {
        const url = el.querySelector('[data-acc-url]');
        try { await navigator.clipboard.writeText(url.value); toast(c.copied, { type: 'success', force: true }); }
        catch (_) { url.focus(); url.select(); try { document.execCommand('copy'); toast(c.copied, { type: 'success', force: true }); } catch (__) {} }
      });
      el.querySelector('[data-close]').addEventListener('click', () => {
        el.querySelector('[data-acc-url]').value = '';
        m.close();
      });
      refresh();
    },

    'glass-level': (el) => {
      const D = window.KiwiDesignIOS27;
      if (!D) return;
      const cur = D.getGlass();
      const L = {
        clear: tr({ fr: 'Clair', en: 'Clear', ar: 'شفاف' }),
        standard: tr({ fr: 'Standard', en: 'Standard', ar: 'قياسي' }),
        frosted: tr({ fr: 'Givré', en: 'Frosted', ar: 'مصنفر' }),
        opaque: tr({ fr: 'Opaque', en: 'Opaque', ar: 'معتم' }),
      };
      menu(el, ['clear', 'standard', 'frosted', 'opaque'].map((k) => ({
        label: L[k], active: cur === k,
        onClick: () => {
          D.setGlass(k);
          const val = el.querySelector('.kset-val');
          if (val) val.textContent = L[k];
          toast('Liquid Glass · ' + L[k], { type: 'success', force: true });
        },
      })));
    },

    /* Dark mode is a Kiwi Ultra perk. Instead of a dead lock, this hands the
     * merchant a real live preview of the (already-built) dark surface, then
     * routes to the upgrade flow. The *persistent* dark dashboard ships with
     * Ultra / the consolidated fusion view — this is the single-venue hook. */
    'settings-dark-ultra': () => {
      const de = document.documentElement;
      const orig = de.getAttribute('data-theme') || 'light';
      let reverted = false;
      const revert = () => { if (reverted) return; reverted = true; de.setAttribute('data-theme', orig); };
      const preview = () => {
        // Close any open drawer so the preview shows the pure dark dashboard,
        // not a light settings panel floating over it.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        de.setAttribute('data-theme', 'dark');
        toast(tr({ fr: 'Aperçu du mode sombre · réservé à Kiwi Ultra', en: 'Dark-mode preview · Kiwi Ultra only', ar: 'معاينة الوضع الداكن · حصريًا لـ Kiwi Ultra' }), { type: 'info', force: true });
        setTimeout(() => {
          revert();
          toast(tr({ fr: 'Aperçu terminé, Ultra pour le garder', en: 'Preview over, go Ultra to keep it', ar: 'انتهت المعاينة، انتقل إلى Ultra للاحتفاظ به' }), { type: 'info', force: true });
        }, 6000);
      };
      const check = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M20 6L9 17l-5-5"/></svg>';
      const feat = (t) => `<div style="display:flex; gap:10px; align-items:flex-start; font-size:13.5px; line-height:1.45; color:var(--ink);">${check}<span>${t}</span></div>`;
      const m = modal({
        tag: 'KIWI ULTRA',
        title: tr({ fr: 'Le mode sombre fait partie de Kiwi Ultra', en: 'Dark mode is part of Kiwi Ultra', ar: 'الوضع الداكن جزء من Kiwi Ultra' }),
        desc: tr({ fr: 'Une interface nuit pensée pour le service du soir et la vue consolidée multi-établissements.', en: 'A night interface built for evening service and the consolidated multi-site view.', ar: 'واجهة ليلية مصمّمة لخدمة المساء والعرض الموحّد متعدد الفروع.' }),
        width: 440,
        body: `<div style="display:flex; flex-direction:column; gap:13px; margin-top:2px;">
          ${feat(tr({ fr: 'Confort visuel du soir, moins de fatigue en service', en: 'Easy on the eyes at night, less fatigue in service', ar: 'راحة بصرية مساءً, إرهاق أقل أثناء الخدمة' }))}
          ${feat(tr({ fr: 'Vue Portefeuille consolidée multi-établissements', en: 'Consolidated multi-site portfolio view', ar: 'عرض محفظة موحّد متعدد الفروع' }))}
          ${feat(tr({ fr: 'Se synchronise sur tous vos appareils Kiwi', en: 'Syncs across all your Kiwi devices', ar: 'يتزامن عبر جميع أجهزة Kiwi لديك' }))}
        </div>`,
        foot: `
          <button class="kb ghost" data-dark-preview type="button">${tr({ fr: 'Aperçu 6 s', en: 'Preview 6s', ar: 'معاينة 6 ثوانٍ' })}</button>
          <button class="kb atlas" data-dark-upgrade type="button">${tr({ fr: 'Passer à Ultra →', en: 'Go Ultra →', ar: 'الانتقال إلى Ultra ←' })}</button>
        `,
      });
      const pv = m.el.querySelector('[data-dark-preview]');
      const up = m.el.querySelector('[data-dark-upgrade]');
      if (pv) pv.onclick = () => { m.close(); preview(); };
      if (up) up.onclick = () => { revert(); m.close(); if (handlers['upgrade-pro']) handlers['upgrade-pro'](); };
    },

    'settings-lang': (el) => {
      const I18 = window.KiwiI18n;
      const cur = (I18 && I18.getLang && I18.getLang()) || 'fr';
      const pick = (l) => {
        if (I18 && I18.setLang) I18.setLang(l);
        // The settings drawer's own text isn't data-i18n bound — close it so
        // it re-opens fresh in the new language.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
      };
      menu(el, [
        { label: 'Français', active: cur === 'fr', onClick: () => pick('fr') },
        { label: 'English',  active: cur === 'en', onClick: () => pick('en') },
        { label: 'العربية',  active: cur === 'ar', onClick: () => pick('ar') },
      ]);
    },

    'settings-toggle': (el, arg) => {
      const tg = el && el.querySelector('[data-kset-toggle]');
      if (!tg) return;
      const on = !tg.classList.contains('on');
      tg.classList.toggle('on', on);
      if (arg) { try { localStorage.setItem('kiwiSet:' + arg, on ? '1' : '0'); } catch (_) {} }
    },

    /* « Le point du matin » : un push à l'ouverture avec le total d'hier. Par
     * appareil, désactivé par défaut. La bascule ne change d'état qu'une fois le
     * serveur d'accord (inscription ou désinscription du jeton). */
    'settings-morning': (el) => {
      const tg = el && el.querySelector('[data-kset-toggle]');
      if (!tg) return;
      morningPush.toggle(!tg.classList.contains('on')).then((state) => {
        tg.classList.toggle('on', !!state);
      });
    },

    'settings-soon': () => {},

    /* The default Café Atlas demo venue is customizable via kiwiSet:* localStorage
     * overrides (no custom-venue account needed). Each editor persists, then
     * re-opens Settings so the new value shows immediately. */
    'settings-edit-store': (el, which) => {
      const get = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
      const set = (k, v) => { try { localStorage.setItem('kiwiSet:' + k, v); } catch (_) {} };
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      const CFG = {
        venue: { tag: 'MA BOUTIQUE', title: tr({ fr: 'Nom & emplacement', en: 'Name & location', ar: 'الاسم والموقع' }), fields: [
          { k: 'venueName', label: tr({ fr: 'Nom de la boutique', en: 'Shop name', ar: 'اسم المتجر' }), def: ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).fullDisplay) || (window.KiwiMe && window.KiwiMe.business) || (window.KiwiEnv?.isReal?.() ? '' : 'Café Atlas · Maarif')), max: 40 },
          { k: 'venueLoc',  label: tr({ fr: 'Emplacement', en: 'Location', ar: 'الموقع' }), def: 'Emplacement principal', max: 40 } ] },
        /* `hours` n'est plus ici. Un champ libre supprimé d'un écran mais laissé
         * dans la table reste atteignable par un lien profond ou un bouton
         * oublié, et il suffit d'une seule saisie « 12-02 » pour que le produit
         * reparte avec deux horaires contradictoires. La clé est donc redirigée
         * vers l'éditeur structuré, plus bas. */
        goal: { tag: tr({ fr: 'OBJECTIF', en: 'GOAL', ar: 'الهدف' }), title: tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), hint: tr({ fr: 'Met à jour la barre d\'objectif du tableau de bord.', en: 'Updates the dashboard goal bar.', ar: 'يُحدّث شريط الهدف في لوحة التحكم.' }), fields: [
          { k: 'goal', label: tr({ fr: 'Chiffre d\'affaires visé par jour · MAD', en: 'Target revenue per day · MAD', ar: 'رقم المعاملات المستهدف يوميًا · درهم' }), def: '28 000', type: 'number' } ] },
      };
      /* Tout appel restant sur `hours` atterrit sur l'écran structuré. */
      if (which === 'hours') { try { return handlers['settings-hours'](); } catch (_) { return; } }
      const cfg = CFG[which]; if (!cfg) return;
      const body = '<style>.ks-field:focus{border-color:var(--atlas)!important;}</style>' + cfg.fields.map((f, i) =>
        `<label style="${lbl}${i === 0 ? 'margin-top:2px;' : ''}">${f.label}</label>` +
        `<input class="ks-field" data-f="${f.k}" ${f.type === 'number' ? 'type="number" inputmode="numeric" min="0"' : `maxlength="${f.max}"`} style="${fld}"/>`
      ).join('') + (cfg.hint ? `<div style="font-size:12px;color:var(--n-500);margin-top:14px;line-height:1.5;">${cfg.hint}</div>` : '');
      const m = modal({ tag: cfg.tag, title: cfg.title, width: 460, body,
        foot: `<button data-activation=write class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${tr({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' })}</button>` });
      cfg.fields.forEach((f) => {
        const cur = get(f.k, f.def);
        m.el.querySelector(`[data-f="${f.k}"]`).value = f.type === 'number' ? String(cur).replace(/[^\d]/g, '') : cur;
      });
      setTimeout(() => m.el.querySelector('.ks-field') && m.el.querySelector('.ks-field').focus(), 320);
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-save]')) return;
        cfg.fields.forEach((f) => {
          let v = (m.el.querySelector(`[data-f="${f.k}"]`).value || '').trim();
          if (!v) return;
          if (f.type === 'number') v = (+v.replace(/[^\d]/g, '') || 0).toLocaleString('fr-FR').replace(/[^\d ]/g, ' ');
          set(f.k, v);
        });
        m.close();
        if (which === 'goal' && window.KiwiDateRange) { try { window.KiwiDateRange.setDateRange(window.KiwiDateRange.getDateRange()); } catch (_) {} }
        setTimeout(() => handlers.settings(), 90);
        toast(tr({ fr: 'Réglage enregistré', en: 'Setting saved', ar: 'تم حفظ الإعداد' }), { type: 'success', force: true });
      });
    },

    'settings-discounts': () => {
      const policy = window.KiwiDiscountPolicy;
      if (!policy) { toast('Réglage indisponible, rechargez la page', { type: 'warn' }); return; }
      const MAX = 8;
      const PRESETS = [5, 10, 15, 20, 25, 30, 40, 50];
      const SAMPLE = 240; // example ticket used by the live preview
      const chosen = new Set(policy.percentages());
      // Tiles: the common values plus any custom value the owner already uses.
      const tiles = new Set([...PRESETS, ...chosen]);
      let focus = [...chosen].sort((a, b) => a - b)[0] || 0; // chip lit in the preview
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const money = n => (window.KiwiNumber?.format(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      const check = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';
      const minus = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-440v-80h560v80H200Z"/></svg>';
      const plus = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
      const m = modal({ tag: 'CAISSE', title: 'Remises autorisées', width: 500,
        body: `<style>
            .dp{--dp-spring:cubic-bezier(.34,1.45,.5,1);--dp-line:color-mix(in srgb,var(--n-200) 80%,transparent);display:grid;gap:18px}
            .dp-lead{margin:0;color:var(--n-600);line-height:1.5;font-size:14px;text-wrap:pretty}
            .dp-hero{position:relative;overflow:hidden;border-radius:22px;padding:20px 20px 16px;color:#F7F5F0;
              background:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,#0B6E4F 70%,transparent) 0%,transparent 60%),#053B2C;
              box-shadow:0 18px 40px -24px rgba(5,59,44,.7),inset 0 1px 0 rgba(255,255,255,.08)}
            .dp-eyebrow{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:rgba(247,245,240,.62)}
            .dp-live{display:inline-flex;align-items:center;gap:6px;letter-spacing:.04em;text-transform:none;font-weight:500}
            .dp-live i{width:6px;height:6px;border-radius:50%;background:#7DF2B0;box-shadow:0 0 0 3px rgba(125,242,176,.18)}
            .dp-total{display:flex;align-items:baseline;gap:8px;margin-top:14px;font-variant-numeric:tabular-nums}
            .dp .dp-hero .dp-total b{font-size:40px;line-height:1;font-weight:600;letter-spacing:-.025em;color:#F7F5F0}
            .dp-total span{font-size:15px;color:rgba(247,245,240,.62)}
            .dp-was{font-size:13px;color:rgba(247,245,240,.5);text-decoration:line-through;margin-left:auto;align-self:center}
            .dp-save{margin-top:6px;min-height:18px;font-size:13px;color:rgba(247,245,240,.72);font-variant-numeric:tabular-nums}
            .dp-save em{color:#7DF2B0;font-weight:600;font-style:normal}
            .dp-track{display:flex;gap:4px;margin-top:16px;padding:4px;border-radius:999px;background:rgba(247,245,240,.08);
              overflow-x:auto;scrollbar-width:none}
            .dp-track::-webkit-scrollbar{display:none}
            .dp-pill{flex:0 0 auto;border:0;background:transparent;color:rgba(247,245,240,.78);font:inherit;font-size:13px;font-weight:500;
              padding:8px 13px;border-radius:999px;cursor:pointer;font-variant-numeric:tabular-nums;transition:color .2s}
            .dp-pill.on{color:#F7F5F0}
            .dp-pill:not([data-kw-lens] *).on{background:#0B6E4F}
            .dp-pill:focus-visible{outline:2px solid #7DF2B0;outline-offset:1px}
            .dp .dp-hero .dp-track .kw-lens{background:rgba(247,245,240,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 6px 16px -8px rgba(0,0,0,.5)}
            .dp-group{border-radius:20px;background:var(--surface);border:1px solid var(--dp-line);padding:16px}
            .dp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
            .dp-label{font-size:13px;font-weight:600;color:var(--ink)}
            .dp-sub{font-size:12px;color:var(--n-500);margin-top:2px}
            .dp-meter{display:flex;align-items:center;gap:8px;white-space:nowrap;flex:0 0 auto;font-size:12px;color:var(--n-500);font-variant-numeric:tabular-nums}
            .dp-meter-bar{display:grid;grid-template-columns:repeat(${MAX},6px);gap:3px}
            .dp-meter-bar i{height:14px;border-radius:3px;background:var(--n-200);transition:background-color .25s,transform .31s var(--dp-spring)}
            .dp-meter-bar i.on{background:var(--atlas);transform:scaleY(1.12)}
            .dp-meter.full{color:var(--atlas);font-weight:600}
            .dp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
            .dp-tile{position:relative;display:flex;align-items:baseline;justify-content:center;gap:1px;height:64px;padding-top:20px;box-sizing:border-box;
              border-radius:16px;border:1px solid var(--dp-line);background:var(--n-50);color:var(--ink);font:inherit;cursor:pointer;
              font-variant-numeric:tabular-nums;transition:background-color .2s,border-color .2s,color .2s,box-shadow .2s,transform .31s var(--dp-spring);
              -webkit-tap-highlight-color:transparent}
            .dp .dp-grid .dp-tile b{font-size:24px;line-height:1;font-weight:600;letter-spacing:-.02em;color:inherit}
            .dp-tile small{font-size:13px;font-weight:500;opacity:.55}
            .dp-tile:hover{border-color:color-mix(in srgb,var(--atlas) 40%,var(--n-200))}
            .dp-tile:active{transform:scale(.94)}
            .dp-tile:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
            .dp-tile[aria-pressed="true"]{background:var(--atlas);border-color:var(--atlas);color:#F7F5F0;
              box-shadow:0 10px 22px -14px color-mix(in srgb,var(--atlas) 90%,transparent),inset 0 1px 0 rgba(255,255,255,.14)}
            .dp-tile[aria-pressed="true"] small{opacity:.7}
            html[data-theme="dark"] .dp-tile[aria-pressed="true"]{color:#03251A}
            html[data-theme="dark"] .dp-tick{background:#03251A;color:var(--atlas)}
            .dp-tile.pop{animation:dp-pop .38s var(--dp-spring)}
            @keyframes dp-pop{0%{transform:scale(.9)}100%{transform:scale(1)}}
            .dp-tick{position:absolute;top:7px;right:7px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
              background:#F7F5F0;color:var(--atlas);opacity:0;transform:scale(.4);transition:opacity .2s,transform .31s var(--dp-spring)}
            .dp-tick svg{width:13px;height:13px}
            .dp-tile[aria-pressed="true"] .dp-tick{opacity:1;transform:none}
            .dp-custom{display:flex;align-items:center;gap:12px}
            .dp-custom .dp-text{flex:1;min-width:0}
            .dp-stepper{display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:var(--n-100)}
            .dp-step{width:34px;height:34px;border-radius:50%;border:0;background:var(--surface);color:var(--ink);display:grid;place-items:center;cursor:pointer;
              box-shadow:0 1px 2px rgba(0,0,0,.08);transition:transform .31s var(--dp-spring)}
            .dp-step:active{transform:scale(.88)}
            .dp-step svg{width:18px;height:18px}
            .dp-step:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
            .dp-num{display:flex;align-items:baseline;justify-content:center;width:62px}
            .dp-num input{width:36px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:20px;font-weight:600;text-align:right;
              padding:0;font-variant-numeric:tabular-nums;-moz-appearance:textfield;appearance:textfield}
            .dp-num input::placeholder{color:var(--n-500);opacity:.6}
            .dp-num input:focus{outline:none}
            .dp-num input::-webkit-inner-spin-button,.dp-num input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
            .dp-num span{font-size:14px;color:var(--n-500);margin-left:2px}
            .dp-addbtn{height:42px;padding:0 18px;border-radius:999px;border:0;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);font:inherit;font-size:14px;font-weight:600;
              cursor:pointer;transition:transform .31s var(--dp-spring),opacity .2s}
            .dp-addbtn:active{transform:scale(.94)}
            .dp-addbtn:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
            .dp-note{margin:0;font-size:12px;color:var(--n-500);line-height:1.45;display:flex;gap:8px;align-items:flex-start}
            .dp-note svg{flex:0 0 16px;width:16px;height:16px;margin-top:1px;color:var(--atlas)}
            @media (max-width:440px){.dp-hero{padding:18px 16px 14px}.dp .dp-hero .dp-total b{font-size:34px}.dp-group{padding:14px}.dp-tile{height:58px;padding-top:17px}.dp .dp-grid .dp-tile b{font-size:21px}.dp-tick{display:none}
              .dp-custom{flex-wrap:wrap}.dp-custom .dp-text{flex-basis:100%}.dp-stepper{flex:1;justify-content:space-between}}
            @media (prefers-reduced-motion:reduce){.dp *{transition:none!important;animation:none!important}}
          </style>
          <div class="dp">
            <p class="dp-lead">Choisissez les remises que vos équipes peuvent appliquer. Elles arrivent sur toutes vos caisses en quelques secondes.</p>
            <section class="dp-hero" aria-label="Aperçu sur la caisse">
              <div class="dp-eyebrow"><span>Aperçu caisse</span><span class="dp-live"><i></i>Ticket exemple</span></div>
              <div class="dp-total"><b data-discount-total>${money(SAMPLE)}</b><span>MAD</span><s class="dp-was" data-discount-was hidden>${money(SAMPLE)} MAD</s></div>
              <div class="dp-save" data-discount-saving></div>
              <div data-discount-preview></div>
            </section>
            <section class="dp-group">
              <div class="dp-head"><div><div class="dp-label">Remises proposées</div><div class="dp-sub">Touchez pour activer ou retirer</div></div>
                <div class="dp-meter" data-discount-count></div></div>
              <div class="dp-grid" data-discount-choices role="group" aria-label="Remises proposées"></div>
            </section>
            <section class="dp-group dp-custom">
              <div class="dp-text"><div class="dp-label">Autre pourcentage</div><div class="dp-sub">Un nombre entier de 1 à 100</div></div>
              <div class="dp-stepper">
                <button type="button" class="dp-step" data-discount-step="-1" aria-label="Diminuer">${minus}</button>
                <label class="dp-num"><input data-discount-input type="number" min="1" max="100" step="1" inputmode="numeric" placeholder="12" aria-label="Autre pourcentage, de 1 à 100" /><span>%</span></label>
                <button type="button" class="dp-step" data-discount-step="1" aria-label="Augmenter">${plus}</button>
              </div>
              <button data-activation=write type="button" class="dp-addbtn" data-discount-add>Ajouter</button>
            </section>
            <p class="dp-note"><svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z"/></svg>Les ventes déjà enregistrées ne changent pas. Une remise hors réglage reste encaissée et vous est signalée.</p>
          </div>`,
        foot: '<button type="button" class="kb" data-discount-cancel>Annuler</button><button data-activation=write type="button" class="kb atlas" data-discount-save>Enregistrer</button>' });
      const $ = sel => m.el.querySelector(sel);
      let shown = SAMPLE, raf = 0;
      const tween = to => {
        cancelAnimationFrame(raf);
        const el = $('[data-discount-total]'), from = shown, t0 = performance.now(), dur = reduce ? 0 : 420;
        const step = now => {
          const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
          shown = from + (to - from) * e; el.textContent = money(shown);
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };
      const paintTotal = () => {
        const off = SAMPLE * focus / 100;
        tween(SAMPLE - off);
        $('[data-discount-was]').hidden = !focus;
        $('[data-discount-saving]').innerHTML = focus
          ? `Remise −${focus} % · <em>−${money(off)} MAD</em> accordés`
          : 'Aucune remise appliquée';
        m.el.querySelectorAll('[data-discount-pick]').forEach(b => {
          const on = Number(b.dataset.discountPick) === focus;
          b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        });
      };
      const drawPreview = () => {
        const values = [...chosen].sort((a, b) => a - b);
        if (!values.includes(focus)) focus = 0;
        // A fresh row each time so the liquid lens re-attaches to the new chips.
        $('[data-discount-preview]').innerHTML = `<div class="dp-track" data-lens-demo role="group" aria-label="Boutons de remise sur la caisse">${
          [0, ...values].map(n => `<button type="button" class="dp-pill" data-lens-item data-discount-pick="${n}">${n ? `−${n} %` : 'Sans'}</button>`).join('')}</div>`;
        paintTotal();
      };
      const draw = popped => {
        const sorted = [...tiles].sort((a, b) => a - b);
        $('[data-discount-choices]').innerHTML = sorted.map(n =>
          `<button type="button" class="dp-tile${n === popped ? ' pop' : ''}" data-discount-toggle="${n}" aria-pressed="${chosen.has(n)}" aria-label="${n} pour cent"><b>${n}</b><small>%</small><span class="dp-tick">${check}</span></button>`).join('');
        const meter = $('[data-discount-count]');
        meter.className = 'dp-meter' + (chosen.size >= MAX ? ' full' : '');
        meter.innerHTML = `<span>${chosen.size} sur ${MAX}</span><span class="dp-meter-bar" aria-hidden="true">${
          Array.from({ length: MAX }, (_, i) => `<i class="${i < chosen.size ? 'on' : ''}"></i>`).join('')}</span>`;
        const save = $('[data-discount-save]');
        save.disabled = !chosen.size;
        save.textContent = chosen.size ? `Enregistrer ${chosen.size} remise${chosen.size > 1 ? 's' : ''}` : 'Choisissez une remise';
        drawPreview();
      };
      const full = () => toast(`${MAX} remises maximum, retirez-en une d'abord`, { type: 'warn' });
      const addCustom = () => {
        const field = $('[data-discount-input]');
        const n = Number(field.value);
        if (!field.value || !Number.isInteger(n) || n < 1 || n > 100) { toast('Entrez un nombre entier de 1 à 100', { type: 'warn' }); field.focus(); return; }
        if (!chosen.has(n) && chosen.size >= MAX) { full(); return; }
        tiles.add(n); chosen.add(n); focus = n; field.value = ''; draw(n);
      };
      draw();
      $('[data-discount-input]').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
      });
      m.el.addEventListener('click', async e => {
        const tile = e.target.closest('[data-discount-toggle]');
        if (tile) {
          const n = Number(tile.dataset.discountToggle);
          if (chosen.has(n)) chosen.delete(n);
          else if (chosen.size >= MAX) { full(); return; }
          else { chosen.add(n); focus = n; }
          draw(chosen.has(n) ? n : null); return;
        }
        const pick = e.target.closest('[data-discount-pick]');
        if (pick) { focus = Number(pick.dataset.discountPick); paintTotal(); return; }
        const stepBtn = e.target.closest('[data-discount-step]');
        if (stepBtn) {
          const field = $('[data-discount-input]');
          const base = field.value === '' ? Number(field.placeholder) - Number(stepBtn.dataset.discountStep) : Number(field.value);
          field.value = String(Math.min(100, Math.max(1, Math.round(base) + Number(stepBtn.dataset.discountStep))));
          return;
        }
        if (e.target.closest('[data-discount-add]')) { addCustom(); return; }
        if (e.target.closest('[data-discount-cancel]')) { m.close(); return; }
        if (!e.target.closest('[data-discount-save]')) return;
        if (!chosen.size) return;
        const button = e.target.closest('[data-discount-save]'); button.disabled = true;
        try {
          const result = await policy.save([...chosen]);
          if (!result.ok || result.localOnly && window.KiwiEnv?.isReal?.()) {
            toast('Réglage conservé localement, synchronisation en attente', { type: 'warn' }); return;
          }
          m.close(); setTimeout(() => handlers.settings(), 90);
          toast('Remises mises à jour sur toutes les caisses', { type: 'success', force: true });
        } catch (_) { toast('Réglage non enregistré, réessayez', { type: 'warn' }); }
        finally { button.disabled = !chosen.size; }
      });
    },

    /* Multi-select payment methods. */
    'settings-methods': () => {
      const cur = methodsSaved();
      const OPTS = ['Visa', 'Mastercard', 'Kiwi Tap', 'QR', 'Espèces', 'CMI'];
      const on = (o) => cur.includes(o) || (o === 'Mastercard' && /\bMC\b/.test(cur)) || (o === 'Espèces' && /cash|espèces/i.test(cur));
      const rowS = 'display:flex;align-items:center;gap:11px;padding:12px 4px;border-bottom:1px solid var(--n-200);cursor:pointer;font-size:14px;color:var(--ink);';
      const m = modal({ tag: tr({ fr: 'PAIEMENTS', en: 'PAYMENTS', ar: 'المدفوعات' }), title: tr({ fr: 'Méthodes acceptées', en: 'Accepted methods', ar: 'طرق الدفع المقبولة' }), width: 420,
        body: OPTS.map((o) => `<label style="${rowS}"><input type="checkbox" data-mth="${escape(o)}" ${on(o) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--atlas);flex-shrink:0;"/>${escape(o)}</label>`).join(''),
        foot: `<button data-activation=write class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${tr({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' })}</button>` });
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-save]')) return;
        const sel = [...m.el.querySelectorAll('[data-mth]:checked')].map((c) => c.getAttribute('data-mth'));
        try { localStorage.setItem(methodsKey(), sel.length ? sel.join(' · ') : tr({ fr: 'Aucune', en: 'None', ar: 'لا شيء' })); } catch (_) {}
        m.close();
        setTimeout(() => handlers.settings(), 90);
        toast(tr({ fr: 'Méthodes mises à jour', en: 'Methods updated', ar: 'تم تحديث طرق الدفع' }), { type: 'success', force: true });
      });
    },

    /* Display-currency preference picker. */
    'settings-currency': (el) => {
      const cur = (() => { try { return localStorage.getItem('kiwiSet:currency') || 'MAD · Dirham marocain'; } catch (_) { return 'MAD · Dirham marocain'; } })();
      const pick = (v) => {
        try { localStorage.setItem('kiwiSet:currency', v); } catch (_) {}
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        setTimeout(() => handlers.settings(), 110);
        toast(tr({ fr: 'Devise mise à jour', en: 'Currency updated', ar: 'تم تحديث العملة' }), { type: 'success', force: true });
      };
      menu(el, Object.keys(CURRENCY_NAMES).map((code) => ({
        label: currencyLabel(code), active: cur.startsWith(code), onClick: () => pick(code + ' · ' + CURRENCY_NAMES[code].fr),
      })));
    },

    /* Les horaires d'ouverture — l'écran structuré, et le seul.
     * Il remplace quatre champs de texte libre qui coexistaient (cette fiche,
     * Mon profil, la question d'onboarding boutique, le réglage de démo) et
     * qu'aucun module ne pouvait lire. Order Pro, Réservations, la caisse, le
     * rapport journalier et l'assistant interrogent tous KiwiHours ; ils n'ont
     * pas de réglage à eux, par construction.
     *
     * `legacy` : l'ancienne valeur libre, montrée en haut de l'éditeur pour que
     * le propriétaire sache CE QU'IL remplace. On ne l'interprète pas — « 12-02 »
     * n'a pas de lecture sûre, et deviner ici serait exactement l'erreur que ce
     * chantier corrige. Elle est effacée une fois la semaine enregistrée. */
    'settings-hours': () => {
      if (!window.KiwiHoursUI || !window.KiwiHours) return;
      const KV = window.KiwiVenue;
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      const legacy = window.KiwiHours.isConfigured()
        ? ''
        : (vd.hours || (() => { try { return localStorage.getItem('kiwiSet:hours') || ''; } catch (_) { return ''; } })());
      window.KiwiHoursUI.open({
        venueId: (KV && KV.getVenue && KV.getVenue()) || null,
        title: vd.fullDisplay || vd.name || '',
        legacy,
        onSave: () => {
          /* Le vestige a fini son office : il disparaît, pour qu'aucun écran ne
           * puisse plus afficher deux horaires différents du même commerce. */
          try { localStorage.removeItem('kiwiSet:hours'); } catch (_) {}
          try {
            if (vd.hours && KV && KV.updateVenue) KV.updateVenue(KV.getVenue(), { hours: '' });
          } catch (_) {
            if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
              Kiwi.toast('Erreur de réinitialisation des horaires', { type: 'warn', force: true });
            }
          }
          document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
          setTimeout(() => { try { handlers.settings(); } catch (_) {} }, 110);
        },
      });
    },

    /* Le reçu de caisse. Un seul écran, ouvert d'ici comme depuis la fiche
     * établissement — c'est le MÊME éditeur et la MÊME fiche, pas deux réglages
     * qui se ressemblent. Le raccourci « Modifier la fiche » renvoie vers Mon
     * profil, où les mentions légales se saisissent une fois pour toutes. */
    'settings-receipt': () => {
      if (!window.KiwiReceiptUI || !window.KiwiReceipt) return;
      const KV = window.KiwiVenue;
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      window.KiwiReceiptUI.open({
        venueId: (KV && KV.getVenue && KV.getVenue()) || null,
        title: vd.fullDisplay || vd.name || '',
        onEditBusiness: () => { try { handlers['account-profile'](); } catch (_) {} },
        onSave: () => {
          document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
          setTimeout(() => { try { handlers.settings(); } catch (_) {} }, 110);
        },
      });
    },

    /* Edit a user-created venue's identity from Settings → Boutique. */
    'settings-edit-venue': () => {
      const KV = window.KiwiVenue;
      if (!KV || !KV.isCustom || !KV.isCustom()) return;
      const vd = KV.getCurrentVenueData() || {};
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      /* Le MÉTIER se modifie ici aussi. Il était gravé à l'inscription : un
       * café qui devient restaurant, une boutique qui ouvre un salon, une
       * erreur au premier jour — il n'existait aucun écran pour le dire, et la
       * fiche établissement offrait à la place un champ libre qui ne changeait
       * rien. Liste unique (assets/trades.js), la même qu'à l'inscription. */
      const KT = window.KiwiTrades;
      const curTrade = KT ? KT.resolve(vd.subtype || vd.type) : '';
      const m = modal({
        tag: 'MA BOUTIQUE',
        title: 'Modifier votre activité',
        width: 460,
        body: `
          <style>.ev-field:focus{border-color:var(--atlas)!important;}</style>
          <label style="${lbl}margin-top:2px;">Nom de l'activité</label>
          <input class="ev-field" data-ev-name style="${fld}" maxlength="40"/>
          ${KT ? `
          <label style="${lbl}">${tr({ fr: "Type d'activité", en: 'Type of business', ar: 'نوع النشاط' })}</label>
          <select class="ev-field" data-ev-trade style="${fld}">${KT.options(curTrade)}</select>
          <p style="font-size:11.5px;color:var(--n-500);margin:6px 0 0;line-height:1.45;">${tr({
            fr: 'Détermine les écrans de ce commerce · carte et tables, catalogue et codes-barres, prestations, chambres.',
            en: 'Decides this business’s screens · menu and tables, catalogue and barcodes, treatments, rooms.',
            ar: 'يحدّد شاشات هذا النشاط.' })}</p>` : ''}
          <label style="${lbl}">Ville</label>
          <input class="ev-field" data-ev-city style="${fld}" maxlength="30"/>
          <label style="${lbl}">Objectif de chiffre d'affaires par jour <span style="color: var(--n-500);font-weight:400;">· MAD</span></label>
          <input class="ev-field" data-ev-goal type="number" inputmode="numeric" style="${fld}" min="0"/>
        `,
        foot: `<button data-activation=write class="kb atlas" data-ev-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">Enregistrer</button>`,
      });
      m.el.querySelector('[data-ev-name]').value = vd.name || '';
      m.el.querySelector('[data-ev-city]').value = vd.location || '';
      m.el.querySelector('[data-ev-goal]').value = vd.goal || '';
      setTimeout(() => m.el.querySelector('[data-ev-name]').focus(), 320);
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-ev-save]')) return;
        const name = (m.el.querySelector('[data-ev-name]').value || '').trim();
        if (!name) { toast(tr({fr:'Le nom de l\'activité est requis', en:'Activity name is required', ar:'اسم النشاط مطلوب'}), { type: 'warn', force: true }); return; }
        const tsel = m.el.querySelector('[data-ev-trade]');
        const trade = tsel && KT ? KT.resolve(tsel.value) : '';
        /* Plus de `hours` ici : les horaires ne sont plus une ligne de texte de
         * cette fiche, ils ont leur propre écran structuré (settings-hours). */
        KV.updateVenue(KV.getVenue(), {
          name,
          subtype:  trade || null,
          location: m.el.querySelector('[data-ev-city]').value,
          goal:     m.el.querySelector('[data-ev-goal]').value,
        });
        m.close();
        // The Settings drawer behind now holds stale values — close it too.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        toast(tr({fr:'Boutique mise à jour', en:'Shop updated', ar:'تم تحديث المتجر'}), { type: 'success', force: true });
      });
    },

    /* ─── Onboarding wizard — create the merchant's own (blank) dashboard.
     * Reached by entering PIN 0000 at the lock screen. ─── */
    'onboard': () => {
      let picked = 'restaurant';
      /* Material Symbols (Outlined, 400, grade 0, grille 24), recopiés depuis
       * assets/icons/material/ — voir le README de ce dossier. Forme pleine,
       * viewBox natif 0 -960 960 960 : la CSS pilote `color`, pas `stroke`. */
      const mi = (d) => `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
      // Each visible type maps to a data vertical (`base`); the specific label
      // is what the merchant sees. `primary` types show first. THE list is
      // assets/trades.js — this literal is the parachute, and it is also why
      // the lists drifted: it offered « traiteur » and « librairie », which
      // assets/venues.js could not map to any vertical.
      const KT = window.KiwiTrades;
      const TYPES = (KT && KT.all().map((t) => ({ id: t.id, base: t.base, primary: t.primary, label: KT.label(t.id), icon: t.icon }))) || [
        { id: 'restaurant', base: 'restaurant', primary: true, label: 'Restaurant',          /* restaurant.svg */ icon: mi('M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z') },
        { id: 'boutique',   base: 'boutique',   primary: true, label: 'Boutique',            /* storefront.svg */ icon: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z') },
        { id: 'spa',        base: 'spa',        primary: true, label: tr({fr:'Spa / Bien-être', en:'Spa / Wellness', ar:'سبا / عافية'}),     /* spa.svg */ icon: mi('M480-80q-73-9-145-39.5T206.5-207Q150-264 115-351T80-560v-40h40q51 0 105 13t101 39q12-86 54.5-176.5T480-880q57 65 99.5 155.5T634-548q47-26 101-39t105-13h40v40q0 122-35 209t-91.5 144q-56.5 57-128 87.5T480-80Zm-2-82q-11-166-98.5-251T162-518q11 171 101.5 255T478-162Zm2-254q15-22 36.5-45.5T558-502q-2-57-22.5-119T480-742q-35 59-55.5 121T402-502q20 17 42 40.5t36 45.5Zm78 236q37-12 77-35t74.5-62.5q34.5-39.5 59-98.5T798-518q-94 14-165 62.5T524-332q12 32 20.5 70t13.5 82Zm-78-236Zm78 236Zm-80 18Zm46-170ZM480-80Z') },
        { id: 'cafe',       base: 'restaurant',                label: tr({fr:'Café / Salon de thé', en:'Café / Tea room', ar:'مقهى / صالون شاي'}), /* local_cafe.svg */ icon: mi('M160-120v-80h640v80H160Zm160-160q-66 0-113-47t-47-113v-400h640q33 0 56.5 23.5T880-760v120q0 33-23.5 56.5T800-560h-80v120q0 66-47 113t-113 47H320Zm0-80h240q33 0 56.5-23.5T640-440v-320H240v320q0 33 23.5 56.5T320-360Zm400-280h80v-120h-80v120ZM320-360h-80 400-320Z') },
        { id: 'fastfood',   base: 'restaurant',                label: tr({fr:'Fast-food / Snack', en:'Fast food / Snack', ar:'وجبات سريعة / سناك'}),   /* lunch_dining.svg */ icon: mi('M160-120q-33 0-56.5-23.5T80-200v-120h800v120q0 33-23.5 56.5T800-120H160Zm0-120v40h640v-40H160Zm263-160q-21 20-77 20t-76-20q-20-20-56-20t-57 20q-21 20-77 20v-80q36 0 57-20t77-20q56 0 76 20t56 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 56-20t76-20q56 0 79 20t55 20v80q-56 0-75-20t-55-20q-36 0-58 20t-78 20q-56 0-77-20t-57-20q-36 0-57 20ZM80-560v-40q0-115 108.5-177.5T480-840q183 0 291.5 62.5T880-600v40H80Zm400-200q-124 0-207.5 31T166-640h628q-23-58-106.5-89T480-760Zm0 520Zm0-400Z') },
        { id: 'bakery',     base: 'restaurant',                label: tr({fr:'Boulangerie', en:'Bakery', ar:'مخبزة'}),         /* bakery_dining.svg */ icon: mi('M804-282q17 9 30-4t4-30l-58-108-42 108 66 34Zm-200-38h48l96-238q3-8-1.5-13.5T736-580l-80-32q-9-3-17.5 2T628-596l-24 276Zm-296 0h48l-24-276q-2-11-10.5-15t-17.5-1l-80 32q-8 3-11.5 8.5T212-558l96 238Zm-152 38 66-34-42-108-58 108q-9 17 4 30t30 4Zm280-38h88l30-338q2-9-4.5-15.5T534-680H426q-8 0-14.5 6.5T406-658l30 338ZM138-200q-42 0-70-31.5T40-306q0-12 3.5-23.5T52-352l88-168q-14-40 1-79t53-55l80-32q14-5 28-7t28 1q14-29 39-48.5t57-19.5h108q32 0 57 19.5t39 48.5q14-2 28-.5t28 6.5l80 32q40 16 56 55t-2 77l88 168q6 11 9 23t3 25q0 45-30.5 75.5T814-200q-11 0-22-2.5t-22-7.5l-62-30H250l-56 30q-13 7-27.5 8.5T138-200Zm342-280Z') },
        { id: 'pizzeria',   base: 'restaurant',                label: 'Pizzeria',            /* local_pizza.svg */ icon: mi('M480-80 80-680q85-72 186.5-116T480-840q112 0 213.5 43.5T880-680L480-80Zm0-144 292-438q-65-45-139-71.5T480-760q-79 0-152.5 26.5T188-662l292 438Zm-57.5-353.5Q440-595 440-620t-17.5-42.5Q405-680 380-680t-42.5 17.5Q320-645 320-620t17.5 42.5Q355-560 380-560t42.5-17.5Zm100 200Q540-395 540-420t-17.5-42.5Q505-480 480-480t-42.5 17.5Q420-445 420-420t17.5 42.5Q455-360 480-360t42.5-17.5ZM480-224Z') },
        { id: 'traiteur',   base: 'restaurant',                label: tr({fr:'Traiteur', en:'Caterer', ar:'خدمات تقديم الطعام'}),            /* room_service.svg */ icon: mi('M80-200v-80h800v80H80Zm40-120v-40q0-128 78.5-226T400-710v-10q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720v10q124 26 202 124t78 226v40H120Zm82-80h556q-14-104-93-172t-185-68q-106 0-184.5 68T202-400Zm278 0Z') },
        { id: 'foodtruck',  base: 'restaurant',                label: 'Food truck',          /* local_shipping.svg */ icon: mi('M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z') },
        { id: 'epicerie',   base: 'boutique',                  label: tr({fr:'Épicerie', en:'Grocery', ar:'بقالة'}),            /* local_grocery_store.svg */ icon: mi('M223.5-103.5Q200-127 200-160t23.5-56.5Q247-240 280-240t56.5 23.5Q360-193 360-160t-23.5 56.5Q313-80 280-80t-56.5-23.5Zm400 0Q600-127 600-160t23.5-56.5Q647-240 680-240t56.5 23.5Q760-193 760-160t-23.5 56.5Q713-80 680-80t-56.5-23.5ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z') },
        { id: 'pharmacie',  base: 'boutique',                  label: 'Pharmacie',           /* local_pharmacy.svg */ icon: mi('M120-120v-80l80-240-80-240v-80h508l58-160 94 34-46 126h106v80l-80 240 80 240v80H120Zm320-160h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm-236 80h552l-80-240 80-240H204l80 240-80 240Zm276-240Z') },
        { id: 'librairie',  base: 'boutique',                  label: tr({fr:'Librairie', en:'Bookshop', ar:'مكتبة'}),           /* menu_book.svg */ icon: mi('M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z') },
        { id: 'fleuriste',  base: 'boutique',                  label: tr({fr:'Fleuriste', en:'Florist', ar:'محل أزهار'}),           /* local_florist.svg */ icon: mi('M480-600q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm-70.5 218.5Q378-403 364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360q-39 0-70.5-21.5ZM480-80q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm98-98q57-21 100-64t64-100q-57 21-100 64t-64 100Zm-98 98q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Zm-98-98q-57-21-100-64t-64-100q57 21 100 64t64 100Zm196 0Zm-196 0Zm232-339q19 0 32.5-13.5T660-563q0-14-7.5-24.5T633-604l-35-17q-2 11-6 21.5t-9 19.5q-5 9-12 17t-15 15l32 23q5 4 11.5 6t14.5 2Zm-16-142 35-17q12-6 19-17t7-24q0-19-13-32.5T614-763q-8 0-14 2t-12 6l-33 23q8 7 15.5 15t12.5 17q5 9 9 19.5t6 21.5Zm-159-93q10-4 20-6t21-2q11 0 21 2t20 6l5-44q2-18-12.5-31T480-840q-19 0-33.5 13T434-796l5 44Zm41 312q19 0 33.5-13t12.5-31l-5-44q-10 4-20 6t-21 2q-11 0-21-2t-20-6l-5 44q-2 18 12.5 31t33.5 13ZM362-659q2-11 6-21.5t9-19.5q5-9 12-17t15-15l-32-23q-5-4-11.5-6t-14.5-2q-19 0-32.5 13.5T300-717q0 13 7.5 24t19.5 17l35 17Zm-16 141q8 0 14-1.5t12-6.5l33-22q-8-7-15.5-15T377-580q-5-9-9-19.5t-6-21.5l-35 17q-12 6-19 17t-7 24q1 19 13.5 32t31.5 13Zm237-62Zm0-120Zm-103-60Zm0 240ZM377-700Zm0 120Z') },
        { id: 'maison',     base: 'boutique',                  label: tr({fr:'Maison', en:'Home', ar:'المنزل'}), /* home_and_garden.svg */ icon: mi('M160-160v-375l-72 55-47-63 439-337 440 336-48 64-392-300-240 184v356h160v80H160Zm540 95q-42 29-92.5 24.5T521-81q-36-36-40.5-86.5T505-260q-29-42-24.5-92.5T521-439q36-36 86.5-40.5T700-455q42-29 92.5-24.5T879-439q36 36 40.5 86.5T895-260q29 42 24.5 92.5T879-81q-36 36-86.5 40.5T700-65Zm0-98 46 32q18 13 39 11t37-18q16-16 18-37t-11-39l-32-46 32-46q13-18 11-39t-18-37q-16-16-37-18t-39 11l-46 32-46-32q-18-13-39-11t-37 18q-16 16-18 37t11 39l32 46-32 46q-13 18-11 39t18 37q16 16 37 18t39-11l46-32Zm35.5-61.5Q750-239 750-260t-14.5-35.5Q721-310 700-310t-35.5 14.5Q650-281 650-260t14.5 35.5Q679-210 700-210t35.5-14.5ZM480-470Zm220 210Z') },
        { id: 'coiffure',   base: 'spa',                       label: tr({fr:'Salon de coiffure', en:'Hair salon', ar:'صالون حلاقة'}),   /* content_cut.svg */ icon: mi('M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z') },
        { id: 'sport',      base: 'spa',                       label: tr({fr:'Salle de sport', en:'Gym', ar:'صالة رياضية'}),      /* fitness_center.svg */ icon: mi('m536-84-56-56 142-142-340-340-142 142-56-56 56-58-56-56 84-84-56-58 56-56 58 56 84-84 56 56 58-56 56 56-142 142 340 340 142-142 56 56-56 58 56 56-84 84 56 58-56 56-58-56-84 84-56-56-58 56Z') },
      ];
      const moreCount = TYPES.filter((t) => !t.primary).length;
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      const m = modal({
        tag: 'BIENVENUE SUR KIWI',
        title: 'Configurez votre tableau de bord',
        desc: 'Une minute pour créer le vôtre, vide, prêt à se remplir avec vos vraies ventes.',
        width: 520,
        body: `
          <style>
            .ob-type{display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 8px;
              border:1px solid var(--n-200);border-radius:12px;background:var(--surface);cursor:pointer;
              font-family:var(--sans);font-size:12px;font-weight:500;color:var(--n-600);text-align:center;
              transition:border-color 140ms,background 140ms,color 140ms;}
            .ob-type svg{width:24px;height:24px;}
            .ob-type:hover{border-color: var(--n-400);}
            .ob-type.sel{border-color:var(--atlas);background:rgba(11,110,79,0.05);color:var(--atlas);}
            .ob-type.ob-more{display:none;}
            .ob-morebtn{margin-top:8px;width:100%;padding:9px;border:1px dashed var(--n-300);
              border-radius:10px;background:var(--surface);cursor:pointer;font-family:var(--sans);font-size:12.5px;
              font-weight:500;color:var(--n-600);transition:border-color 140ms,color 140ms;}
            .ob-morebtn:hover{border-color:var(--atlas);color:var(--atlas);}
            .ob-field:focus{border-color:var(--atlas)!important;}
          </style>
          <label style="${lbl}margin-top:4px;">Type d'activité</label>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${TYPES.map((t) => `<button type="button" class="ob-type${t.id === picked ? ' sel' : ''}${t.primary ? '' : ' ob-more'}" data-ob-type="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}
          </div>
          <button type="button" class="ob-morebtn" data-ob-more>+ Plus de types (${moreCount})</button>
          <label style="${lbl}">Nom de l'activité</label>
          <input class="ob-field" data-ob-name placeholder="Ex. Café des Oudayas" style="${fld}" maxlength="40"/>
          <label style="${lbl}">Ville</label>
          <input class="ob-field" data-ob-city placeholder="Ex. Rabat" style="${fld}" maxlength="30"/>
          <label style="${lbl}">Objectif de chiffre d'affaires par jour <span style="color: var(--n-500);font-weight:400;">· optionnel</span></label>
          <input class="ob-field" data-ob-goal type="number" inputmode="numeric" placeholder="Ex. 5000 MAD" style="${fld}" min="0"/>
        `,
        foot: `<button data-activation=write class="kb atlas" data-ob-create type="button" style="width:100%;justify-content:center;padding:13px;font-size:15px;">Créer mon tableau de bord →</button>`,
      });
      const nameInput = m.el.querySelector('[data-ob-name]');
      setTimeout(() => nameInput && nameInput.focus(), 320);
      m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x.dataset.obType === picked));
      /* Step-1 values, captured before the body swaps to step 2. */
      let step1 = null;
      const doCreate = (answers) => {
        const { name, city, goal, def } = step1;
        let id = null;
        try {
          id = window.KiwiVenue?.createVenue?.({
            type: def.base, subtype: def.id,
            name, location: city, goal, profile: answers,
          });
        } catch (_) {}
        if (!id) { toast(tr({fr:'Création impossible', en:'Creation failed', ar:'تعذّر الإنشاء'}), { type: 'warn', force: true }); return; }
        m.close();
        try { window.KiwiVenue.setVenue(id); } catch (_) {}
        // A brand-new venue should land on "Aujourd'hui", not a stale range.
        const todayPill = document.querySelector('[data-action="date-range"][data-range="aujourdhui"]');
        if (todayPill && !todayPill.classList.contains('on')) todayPill.click();
        confetti();
        toast(tr({fr:'Votre tableau de bord est prêt', en:'Your dashboard is ready', ar:'لوحة التحكم جاهزة'}), { type: 'success', force: true,
          desc: `${name}, ${answers
            ? tr({fr:'profil complété ✓ · enregistrez votre première vente.', en:'profile completed ✓ · record your first sale.', ar:'اكتمل الملف ✓ · سجّل أول عملية بيع.'})
            : tr({fr:'enregistrez votre première vente pour le voir prendre vie.', en:'record your first sale to see it come alive.', ar:'سجّل أول عملية بيع لتراها تنبض بالحياة.'})}` });
      };
      const readAnswers = () => {
        const out = {};
        m.el.querySelectorAll('[data-ob-q]').forEach((i) => {
          const v = (i.value || '').trim();
          if (v) out[i.dataset.obQ] = v;
        });
        return Object.keys(out).length ? out : null;
      };
      m.el.addEventListener('click', (e) => {
        // "Plus de types" — reveal the hidden cards.
        if (e.target.closest('[data-ob-more]')) {
          m.el.querySelectorAll('.ob-type.ob-more').forEach((x) => x.classList.remove('ob-more'));
          const btn = m.el.querySelector('[data-ob-more]');
          if (btn) btn.style.display = 'none';
          return;
        }
        const t = e.target.closest('[data-ob-type]');
        if (t) {
          picked = t.dataset.obType;
          m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x === t));
          return;
        }
        if (e.target.closest('[data-ob-create]')) {
          const name = (nameInput.value || '').trim();
          if (!name) { toast(tr({fr:'Donnez un nom à votre activité', en:'Give your business a name', ar:'أدخل اسم نشاطك التجاري'}), { type: 'warn', force: true }); nameInput.focus(); return; }
          const city = (m.el.querySelector('[data-ob-city]').value || '').trim();
          const goal = +(m.el.querySelector('[data-ob-goal]').value) || 0;
          const def = TYPES.find((x) => x.id === picked) || TYPES[0];
          step1 = { name, city, goal, def };
          /* ── Step 2 · the trade's own questions — every field optional,
           * the whole step skippable. Answers personalize the venue. ── */
          const prof = window.KiwiVenue?.getSubtypeProfile?.(picked);
          if (!prof || !prof.questions || !prof.questions.length) { doCreate(null); return; }
          const optWord = tr({fr:'optionnel', en:'optional', ar:'اختياري'});
          m.el.querySelector('.kiwi-modal-body').innerHTML = `
            <style>.ob-field:focus{border-color:var(--atlas)!important;}</style>
            <div style="font-family:var(--mono);font-size:11px;letter-spacing:0.1em;color:var(--atlas);margin:2px 0 10px;">${tr({fr:'ÉTAPE 2 / 2 · TOUT EST OPTIONNEL', en:'STEP 2 / 2 · ALL OPTIONAL', ar:'الخطوة 2/2 · كل شيء اختياري'})}</div>
            <div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;">${tr({fr:'Parlez-nous de votre activité', en:'Tell us about your business', ar:'حدثنا عن نشاطك'})} · ${def.label}</div>
            <p style="font-size:13px;color:var(--n-500);margin:6px 0 2px;line-height:1.5;">${tr({fr:'30 secondes, Kiwi personnalise vos indicateurs et vos modules. Modifiable plus tard dans Paramètres.', en:'30 seconds, Kiwi tailors your indicators and modules. Editable later in Settings.', ar:'30 ثانية, يخصص كيوي مؤشراتك ووحداتك. قابل للتعديل لاحقًا في الإعدادات.'})}</p>
            ${prof.questions.map((q) => `
              <label style="${lbl}">${tr(q.label)} <span style="color: var(--n-500);font-weight:400;">· ${optWord}</span></label>
              <input class="ob-field" data-ob-q="${q.k}" ${q.type === 'number' ? 'type="number" inputmode="numeric" min="0"' : 'maxlength="60"'} placeholder="${q.ph}" style="${fld}"/>
            `).join('')}`;
          const foot = m.el.querySelector('.kiwi-modal-foot');
          if (foot) foot.innerHTML = `
            <button class="kb ghost" data-ob-skip type="button" style="flex:1;justify-content:center;">${tr({fr:'Passer pour l\'instant', en:'Skip for now', ar:'تخطّ الآن'})}</button>
            <button class="kb atlas" data-ob-finish type="button" style="flex:1.4;justify-content:center;">${tr({fr:'Terminer →', en:'Finish →', ar:'إنهاء ←'})}</button>`;
          setTimeout(() => { const f = m.el.querySelector('[data-ob-q]'); if (f) f.focus(); }, 120);
          return;
        }
        if (e.target.closest('[data-ob-skip]')) { doCreate(null); return; }
        if (e.target.closest('[data-ob-finish]')) { doCreate(readAnswers()); return; }
      });
    },

    'export': () => {
      toast(tr({fr:'Préparation de l\'export…', en:'Preparing export…', ar:'جارٍ تجهيز التصدير…'}), { type: 'info', duration: 1600 });
      setTimeout(() => {
        toast(tr({fr:'Export CSV prêt', en:'CSV export ready', ar:'ملف CSV جاهز'}), { type: 'success', desc: '182 transactions · 24 avril 2026', action: { label: tr({fr:'Télécharger', en:'Download', ar:'تنزيل'}), onClick: () => toast(tr({fr:'Téléchargement démarré', en:'Download started', ar:'بدأ التنزيل'}), {type:'info'}) } });
      }, 1800);
    },

    /* The prominent home-dashboard CTA must produce the same factual report
     * as Rapport journalier.  Resolution lives with the exporter so this
     * router never duplicates day boundaries, venue scoping or reconciliation. */
    'day-report-export': (el) => {
      const api = window.KiwiDayReportExport;
      if (!api || typeof api.openCurrent !== 'function') {
        toast(tr({fr:'Le rapport est encore en cours de chargement', en:'The report is still loading', ar:'لا يزال التقرير قيد التحميل'}), { type:'info' });
        return;
      }
      api.openCurrent(el);
    },

    'new-sale': () => {
      let amount = '';
      const m = modal({
        tag: 'NOUVELLE VENTE',
        title: 'Encaisser un montant',
        desc: 'Saisissez le montant et choisissez le mode d\'encaissement.',
        width: 440,
        body: `
          <div style="text-align:center; padding:20px 0 28px;">
            <div style="font-size:14px; color:var(--n-500); margin-bottom:6px;">MONTANT</div>
            <div style="font-size:64px; font-weight:600; letter-spacing:-0.045em; font-feature-settings:'tnum' 1; line-height:1;" data-amt>0<span style="font-size:22px; color: var(--n-500); margin-left:6px;">MAD</span></div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
            ${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(n => `<button class="kb ghost" style="padding:18px; font-size:19px; font-weight:500; justify-content:center;" data-key="${n}">${n}</button>`).join('')}
          </div>
          <div style="margin-top:18px; display:flex; flex-direction:column; gap:8px;">
            <button data-activation=money class="kb atlas" style="padding:14px; justify-content:center; font-size:15px;" data-method="card">Encaisser par carte · Tap ou dip</button>
            <button class="kb ghost" style="padding:14px; justify-content:center; font-size:15px;" data-method="qr">Afficher QR Kiwi Wallet</button>
          </div>
        `
      });
      m.el.addEventListener('click', (e) => {
        const k = e.target.closest('[data-key]');
        if (k) {
          const v = k.dataset.key;
          if (v === '⌫') amount = amount.slice(0, -1);
          else if (v === ',' && !amount.includes(',')) amount += ',';
          else if (v !== ',') amount += v;
          m.el.querySelector('[data-amt]').innerHTML = `${amount || '0'}<span style="font-size:22px; color: var(--n-500); margin-left:6px;">MAD</span>`;
        }
        const met = e.target.closest('[data-method]');
        if (met) {
          if (!amount) { toast(tr({fr:'Saisissez un montant', en:'Enter an amount', ar:'أدخل المبلغ'}), {type: 'warn'}); return; }
          const method = met.dataset.method;
          // On a user-created venue, a sale is REAL — persist it and let the
          // dashboard (hero · KPIs · feed) recompute from the sales store.
          const KV = window.KiwiVenue;
          const ownVenue = !!(KV && KV.isCustom && KV.isCustom()) || !!(window.KiwiEnv?.isReal?.());
          if (ownVenue && window.KiwiSales) {
            const num = parseFloat(String(amount).replace(',', '.')) || 0;
            if (num <= 0) { toast(tr({fr:'Montant invalide', en:'Invalid amount', ar:'المبلغ غير صالح'}), { type: 'warn', force: true }); return; }
            const vid = KV.getVenue();
            // Read BEFORE adding — the very first sale is a milestone, not a
            // routine toast. This is the moment onboarding literally promised.
            const first = (window.KiwiSales.totals(vid).count === 0);
            const sale = {
              id: 'dashboard-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
              amount: num, method, label: 'Vente tableau de bord',
              ref: 'WEB-' + Date.now(), time: new Date(), channel: 'dashboard'
            };
            const queued = window.KiwiLive?.postSale?.(sale);
            if (!queued || queued.ok === false) {
              toast(tr({fr:'Vente non enregistrée · vérifiez la connexion de la caisse', en:'Sale not recorded · check the register connection', ar:'لم يتم تسجيل البيع · تحقق من اتصال الصندوق'}), { type:'error', force:true });
              return;
            }
            m.close();
            const ML = { card: 'carte', qr: 'QR Wallet' };
            // Pulse the hero number so the merchant SEES their money land — a
            // spring scale via Web Animations (no CSS dependency).
            const pulseHero = () => { try { const h = document.querySelector('[data-hero-amount]'); if (h && h.animate) h.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.055)' }, { transform: 'scale(1)' }], { duration: 720, easing: 'cubic-bezier(0.34, 1.45, 0.5, 1)' }); } catch (_) {} };
            if (first) {
              let owner = ''; try { owner = (localStorage.getItem('kiwiOwnerName') || '').trim(); } catch (_) {}
              try { confetti(); } catch (_) {}
              setTimeout(pulseHero, 140);
              toast(tr({ fr: 'Votre première vente sur Kiwi', en: 'Your first sale on Kiwi', ar: 'أول عملية بيع لك على كيوي' }), {
                type: 'success', force: true, duration: 5200,
                desc: tr({
                  fr: `${amount} MAD encaissés · c'est parti${owner ? ', ' + owner : ''}, votre tableau de bord est vivant.`,
                  en: `${amount} MAD in · you're live${owner ? ', ' + owner : ''}, your dashboard is alive.`,
                  ar: `${amount} درهم · انطلقت${owner ? '، ' + owner : ''}، لوحتك الآن حيّة.`,
                }),
              });
            } else {
              setTimeout(pulseHero, 60);
              toast(tr({ fr: 'Vente enregistrée', en: 'Sale recorded', ar: 'تم تسجيل البيع' }), { type: 'success', force: true, desc: `${amount} MAD · ${ML[method] || method}` });
            }
            return;
          }
          m.close();
          if (method === 'card') toast(`${tr({fr:'En attente de la carte', en:'Waiting for card', ar:'في انتظار البطاقة'})} · ${amount} MAD`, {type: 'info', desc: tr({fr:'Présentez la carte au terminal ou téléphone', en:'Present the card to the terminal or phone', ar:'قدّم البطاقة للطرفية أو الهاتف'})});
          if (method === 'qr') toast(`${tr({fr:'QR généré', en:'QR generated', ar:'تم إنشاء QR'})} · ${amount} MAD`, {type: 'info', desc: tr({fr:'Client scanne depuis Kiwi Wallet', en:'Customer scans from Kiwi Wallet', ar:'يمسح العميل الرمز من Kiwi Wallet'})});
        }
      });
    },

    'instant-settle': () => {
      /* Demo Pay flow (fabricated 23 091 MAD → Bank of Africa ••3291). A real
         merchant has no settlement pipeline wired yet — show a neutral state
         instead of the demo payout. Local demo keeps the full flow. */
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
        toast(tr({ fr: 'Aucun règlement instantané en attente', en: 'No instant settlement pending', ar: 'لا تسوية فورية معلّقة' }), { type: 'info', desc: tr({ fr: 'Vos virements apparaîtront ici après vos premières ventes.', en: 'Your transfers will appear here after your first sales.', ar: 'ستظهر تحويلاتك هنا بعد مبيعاتك الأولى.' }) });
        return;
      }
      const m = modal({
        tag: 'RÈGLEMENT INSTANTANÉ',
        title: 'Recevoir 23 091 MAD en ~10 secondes',
        desc: 'Via Virement Instantané Bank Al-Maghrib. Frais : 1,50 MAD.',
        body: `
          <div style="background:var(--atlas); color:var(--paper); border-radius:14px; padding:22px; margin-bottom:18px;">
            <div style="font-size:11px; color:var(--mint); letter-spacing:0.1em; font-family:var(--mono);">VOUS ALLEZ RECEVOIR</div>
            <div style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; margin-top:6px; font-feature-settings:'tnum' 1;">23 089,50 <span style="font-size:18px; opacity:0.7;">MAD</span></div>
            <div style="font-size:13px; color:#c6ead4; margin-top:10px;">Sur Bank of Africa ••3291 · d\'ici 10 secondes</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13.5px;">
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--n-200);"><span style="color:var(--n-500);">Montant brut</span><span class="mono" style="font-family:var(--mono); font-weight:500;">23 091,00 MAD</span></div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--n-200);"><span style="color:var(--n-500);">Frais Virement Instantané</span><span class="mono" style="font-family:var(--mono); font-weight:500; color:var(--danger);">−1,50 MAD</span></div>
            <div style="display:flex; justify-content:space-between; padding:10px 0 4px; font-weight:600;"><span>Net reçu</span><span class="mono" style="font-family:var(--mono); color:var(--atlas); font-size:16px;">23 089,50 MAD</span></div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>Attendre demain 9h</button>
          <button class="kb atlas" data-confirm-settle>Confirmer le règlement →</button>
        `
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-dismiss]')) m.close();
        if (e.target.closest('[data-confirm-settle]')) {
          m.close();
          toast(tr({fr:'Règlement en cours…', en:'Settlement in progress…', ar:'جارٍ تنفيذ التسوية…'}), {type: 'info', duration: 2000});
          setTimeout(() => toast(tr({fr:'23 089,50 MAD crédités sur Bank of Africa ••3291', en:'23 089,50 MAD credited to Bank of Africa ••3291', ar:'23 089,50 MAD مُضافة إلى Bank of Africa ••3291'}), {type: 'success', desc: tr({fr:'Virement Instantané exécuté en 8,4 s', en:'Instant Transfer executed in 8.4 s', ar:'تم تنفيذ التحويل الفوري في 8,4 ثانية'})}), 2200);
        }
      });
    },

    'tx-detail': (el, arg) => {
      /* Static demo transaction (Café Atlas customer/staff/card, Bank of Africa
         ••3291 batch). No real per-transaction backend yet, so a real merchant
         gets a neutral state rather than the demo record. Local demo unchanged. */
      if ((window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || window.KiwiVenue?.isCustom?.()) {
        toast(tr({ fr: 'Détail de transaction indisponible', en: 'Transaction detail unavailable', ar: 'تفاصيل المعاملة غير متوفرة' }), { type: 'info' });
        return;
      }
      const data = txData[arg] || txData['default'];
      modal({
        tag: 'TRANSACTION · ' + data.id,
        title: data.method,
        desc: `Autorisée le ${data.date} · réseau ${data.network}`,
        width: 560,
        body: `
          <div class="tx-detail-hero">
            <div class="amt">${data.amount}</div>
            <div class="status">${I.check} ${data.status}</div>
          </div>
          <dl class="tx-detail-grid">
            <dt>Client</dt><dd>${data.customer}</dd>
            <dt>Table</dt><dd>${data.table}</dd>
            <dt>Panier</dt><dd>${data.cart}</dd>
            <dt>Pourboire</dt><dd>${data.tip}</dd>
            <dt>Commission Kiwi</dt><dd>${data.fee}</dd>
            <dt>Net reçu</dt><dd>${data.net}</dd>
            <dt>Carte</dt><dd>${data.card}</dd>
            <dt>Émetteur</dt><dd>${data.issuer}</dd>
            <dt>Pays émetteur</dt><dd>${data.country}</dd>
            <dt>Encaissé par</dt><dd>${data.staff}</dd>
          </dl>
          <div class="tx-timeline">
            <div class="tx-timeline-item">
              <div class="t">14:32:18</div>
              <div class="n">Autorisation émise</div>
              <div class="d">Visa · autorisation ARN 28410398281</div>
            </div>
            <div class="tx-timeline-item">
              <div class="t">14:32:19</div>
              <div class="n">3-D Secure contourné</div>
              <div class="d">Tap carte contactless · &lt; 500 MAD</div>
            </div>
            <div class="tx-timeline-item">
              <div class="t">14:32:20</div>
              <div class="n">Capture confirmée</div>
              <div class="d">Interchange 0,45 % · scheme 0,12 %</div>
            </div>
            <div class="tx-timeline-item last">
              <div class="t">25 avril 09:00</div>
              <div class="n">Règlement prévu</div>
              <div class="d">Inclus dans le batch de 23 089,50 MAD → Bank of Africa ••3291</div>
            </div>
          </div>
        `,
        foot: `
          <button data-activation=money class="kb ghost" data-refund>Rembourser partiellement</button>
          <button data-activation=write class="kb ghost" data-print>Renvoyer le reçu</button>
          <button class="kb primary" data-dismiss>Fermer</button>
        `
      });
      document.body.addEventListener('click', function once(e) {
        if (e.target.closest('[data-refund]')) { document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click(); setTimeout(() => toast(tr({fr:'Choisir montant à rembourser', en:'Choose amount to refund', ar:'اختر المبلغ المراد استرداده'}), {type:'info'}), 220); }
        if (e.target.closest('[data-print]')) toast(tr({fr:'Reçu envoyé par WhatsApp à Karim B.', en:'Receipt sent via WhatsApp to Karim B.', ar:'تم إرسال الإيصال عبر WhatsApp إلى Karim B.'}), {type:'success'});
        if (e.target.closest('[data-dismiss]')) document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click();
        document.body.removeEventListener('click', once);
      });
    },

    /* Open the rich detail drawer for a live-feed order. Reads the cached
     * order object stored by renderFeed() under window.__kiwiFeedOrders.
     * Shows: receipt + time, total, status; table/server/covers/duration;
     * itemized cart with quantities; subtotal + TVA + total; payment block
     * (real brand chip + flag + amount); timeline; receipt actions. */
    'open-order': (el) => {
      const key = el?.dataset?.orderKey;
      const o = (window.__kiwiFeedOrders || {})[key];
      if (!o) { handlers['tx-detail'](el, 'tx1'); return; }

      const lang = kiwiLang();
      const T = {
        fr: { tag: 'COMMANDE', status: 'Encaissée', table: 'Table', server: 'Serveur', covers: 'Couverts', duration: 'Durée service', cover: 'couvert', covers_pl: 'couverts', minutes: 'min', items: 'Articles', payment: 'Paiement', subtotal: 'Sous-total', tva: 'TVA', total: 'Total encaissé', due: 'À recevoir', dueTotal: 'Total à recevoir', timeline: 'Chronologie', opened: 'Table ouverte', sent: 'Envoyé en cuisine', ready: 'Prêt', paid: 'Payé', closed: 'Table fermée', sendReceipt: 'Envoyer le reçu', refund: 'Rembourser', cancel: 'Annuler la vente', cancelConfirm: 'Annuler cette vente ? Cette action sera journalisée.', cancelled: 'Vente annulée', cancelCollections: 'Cette livraison a déjà des encaissements. Le gérant doit corriger les reçus liés.', cancelFailed: 'Annulation impossible. Vérifiez vos droits et réessayez.', close: 'Fermer', receiptSent: 'WhatsApp ouvert avec le reçu', receiptSentDesc: 'Choisissez le client dans WhatsApp, puis envoyez.', refundPrompt: 'Choisir le montant à rembourser' },
        en: { tag: 'ORDER', status: 'Paid', table: 'Table', server: 'Server', covers: 'Covers', duration: 'Service time', cover: 'cover', covers_pl: 'covers', minutes: 'min', items: 'Items', payment: 'Payment', subtotal: 'Subtotal', tva: 'VAT', total: 'Total paid', due: 'To receive', dueTotal: 'Total to receive', timeline: 'Timeline', opened: 'Table opened', sent: 'Sent to kitchen', ready: 'Ready', paid: 'Paid', closed: 'Table closed', sendReceipt: 'Send receipt', refund: 'Refund', cancel: 'Cancel sale', cancelConfirm: 'Cancel this sale? This action will be logged.', cancelled: 'Sale cancelled', cancelCollections: 'This delivery already has collections. The manager must correct the linked receipts.', cancelFailed: 'Could not cancel the sale. Check your permissions and try again.', close: 'Close', receiptSent: 'WhatsApp opened with the receipt', receiptSentDesc: 'Pick the customer in WhatsApp, then send.', refundPrompt: 'Choose refund amount' },
        ar: { tag: 'طلب', status: 'تمّ الدفع', table: 'الطاولة', server: 'النادل', covers: 'الضيوف', duration: 'مدة الخدمة', cover: 'ضيف', covers_pl: 'ضيوف', minutes: 'د', items: 'الأصناف', payment: 'الدفع', subtotal: 'الإجمالي', tva: 'الضريبة', total: 'المبلغ المدفوع', due: 'للتحصيل', dueTotal: 'المبلغ المستحق', timeline: 'الجدول الزمني', opened: 'فُتحت الطاولة', sent: 'أُرسل للمطبخ', ready: 'جاهز', paid: 'مدفوع', closed: 'أُغلقت الطاولة', sendReceipt: 'إرسال الإيصال', refund: 'استرداد', cancel: 'إلغاء البيع', cancelConfirm: 'إلغاء هذا البيع؟ سيتم تسجيل العملية.', cancelled: 'تم إلغاء البيع', cancelCollections: 'لهذا التوصيل تحصيلات مسجلة. يجب على المدير تصحيح الإيصالات المرتبطة.', cancelFailed: 'تعذر إلغاء البيع. تحقق من الصلاحيات وحاول مرة أخرى.', close: 'إغلاق', receiptSent: 'تم فتح واتساب مع الإيصال', receiptSentDesc: 'اختر العميل في واتساب ثم أرسل.', refundPrompt: 'اختر مبلغ الاسترداد' },
      };
      const L = T[lang] || T.fr;
      /* Sale label / refund ref / item names / server are free text from any
       * till (stored raw by POST /api/sale). Escape everything user-controlled
       * before it reaches innerHTML. */
      const eh = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      /* Same brand assets the row uses — kept in sync so the drawer feels
       * like an enlarged version of the chip the merchant just tapped. */
      const ICONS = {
        visa: `<img src="assets/icons/visa.svg" alt="Visa">`,
        mc:   `<img src="assets/icons/mastercard.png" alt="Mastercard">`,
        cash: `<img src="assets/icons/cash.webp" alt="Espèces">`,
        tap:  `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8.5 8a5 5 0 0 1 0 8M12 5a8 8 0 0 1 0 14M15.5 2a11 11 0 0 1 0 20"/></svg>`,
        qr:   `<img src="assets/icons/qr-code.png" alt="QR">`,
      };
      const chip = ICONS[o.method] || '';

      /* Format helpers — only used here, kept local. */
      const fmtNum = (n) => (window.KiwiNumber?.format(Number(n), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? Number(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      const coversLbl = o.covers === 1 ? L.cover : L.covers_pl;

      /* Timeline — back-derive 3 prep moments from the paid time so the
       * sequence reads naturally. Service was X min; assume kitchen
       * handoff at 30% and ready at 70%. */
      /* A real sale only knows when it was paid. The kitchen and ready times
         were derived from a guessed 20-minute service; on a real sale the
         timeline shows what was recorded, nothing else. */
      const realSale = !!o.saleId;
      const knownDur = +o.serviceMinutes > 0;
      const dur = knownDur ? Math.max(1, Math.round(+o.serviceMinutes)) : (realSale ? 0 : 20);
      const [hh, mm] = (o.t || '12:00').split(':').map(Number);
      const minus = (back) => {
        let m = hh * 60 + mm - back;
        if (m < 0) m += 24 * 60;
        const h = Math.floor(m / 60) % 24, x = m % 60;
        return String(h).padStart(2, '0') + ':' + String(x).padStart(2, '0');
      };
      const tOpened = minus(dur);
      const tSent   = minus(Math.round(dur * 0.7));
      const tReady  = minus(Math.round(dur * 0.3));
      const tPaid   = o.t;

      const itemsHtml = (o.items || []).map(it => `
        <div class="ord-item">
          <div class="qty">×${eh(it.qty)}</div>
          <div>
            <div class="nm">${eh(it.name)}</div>
            <div class="unit">${fmtNum(it.price)} MAD ${L.cover === 'cover' ? 'each' : (lang === 'ar' ? 'للوحدة' : 'pièce')}</div>
          </div>
          <div class="ln">${fmtNum(it.qty * it.price)} MAD</div>
        </div>
      `).join('');

      const cancelFoot = o.saleId ? `<button class="kb ghost" data-ord-cancel>${L.cancel}</button>` : '';
      drawer({
        title: o.primary,
        subtitle: `${L.tag} · ${o.receiptNo || ''}`,
        width: 460,
        body: `
          <div class="ord-hero">
            <div class="row1">
              <div class="ticket">${L.tag} · ${eh(o.receiptNo || '')}</div>
              <div class="when">${eh(o.t)}</div>
            </div>
            <div class="amt">${o.amt}<span class="cur">MAD</span></div>
            <div class="status">${o.toReceive ? L.due : L.status}</div>
          </div>

          <div class="ord-stats">
            <div class="ord-stat">
              <div class="lbl">${L.table}</div>
              <div class="val">T${o.table != null ? eh(o.table) : '·'}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.covers}</div>
              <div class="val">${eh(o.covers || 1)}</div>
              <div class="sub">${coversLbl}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.server}</div>
              <div class="val" style="font-size:13px;">${eh(o.server || '·')}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.duration}</div>
              <div class="val">${dur ? `${dur}<span style="font-size:11px;color:var(--n-500);font-weight:500;margin-left:3px;">${L.minutes}</span>` : '·'}</div>
            </div>
          </div>

          <div class="ord-section-lbl">${L.items}</div>
          <div class="ord-items">${itemsHtml || `<div class="ord-item"><div class="qty">·</div><div><div class="nm">·</div></div><div class="ln">·</div></div>`}</div>

          <div class="ord-totals">
            <div class="k">${L.subtotal}</div><div class="v">${o.subtotal} MAD</div>
            <div class="k">${L.tva} (${o.tvaRate != null ? o.tvaRate : 10}%)</div><div class="v">${o.tva} MAD</div>
            <div class="k total">${o.toReceive ? L.dueTotal : L.total}</div><div class="v total">${o.total} MAD</div>
          </div>

          <div class="ord-section-lbl">${L.payment}</div>
          <div class="ord-pay">
            <div class="ci ${eh(o.method)}">${chip}</div>
            <div>
              <div class="pay-prim">${eh(o.primary)}</div>
              <div class="pay-sub"><span class="pay-flag ${eh(o.flag || '')}"></span>${eh(o.sub || '')}</div>
            </div>
            <div class="pay-amt">${o.amt} MAD</div>
          </div>

          <div class="ord-section-lbl">${L.timeline}</div>
          <div class="tx-timeline">
            ${realSale && !knownDur ? `<div class="tx-timeline-item last"><div class="t">${eh(tPaid)}</div><div class="n">${L.paid}</div><div class="d">${eh(o.primary)} · ${eh(o.sub || '')}</div></div>` : `
            <div class="tx-timeline-item"><div class="t">${tOpened}</div><div class="n">${L.opened}</div><div class="d">T${o.table != null ? eh(o.table) : '·'} · ${eh(o.covers || 1)} ${coversLbl} · ${eh(o.server || '·')}</div></div>
            <div class="tx-timeline-item"><div class="t">${tSent}</div><div class="n">${L.sent}</div><div class="d">${(o.items || []).map(i => `×${eh(i.qty)} ${eh(i.name)}`).join(' · ') || '·'}</div></div>
            <div class="tx-timeline-item"><div class="t">${tReady}</div><div class="n">${L.ready}</div><div class="d">${L.server === 'Server' ? 'Picked up by' : (L.server === 'النادل' ? 'استلمه' : 'Récupéré par')} ${eh(o.server || '·')}</div></div>
            <div class="tx-timeline-item last"><div class="t">${eh(tPaid)}</div><div class="n">${L.paid} · ${L.closed}</div><div class="d">${eh(o.primary)} · ${eh(o.sub || '')}</div></div>`}
          </div>
        `,
        foot: `
          ${cancelFoot}
          <button data-activation=write class="kb ghost" data-ord-receipt>${L.sendReceipt}</button>
          ${realSale ? '' : `<button data-activation=money class="kb ghost" data-ord-refund>${L.refund}</button>`}
          <button class="kb primary" data-dismiss>${L.close}</button>
        `,
      });

      /* Footer actions — light demo wiring, mirrors tx-detail's pattern. */
      document.body.addEventListener('click', function once(e) {
        const cancelButton = e.target.closest('[data-ord-cancel]');
        if (cancelButton && o.saleId) {
          if (!window.confirm(L.cancelConfirm)) return;
          cancelButton.disabled = true;
          const url = new URL(location.href);
          const venue = window.KiwiVenue?.getVenue?.() || {};
          const merchant = url.searchParams.get('merchant') || venue.merchant || venue.id || '';
          fetch('/api/sale/cancel', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ merchant: String(merchant), id: String(o.saleId), source: 'dashboard' }),
          }).then(async (r) => {
            const payload = await r.json().catch(() => ({}));
            if (!r.ok || !payload.ok) throw new Error(payload.error || 'cancel-failed');
            return payload;
          }).then(() => {
            toast(L.cancelled, { type: 'success' });
            document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click();
            const targetRef = String(o.ref || o.receiptNo || o.saleId || '').trim();
            document.dispatchEvent(new CustomEvent('kiwi-sales-voided', { detail: { refs: [targetRef], merchant } }));
          }).catch((err) => {
            cancelButton.disabled = false;
            /* Une vente déjà remboursée ou transformée en avoir ne s'annule pas :
               l'annuler retirerait la même somme deux fois des chiffres. */
            toast(err && err.message === 'sale-has-collections' ? L.cancelCollections : L.cancelFailed, { type: 'error', ...(err && err.message === 'sale-has-refunds'
              ? { desc: 'Cette vente a déjà été remboursée ou transformée en avoir.' } : {}) });
          }).finally(() => document.body.removeEventListener('click', once));
          return;
        }
        if (e.target.closest('[data-ord-receipt]')) {
          /* Kiwi has no WhatsApp sender. The receipt is written out and WhatsApp
             opens on it; the merchant picks the customer and sends. */
          const lines = (o.items || []).map((i) => `${i.qty} × ${i.name} · ${fmtNum(i.qty * i.price)} MAD`);
          const text = [`${L.tag} ${o.receiptNo || ''} · ${o.t || ''}`, ...lines, `${L.total} : ${o.total} MAD`].join('\n');
          window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
          toast(L.receiptSent, { type: 'info', desc: L.receiptSentDesc });
        }
        if (e.target.closest('[data-ord-refund]'))  { document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click(); setTimeout(() => toast(L.refundPrompt, { type: 'info' }), 220); }
        if (e.target.closest('[data-dismiss]'))     { document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click(); }
        document.body.removeEventListener('click', once);
      });
    },

    'upgrade-pro': () => {
      if (document.documentElement.classList.contains('kiwi-native')) {
        toast(tr({fr:'La gestion des formules n’est pas disponible dans cette app.', en:'Plan changes are not available in this app.', ar:'تغيير الباقة غير متاح في هذا التطبيق.'}));
        return;
      }
      /* Four-tier model. The recommended tier is contextual to the account: a
       * multi-établissement account needs Ultra (Basic/Pro are mono-site); the
       * exact palier is confirmed in a short discovery chat (so it's not fixed). */
      /* The merchant's real plan, never a constant. It used to say « Pro ·
         plan actuel » to every account and recommend Ultra to everyone. */
      const realAcct = !!(window.KiwiEnv?.isReal?.() || window.KiwiVenue?.isCustom?.());
      const planRaw = String(window.KiwiVenue?.getPlan?.() || window.KiwiConfig?.plan || '').toLowerCase();
      const known = ['basic', 'plus', 'pro', 'ultra', 'ultimate'].find((id) => planRaw.includes(id)) || '';
      const current = realAcct ? known : 'pro';
      const reco = realAcct ? '' : 'ultra';
      /* Tiers, prices and lists in the app's three languages
         (assets/plan-catalog.js, kept equal to the landing page). */
      const lang = ['fr', 'en', 'ar'].includes(kiwiLang()) ? kiwiLang() : 'fr';
      const C = (window.KiwiPlanCatalog && (window.KiwiPlanCatalog[lang] || window.KiwiPlanCatalog.fr)) || null;
      if (!C) return;
      const h = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const ctaFor = (id, name) => id === current ? C.ctaCurrent
        : id === 'ultra' ? C.ultraCta : id === 'ultimate' ? C.quoteCta : C.choose.replace('{name}', name);
      const PLANS = ['basic', 'plus', 'pro', 'ultra', 'ultimate'].map((id) => {
        const t = C.tiers[id];
        return { id, name: 'KIWI ' + String(t.name).toUpperCase(), price: t.price, unit: t.unit, tagline: t.tagline, cta: ctaFor(id, t.name), feats: t.feats };
      });
      const card = (p) => `
        <div class="kup-card${p.id === current ? ' is-current' : ''}${p.id === reco ? ' is-reco' : ''}">
          ${p.id === current ? `<div class="kup-badge">${h(C.badgeCurrent)}</div>` : (p.id === reco ? `<div class="kup-badge">${h(C.badgeReco)}</div>` : '')}
          <div class="kup-name">${h(p.name)}</div>
          <div class="kup-price">${h(p.price)}${p.unit ? `<span>${h(p.unit)}</span>` : ''}</div>
          <div class="kup-tagline">${h(p.tagline)}</div>
          <ul class="kup-feats">${p.feats.map((f) => `<li>${h(f)}</li>`).join('')}</ul>
          <button class="kup-cta"${p.id === current ? ' disabled' : ` data-action="upgrade-plan" data-arg="${p.id}"`}>${h(p.cta)}</button>
        </div>`;
      return modal({
        tag: C.tag,
        title: C.title,
        desc: C.desc,
        width: 1180,
        body: `
          <style>
            .kup-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; align-items:stretch; }
            @media (max-width:1080px){ .kup-grid{ grid-template-columns:repeat(3,1fr); } }
            @media (max-width:880px){ .kup-grid{ grid-template-columns:repeat(2,1fr); } }
            @media (max-width:520px){ .kup-grid{ grid-template-columns:1fr; } }
            .kup-card { display:flex; flex-direction:column; border:1px solid var(--n-200); border-radius:14px; padding:18px 14px 14px; background:var(--surface); position:relative; }
            .kup-card.is-current { background:var(--paper-soft); }
            .kup-card.is-reco { background:linear-gradient(165deg,#0c4a35,#08311f); border-color:transparent; color:#fff; box-shadow:0 14px 34px -18px rgba(11,110,79,0.55); }
            .kup-badge { position:absolute; top:-9px; inset-inline-start:14px; font-size:11px; font-weight:700; letter-spacing:0.06em; padding:3px 8px; border-radius:999px; white-space:nowrap; }
            .kup-card.is-current .kup-badge { background: var(--inverse-surface); color: var(--inverse-ink); }
            .kup-card.is-reco .kup-badge { background:var(--mint); color:#06371f; }
            .kup-name { font-family:var(--mono); font-size:11px; letter-spacing:0.08em; color:var(--n-500); margin-bottom:9px; }
            .kup-card.is-reco .kup-name { color:rgba(255,255,255,0.65); }
            .kup-price { font-size:23px; font-weight:600; letter-spacing:-0.02em; line-height:1.1; }
            .kup-price span { font-size:12px; font-weight:400; color:var(--n-500); margin-inline-start:2px; }
            .kup-card.is-reco .kup-price span { color:rgba(255,255,255,0.7); }
            .kup-tagline { font-size:11.5px; color:var(--n-500); margin:5px 0 13px; min-height:30px; line-height:1.35; }
            .kup-card.is-reco .kup-tagline { color:rgba(255,255,255,0.82); }
            .kup-feats { list-style:none; padding:0; margin:0 0 15px; display:flex; flex-direction:column; gap:7px; flex:1; }
            .kup-feats li { font-size:12px; line-height:1.35; padding-inline-start:18px; position:relative; }
            .kup-feats li::before { content:'✓'; position:absolute; inset-inline-start:0; color:var(--atlas); font-weight:700; }
            .kup-card.is-reco .kup-feats li::before { color:var(--mint); }
            .kup-cta { width:100%; padding:9px 10px; border-radius:9px; font-size:12.5px; font-weight:600; font-family:var(--sans); cursor:pointer; border:1px solid var(--n-300); background:transparent; color:var(--ink); transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms, box-shadow 130ms; }
            .kup-cta:hover:not([disabled]) { border-color:var(--atlas); color:var(--atlas); }
            .kup-card.is-reco .kup-cta { background:var(--surface); color:#08311f; border-color:#fff; }
            .kup-card.is-reco .kup-cta:hover { background:var(--mint); border-color:var(--mint); color:#06371f; }
            .kup-cta[disabled] { opacity:0.5; cursor:default; }
            .kup-tip { display:flex; gap:11px; align-items:flex-start; margin-top:16px; padding:13px 15px; background:var(--mint-soft); border-radius:12px; font-size:12.5px; line-height:1.5; color:var(--ink); }
          </style>
          <div class="kup-grid">${PLANS.map(card).join('')}</div>
          <div class="kup-tip">
            <div style="color:var(--atlas); flex-shrink:0; margin-top:1px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6"/></svg></div>
            <div style="flex:1;">${realAcct ? h(C.tipReal) : C.tipDemo}</div>
          </div>
        `,
        foot: `<button class="kb ghost" data-dismiss>${h(C.later)}</button>`,
      });
    },

    'upgrade-plan': (el, plan) => {
      if (document.documentElement.classList.contains('kiwi-native')) return;
      /* « Demande Ultra envoyée · votre account manager vous appelle sous 24 h »
       * was a toast: nothing was sent, no one was told. A plan request is now a
       * support ticket (/api/support/tickets), the same queue the help centre
       * writes to, with a reference the merchant can quote. */
      const names = { basic: 'Kiwi Basic', plus: 'Kiwi Plus', pro: 'Kiwi Pro', ultra: 'Kiwi Ultra', ultimate: 'Kiwi Ultimate' };
      const name = names[plan] || 'Kiwi Ultra';
      document.querySelectorAll('.kiwi-backdrop').forEach((b) => { const c = b.querySelector('.kiwi-modal-close'); if (c) c.click(); });
      const realAcct = !!(window.KiwiEnv?.isReal?.() || window.KiwiVenue?.isCustom?.());
      if (!realAcct) {
        toast(tr({ fr: 'Démo : aucune demande envoyée', en: 'Demo: no request sent', ar: 'عرض تجريبي: لم يُرسل أي طلب' }), { type: 'info', force: true });
        return;
      }
      let merchant = '', email = '';
      try { merchant = window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) {}
      try { email = String(window.KiwiMe?.email || localStorage.getItem('kiwiAccountKey') || '').trim(); } catch (_) {}
      const fallback = () => toast(tr({ fr: 'Demande non envoyée', en: 'Request not sent', ar: 'لم يُرسل الطلب' }), {
        type: 'warning', force: true,
        desc: tr({ fr: `Écrivez-nous depuis le Centre d’aide en précisant « ${name} ».`, en: `Write to us from the Help centre and mention « ${name} ».`, ar: `راسلنا من مركز المساعدة واذكر « ${name} ».` }),
      });
      if (!merchant || !/^\S+@\S+\.\S+$/.test(email)) { fallback(); return; }
      fetch('/api/support/tickets', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant, channel: 'email', contact: email,
          summary: `Demande de changement de formule : ${name}. Demande faite depuis le tableau de bord, à confirmer avec le commerçant avant toute facturation.`,
          client: { page: 'dashboard/upgrade', language: kiwiLang(), online: navigator.onLine },
        }),
      }).then((r) => r.json().then((j) => ({ ok: r.ok && j && j.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) { fallback(); return; }
          toast(tr({ fr: `Demande ${name} enregistrée · ${j.ticket.reference}`, en: `${name} request recorded · ${j.ticket.reference}`, ar: `تم تسجيل طلب ${name} · ${j.ticket.reference}` }), {
            type: 'success', force: true,
            desc: tr({ fr: `L’équipe Kiwi vous répond à ${email}. Rien ne change ni n’est facturé avant votre accord.`, en: `The Kiwi team will reply to ${email}. Nothing changes or is billed before you agree.`, ar: `سيرد فريق Kiwi على ${email}. لا شيء يتغير أو يُفوتر قبل موافقتك.` }),
          });
        }).catch(fallback);
    },

    'add-integration': () => drawer({
      title: 'Ajouter une intégration',
      subtitle: 'Connectez vos outils favoris',
      body: `
        <input class="kf-input" placeholder="Rechercher une intégration…" style="margin-bottom:16px;" />
        ${['Careem','inDrive','Toptal','Yassir','Fenix','Wafacash','Inwi Money','Orange Money','Odoo','QuickBooks','Bank of Africa','CIH','Attijariwafa Bank'].map(n => `
          <div class="notif" style="border-radius:10px; padding:12px; cursor:pointer;">
            <div class="n-ico" style="font-weight:700; color:var(--atlas); background:var(--paper-soft);">${n.charAt(0)}</div>
            <div class="n-body"><div class="n-title">${n}</div><div class="n-desc">Connexion en un clic via API officielle</div></div>
          </div>
        `).join('')}
      `
    }),

    'location-switch': (el) => menu(el, [
      { head: 'EMPLACEMENTS' },
      // A real / custom-venue merchant sees only their OWN establishment, never the
      // three demo "Café Atlas" locations.
      ...(((window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()))
        ? [{ label: (() => { const vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); return (vd && (vd.fullDisplay || vd.name)) || (window.KiwiMe && window.KiwiMe.business) || 'Mon établissement'; })(), active: true, icon: '<div style="width:18px; height:18px; background:var(--atlas); border-radius:5px;"></div>' }]
        : [
          { label: 'Café Atlas · Maarif', active: true, icon: '<div style="width:18px; height:18px; background:var(--atlas); border-radius:5px;"></div>' },
          { label: 'Café Atlas · Agdal (Rabat)', icon: '<div style="width:18px; height:18px; background:var(--riad); border-radius:5px;"></div>' },
          { label: 'Café Atlas · Marrakech', icon: '<div style="width:18px; height:18px; background:#D99A2B; border-radius:5px;"></div>' },
        ]),
      { sep: true },
      { label: tr({fr:'+ Ajouter un emplacement', en:'+ Add a location', ar:'+ إضافة موقع'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>', onClick: () => toast(tr({fr:'Assistant de nouvel emplacement', en:'New location wizard', ar:'معالج الموقع الجديد'}), {type:'info'}) },
      { label: 'Paramètres multi-boutiques', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', onClick: () => handlers.settings() },
    ]),

    'profile-menu': (el) => menu(el, [
      { head: ((window.KiwiMe && window.KiwiMe.name) || (window.KiwiEnv?.isReal?.()
        || (window.Capacitor?.isNativePlatform?.() && !window.KiwiIdentity?.state) ? '' : 'Rachid Benhima')).toUpperCase() },
      { label: tr({fr:'Mon profil', en:'My profile', ar:'ملفي الشخصي'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/></svg>', onClick: () => handlers['account-profile'] && handlers['account-profile']() },
      { label: tr({fr:'Paramètres', en:'Settings', ar:'الإعدادات'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', onClick: () => handlers.settings && handlers.settings() },
      { label: tr({fr:document.documentElement.classList.contains('kiwi-native') ? 'Mon Kiwi' : 'My Kiwi', en:'My Kiwi', ar:'Kiwi الخاص بي'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>', onClick: () => handlers['account-billing'] && handlers['account-billing']() },
      { sep: true },
      { label: tr({fr:'Centre d\'aide', en:'Help centre', ar:'مركز المساعدة'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>', onClick: () => handlers['account-help'] && handlers['account-help']() },
      { label: tr({fr:'Se déconnecter', en:'Sign out', ar:'تسجيل الخروج'}), danger: true, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>', onClick: () => { toast(tr({fr:'Déconnexion…', en:'Signing out…', ar:'جارٍ تسجيل الخروج…'}), {type:'info'}); setTimeout(() => location.href = 'index.html', 800); } },
    ]),

    'download-app': () => {
      const m = modal({
        title: 'Télécharger Kiwi Wallet',
        desc: 'Scannez le QR ou recevez le lien par SMS.',
        width: 440,
        body: `
          <div style="display:flex; gap:20px; align-items:center; margin:14px 0 18px;">
            <div style="width:140px; height:140px; border-radius:14px; background:#0A0F0D; padding:10px; flex-shrink:0;">
              <div style="background:#F7F5F0; width:100%; height:100%; border-radius:6px; background-image: repeating-linear-gradient(0deg, #0A0F0D 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, #0A0F0D 0 6px, transparent 6px 12px);"></div>
            </div>
            <div style="flex:1;">
              <div style="font-weight:600; font-size:16px; letter-spacing:-0.015em;">Scannez avec votre iPhone ou Android.</div>
              <div style="font-size:13px; color:var(--n-500); margin-top:8px; line-height:1.5;">L\'app s\'installe automatiquement. Votre Kiwi Wallet est prêt en 30 secondes.</div>
            </div>
          </div>
          <div style="padding-top:16px; border-top:1px solid var(--n-200);">
            <div class="kf-label">Ou recevez le lien par SMS</div>
            <div style="display:flex; gap:8px;">
              <input class="kf-input" placeholder="+212 6 xx xx xx xx" style="flex:1;" />
              <button data-activation=write class="kb atlas" data-sms>Envoyer</button>
            </div>
          </div>
        `
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-sms]')) { m.close(); toast(tr({fr:'SMS envoyé', en:'SMS sent', ar:'تم إرسال الرسالة'}), {type:'success', desc:tr({fr:'Ouvrez le lien pour installer Kiwi Wallet', en:'Open the link to install Kiwi Wallet', ar:'افتح الرابط لتثبيت Kiwi Wallet'})}); }
      });
    },

    'download-kit': () => {
      toast(tr({fr:'Préparation du kit de marque…', en:'Preparing brand kit…', ar:'جارٍ تجهيز مجموعة الهوية البصرية…'}), {type:'info', duration:1500});
      setTimeout(() => toast(tr({fr:'Kit téléchargé', en:'Kit downloaded', ar:'تم تنزيل المجموعة'}), {type:'success', desc:'Logo · Palette · Typographies · Mockups · 24 Mo'}), 1700);
    },

    'lang-switch': (el) => {
      const cur = el.parentElement.querySelector('.on');
      if (cur) cur.classList.remove('on');
      el.classList.add('on');
      const l = el.textContent.trim();
      toast(`Langue : ${l}`, {type:'info', duration: 1500, desc: l === 'AR' ? 'L\'interface passera en RTL à la prochaine navigation.' : ''});
    },

    'ai-suggest': (el) => {
      const txt = el.textContent.trim().replace('→', '').trim();
      const drawerEl = document.querySelector('.ai-drawer');
      if (!drawerEl) { toast(txt, {type:'info'}); return; }
      // Insert user msg + typing + response
      const msg = drawerEl.querySelector('.msg');
      const user = document.createElement('div');
      user.className = 'ai-msg-user';
      user.textContent = txt;
      msg.insertAdjacentElement('afterend', user);
      const typing = document.createElement('div');
      typing.className = 'ai-msg-typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      user.insertAdjacentElement('afterend', typing);
      setTimeout(() => {
        typing.classList.remove('ai-msg-typing');
        typing.className = 'msg';
        typing.innerHTML = aiResponses[txt] || `<b>${(CP_STR[kiwiLang()] || CP_STR.fr).sAi} :</b> ${txt}, ${(CP_STR[kiwiLang()] || CP_STR.fr).executed}. Consultez les détails dans l\'onglet correspondant.`;
      }, 1200);
    },

    'contact': () => modal({
      tag: 'CONTACT',
      title: 'Parler à un conseiller Kiwi',
      desc: 'Notre équipe répond en moins de 15 minutes ouvrées.',
      width: 460,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" /></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" /></div>
        </div>
        <div class="kf-group"><label class="kf-label">Email</label><input class="kf-input" /></div>
        <div class="kf-group"><label class="kf-label">Téléphone marocain</label><input class="kf-input" placeholder="+212" /></div>
        <div class="kf-group"><label class="kf-label">Type de commerce</label>
          <select class="kf-input">
            <option>Restaurant / café</option><option>Commerce de détail</option><option>Services</option><option>Autre</option>
          </select>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-contact-go>Être rappelé →</button>
      `
    }),

    'download-deck': () => {
      toast(tr({fr:'Téléchargement du deck…', en:'Downloading pitch deck…', ar:'جارٍ تنزيل العرض التقديمي…'}), {type:'info', duration: 1400});
      setTimeout(() => toast(tr({fr:'Deck PDF envoyé', en:'PDF deck sent', ar:'تم إرسال ملف العرض'}), {type:'success', desc:tr({fr:'NDA inclus · valable 48 h', en:'NDA included · valid 48 h', ar:'يشمل اتفاقية عدم الإفصاح · صالح 48 ساعة'})}), 1600);
    },

    'kpi-detail': (el, arg) => {
      /* Les tiroirs « rédigés » de kpiData sont écrits À LA MAIN sur les
       * chiffres du Café Atlas : 71,4 % de marge, « Boissons chaudes 82 % »,
       * « Jus pressés 61 % », 99,32 % de taux de succès. Sans cette porte, un
       * commerçant de Tanger qui cliquait sur SA tuile « Marge brute » se voyait
       * présenter la structure de coûts d'un café de démonstration comme si
       * c'était la sienne — et « marge » est une tuile par défaut en
       * restauration, en spa et en mode fusion, donc le clic était à un doigt.
       *
       * Le tiroir générique juste en dessous, lui, LIT la tuile cliquée : il
       * rend la vraie valeur, le vrai delta, et une explication de lecture qui
       * ne dépend d'aucun chiffre. C'est le bon repli, et il existait déjà. */
      const real = (() => {
        try {
          if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
          if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
        } catch (_) {}
        return false;
      })();
      const authored = real ? null : kpiData[arg];
      if (authored) {
        drawer({ title: authored.title, subtitle: authored.subtitle, width: 540, body: authored.body, foot: authored.foot });
        return;
      }
      // Generic detail view for personalised / derived KPIs — reads the
      // clicked tile\'s live value + delta so it\'s never an empty drawer.
      const label = el?.querySelector('.l span, .l, .lbl')?.textContent?.trim() || 'Indicateur';
      const value = el?.querySelector('.v')?.textContent?.trim() || '·';
      const delta = el?.querySelector('.d')?.textContent?.trim() || '';
      const desc = KPI_DESC[arg] || (CP_STR[kiwiLang()] || CP_STR.fr).kpiDefaultDesc;
      const long = KPI_LONG[arg] || (CP_STR[kiwiLang()] || CP_STR.fr).kpiDefaultLong;
      drawer({
        title: label,
        subtitle: (CP_STR[kiwiLang()] || CP_STR.fr).kpiSubtitle,
        width: 460,
        body: `
          ${kpiHero(value, desc, delta)}
          ${kpiSection((CP_STR[kiwiLang()] || CP_STR.fr).kpiHowToRead, `<div style="font-size:13px; color:var(--n-600); line-height:1.62;">${long}</div>`)}
          ${kpiInsight((CP_STR[kiwiLang()] || CP_STR.fr).kpiInsight)}
        `,
        foot: `<button class="kb ghost" data-dismiss style="flex:1; justify-content:center;">${(CP_STR[kiwiLang()] || CP_STR.fr).close}</button><button class="kb atlas" data-action="open-assistant" style="flex:1; justify-content:center;">${(CP_STR[kiwiLang()] || CP_STR.fr).analyzeWithKiwiAI} →</button>`,
      });
    },

    'open-assistant': (el, arg) => {
      const q = typeof arg === 'string' ? arg : (el && el.dataset ? el.dataset.prefill : null);
      if (window.KiwiAgent && typeof window.KiwiAgent.open === 'function') {
        window.KiwiAgent.open(q);
        return;
      }
      if (window.__kiwiAgentOpen && typeof window.__kiwiAgentOpen === 'function') {
        window.__kiwiAgentOpen(q);
        return;
      }
      const checkAgent = (tries) => {
        if (window.KiwiAgent && typeof window.KiwiAgent.open === 'function') {
          window.KiwiAgent.open(q);
        } else if (window.__kiwiAgentOpen && typeof window.__kiwiAgentOpen === 'function') {
          window.__kiwiAgentOpen(q);
        } else if (tries > 0) {
          setTimeout(() => checkAgent(tries - 1), 50);
        }
      };
      checkAgent(20);
    },

    'filter-tx': () => drawer({
      title: 'Filtrer les transactions',
      subtitle: 'Affinez la liste',
      body: `
        <div class="kf-group">
          <label class="kf-label">Période</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input class="kf-input" value="24/04/2026" /><input class="kf-input" value="24/04/2026" />
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Méthode</label>
          ${['Visa','Mastercard','Kiwi Tap','QR','Espèces'].map(m => `<label style="display:flex; gap:8px; padding:6px 0;"><input type="checkbox" checked /> ${m}</label>`).join('')}
        </div>
        <div class="kf-group">
          <label class="kf-label">Statut</label>
          ${['Réglé','En attente','Remboursé','Contesté'].map(m => `<label style="display:flex; gap:8px; padding:6px 0;"><input type="checkbox" checked /> ${m}</label>`).join('')}
        </div>
        <div class="kf-group">
          <label class="kf-label">Montant</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input class="kf-input" placeholder="Min 0 MAD" /><input class="kf-input" placeholder="Max illimité" />
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" style="flex:1; justify-content:center;" data-dismiss>Réinitialiser</button><button class="kb atlas" style="flex:1; justify-content:center;" data-filter-apply>Appliquer</button>`
    }),

    'scroll-to': (el, arg) => {
      const t = document.getElementById(arg) || document.querySelector(arg);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

  };

/* <</split:handlers>> */
    return handlers;
  };
})();

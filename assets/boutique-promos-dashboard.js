/* Kiwi · Boutique promotions manager · owner dashboard only.
 * The price engine stays in assets/promos.js and is read by the caisse. This
 * file owns the create/edit/pause/delete UI that used to live in the till. */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;

  var K = window.Kiwi;
  var H = K.handlers;
  var DAY = 86400000;
  var filter = 'active';
  var subscribed = false;
  var promoModal = null;
  var composer = { draft: null, editing: null };

  var lang = function () { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  function L(fr, en, ar) { var l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; }
  /* Arabic number agreement: 1 and 2 have their own forms, 3-10 take the plural,
     11+ the singular accusative. a = [one, dual, few, many]; fullOne replaces the
     bare word when the count is 1 (« صنف واحد »). */
  function arW(n, a) { n = Math.abs(n); return n === 1 ? a[0] : n === 2 ? a[1] : (n === 0 || (n % 100 >= 3 && n % 100 <= 10)) ? a[2] : a[3]; }
  function arN(n, a, fullOne) { var w = arW(n, a); return n === 1 ? (fullOne || w) : n === 2 ? w : n + ' ' + w; }
  var ITEM = ['صنف', 'صنفان', 'أصناف', 'صنفًا'];
  var DAYW = ['يوم', 'يومان', 'أيام', 'يومًا'];
  var nItems = function (n) { return L(n + ' article' + (n > 1 ? 's' : ''), n + ' item' + (n === 1 ? '' : 's'), arN(n, ITEM, 'صنف واحد')); };
  var pct = function (v) { return L('−' + v + ' %', '−' + v + '%', '−' + v + '%'); };
  var loc = function () { return L('fr-FR', 'en-GB', 'ar-u-nu-latn'); };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var money = function (n) { return new Intl.NumberFormat(loc(), { maximumFractionDigits: 0 }).format(Math.round(+n || 0)) + ' MAD'; };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtDay = function (d) { return new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', year: 'numeric' }).format(d); };
  var fmtHM = function (d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  var startOfDay = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  var endOfDay = function (d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };
  var toInput = function (ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  var icons = function () { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} };

  function CAT() { return window.KiwiBoutiqueCatalog; }
  function PRM() { return window.KiwiPromos; }
  /* Only the boutique and maison tills read KiwiPromos at checkout. The page is
   * also offered to épicerie, pharmacie, librairie, fleuriste and autre, where
   * « Synchronisé avec la caisse » and « la caisse est à jour » were false. */
  function tillApplies() {
    /* Le MÉTIER (sous-type), pas le type de base : getVenueType() renvoie
     * « boutique » pour l'épicerie aussi, dont la caisse ne lit pas les promotions. */
    var t = '';
    try { t = String((window.KiwiStoreTemplates && window.KiwiStoreTemplates.currentTrade && window.KiwiStoreTemplates.currentTrade()) || ''); } catch (_) {}
    t = t.toLowerCase();
    return !t || t === 'boutique' || t === 'maison';
  }
  function venueKey() { return window.KiwiBoutiqueVenueKey ? window.KiwiBoutiqueVenueKey() : 'maisonMansour'; }
  function ready() { return !!(CAT() && PRM()); }

  function context() {
    var cat = CAT();
    var key = venueKey();
    cat.use(key);
    PRM().use(key);
    try {
      if (window.KiwiCloudDoc) PRM().cloud(function () { return window.KiwiCloudDoc.slugFor(key); });
    } catch (_) {}
    var c = cat.compat();
    return { cat: cat, key: key, rayons: c.RAYONS || [], products: c.P || {}, byEan: c.BY_EAN || {} };
  }

  function items(ctx) {
    return Object.keys(ctx.products).filter(function (id) { return ctx.products[id] && ctx.products[id].id === id; }).map(function (id) { return ctx.products[id]; });
  }
  function stockOf(it) { return PRM().stockOf(it); }
  function preview(ctx, p) { return PRM().preview(p, items(ctx), { stockOf: stockOf }); }

  function injectCss() {
    if (document.getElementById('bpd-css')) return;
    var s = document.createElement('style');
    s.id = 'bpd-css';
    s.textContent = `
      .bpd-page{--bpd-warn:#8A6210;--bpd-warn-bg:rgba(217,154,43,.16);padding-bottom:42px}
      .bpd-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .bpd-head h2{margin:0;font-size:25px}.bpd-sub{font-size:12.5px;color:var(--n-500);margin-top:4px}
      .bpd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
      .bpd-btn svg{width:15px;height:15px}.bpd-btn.primary{background:var(--atlas);border-color:var(--atlas);color:#fff}.bpd-btn.danger{color:#9B2F22}.bpd-btn:disabled{opacity:.4;cursor:default}
      .bpd-seg{display:flex;width:max-content;max-width:100%;gap:3px;padding:4px;border-radius:13px;background:var(--paper-soft);margin-bottom:17px}
      .bpd-seg button{display:flex;align-items:center;gap:7px;padding:8px 13px;border:0;border-radius:10px;background:transparent;color:var(--n-600);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}.bpd-seg button.on{background:var(--atlas);color:#fff}.bpd-seg small{font-family:var(--mono);opacity:.75}
      .bpd-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
      .bpd-card{display:flex;overflow:hidden;background:var(--paper);border:1px solid var(--line);border-radius:17px}.bpd-card.active{border-color:rgba(11,110,79,.35)}.bpd-card.ended{opacity:.62}
      .bpd-ribbon{flex:0 0 88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:16px 6px;background:var(--riad);color:#fff}.bpd-card.active .bpd-ribbon{background:var(--atlas)}
      .bpd-ribbon b{font-family:var(--mono);font-size:19px;line-height:1}.bpd-ribbon span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.72;text-align:center}
      .bpd-body{flex:1;min-width:0;padding:14px 15px;display:flex;flex-direction:column;gap:9px}.bpd-top{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.bpd-top h3{margin:0;min-width:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bpd-state{flex:none;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--n-500);background:var(--paper-soft)}.bpd-state.active{color:var(--atlas);background:rgba(11,110,79,.08);border-color:rgba(11,110,79,.24)}.bpd-state.soon{color:#8A6210;background:rgba(217,154,43,.13);border-color:rgba(217,154,43,.3)}
      .bpd-meta{display:flex;flex-direction:column;gap:4px}.bpd-meta span{display:flex;align-items:center;gap:6px;color:var(--n-500);font-size:12px;line-height:1.35}.bpd-meta svg{width:13px;height:13px;flex:none}
      .bpd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:9px;border-top:1px solid var(--line)}.bpd-count{font-family:var(--mono);font-size:11.5px;color:var(--n-500)}.bpd-actions{display:flex;gap:5px}.bpd-icon{width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);cursor:pointer}.bpd-icon svg{width:14px;height:14px}.bpd-icon.danger{color:#9B2F22}
      .bpd-empty{max-width:980px;margin:28px auto 0;text-align:center}.bpd-empty>svg{width:31px;height:31px;color:var(--atlas)}.bpd-empty h2{font-size:24px;margin:12px 0 7px}.bpd-empty p{max-width:510px;margin:0 auto;color:var(--n-500);font-size:13.5px;line-height:1.55}
      .bpd-modal{width:min(920px,88vw)}.bpd-compose{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}.bpd-form{display:flex;flex-direction:column;gap:15px}.bpd-field label{display:block;margin-bottom:6px;font-family:var(--mono);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--n-500)}.bpd-field label span{text-transform:none;letter-spacing:0;font-weight:400}.bpd-input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px;outline:none}.bpd-input:focus{border-color:var(--atlas)}
      .bpd-kinds,.bpd-scopes{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bpd-scopes{grid-template-columns:repeat(5,1fr)}.bpd-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font:inherit;font-size:11.5px;font-weight:600;color:var(--n-600);cursor:pointer;text-align:center}.bpd-choice small{font-family:var(--mono);font-size:11px;font-weight:400}.bpd-choice svg{width:17px;height:17px}.bpd-choice.on{background:var(--atlas);border-color:var(--atlas);color:#fff}
      .bpd-value{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}.bpd-value input{width:92px;font-family:var(--mono);font-size:17px;font-weight:700}.bpd-unit{font-family:var(--mono);font-size:13px;color:var(--n-500)}.bpd-chips{display:flex;gap:6px;flex-wrap:wrap}.bpd-chip{display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--paper);font:inherit;font-size:11.5px;color:var(--n-600);cursor:pointer}.bpd-chip.on{border-color:rgba(11,110,79,.35);background:rgba(11,110,79,.08);color:var(--atlas);font-weight:600}.bpd-chip svg{width:11px;height:11px}
      .bpd-scopebody{display:flex;flex-direction:column;gap:8px;margin-top:9px}.bpd-hint{font-size:11.5px;line-height:1.45;color:var(--n-500)}.bpd-search{display:flex;align-items:center;gap:9px;border:1.5px solid var(--atlas);border-radius:11px;padding:9px 11px}.bpd-search svg{width:17px;color:var(--atlas)}.bpd-search input{flex:1;min-width:0;border:0;background:transparent;outline:0;font:inherit}.bpd-hits{display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto}.bpd-hit{display:flex;justify-content:space-between;gap:10px;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:var(--paper);font:inherit;font-size:12px;cursor:pointer}.bpd-hit b{font-family:var(--mono);color:var(--n-500)}
      .bpd-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.bpd-preview{position:sticky;top:0;padding:15px;border:1px solid var(--line);border-radius:15px;background:var(--paper-soft)}.bpd-preview-head span{display:block;font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--n-500)}.bpd-preview-head b{display:inline-block;margin-top:4px;font:700 27px var(--mono)}.bpd-preview-head em{font-style:normal;font-size:12px;color:var(--n-500);margin-left:5px}.bpd-swap{display:flex;align-items:center;gap:8px;margin-top:12px}.bpd-swap>div{flex:1}.bpd-swap span{display:block;font-size:11px;text-transform:uppercase;color:var(--n-500)}.bpd-swap b{font:700 13px var(--mono)}.bpd-swap .next b{color:var(--atlas)}.bpd-swap svg{width:13px;color:var(--n-500)}.bpd-give{margin-top:9px;font-size:12px}.bpd-give b{font-family:var(--mono)}
      .bpd-warn{display:flex;gap:7px;margin-top:10px;padding:9px 10px;border:1px solid rgba(217,154,43,.35);border-radius:10px;background:rgba(217,154,43,.14);color:#8A6210;font-size:11.5px;line-height:1.4}.bpd-warn svg{width:14px;flex:none}.bpd-sample{display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line)}.bpd-srow{display:flex;justify-content:space-between;gap:8px;font-size:11.5px}.bpd-srow .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bpd-srow .prices{flex:none;font-family:var(--mono)}.bpd-srow s{color:var(--n-500);margin-right:4px}.bpd-srow b{color:var(--atlas)}.bpd-none{padding:24px 6px;text-align:center;color:var(--n-500);font-size:12px}
      .bpd-compose-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}.bpd-problem{font-size:11.5px;color:var(--n-500)}.bpd-compose-actions{display:flex;gap:8px;margin-left:auto}
      .bpd-print-summary{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-soft)}.bpd-print-summary b{font:700 27px var(--mono)}.bpd-print-summary span{font-size:12px;color:var(--n-500)}

      /* Promotions v2 · compact Kiwi command centre */
      .bpd-page{max-width:1240px;margin:0 auto;padding-bottom:58px}
      .bpd-btn{min-height:44px;padding:0 17px;border-color:var(--n-300);border-radius:13px;background:var(--surface);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.bpd-btn:hover:not(:disabled){transform:translateY(-1px);border-color:var(--n-500);box-shadow:0 8px 20px -14px rgba(10,15,13,.45)}.bpd-btn:focus-visible,.bpd-choice:focus-visible,.bpd-chip:focus-visible,.bpd-starter:focus-visible,.bpd-icon:focus-visible{outline:3px solid var(--mint);outline-offset:2px}.bpd-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--inverse-ink)}
      .bpd-onboard{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(330px,.88fr);gap:30px;align-items:center;min-height:280px;padding:34px!important;border:1px solid var(--inverse-line);border-radius:26px;background:var(--inverse-surface);color:var(--inverse-ink);box-shadow:0 30px 60px -42px rgba(5,59,44,.58);overflow:hidden;position:relative}.bpd-onboard:after{content:"";position:absolute;width:360px;height:360px;right:-190px;top:-220px;border-radius:50%;background:rgba(125,242,176,.10);pointer-events:none}.bpd-onboard-copy{position:relative;z-index:1;max-width:620px}.bpd-eyebrow{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--atlas)}.bpd-onboard .bpd-eyebrow{color:#7DF2B0}.bpd-eyebrow svg{width:15px;height:15px}.bpd-onboard h2{margin:13px 0 11px;font-size:clamp(30px,3.3vw,45px);font-weight:650;line-height:.98;letter-spacing:-.052em;color:#F7F5F0}.bpd-onboard p{max-width:600px;margin:0;color:rgba(247,245,240,.72);font-size:14px;line-height:1.55}.bpd-main-cta{margin-top:21px!important;background:#7DF2B0!important;border-color:#7DF2B0!important;color:#053B2C!important;box-shadow:0 14px 34px -18px rgba(125,242,176,.7)}
      .bpd-automation{position:relative;z-index:1;display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid rgba(247,245,240,.16);border-radius:20px;background:rgba(247,245,240,.055)}.bpd-automation>div{display:grid;grid-template-columns:34px 1fr 22px;gap:9px;align-items:center;min-height:50px;padding:7px 9px;border-radius:14px}.bpd-automation>div+div{border-top:1px solid rgba(247,245,240,.13);border-radius:0;padding-top:12px}.bpd-automation>div>svg:first-child{width:19px;height:19px;color:#7DF2B0}.bpd-automation>div>svg:last-child{width:15px;height:15px;color:#7DF2B0}.bpd-automation span{display:flex;flex-direction:column;gap:2px}.bpd-automation b{font-size:12.5px;color:#F7F5F0}.bpd-automation small{font-size:11px;color:rgba(247,245,240,.65)}
      .bpd-template-block{margin-top:25px;padding:0!important}.bpd-section-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:15px;padding:0 3px}.bpd-section-head h3{margin:7px 0 0;font-size:22px;letter-spacing:-.03em}.bpd-section-head p{max-width:390px;margin:0;color:var(--n-500);font-size:12.5px;line-height:1.5;text-align:right}.bpd-starters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin-top:0;text-align:left}.bpd-starter{display:grid;grid-template-columns:43px minmax(0,1fr) auto 18px;gap:13px;align-items:center;min-height:112px;padding:18px;border:1px solid var(--n-200);border-radius:18px;background:var(--surface);box-shadow:0 14px 30px -26px rgba(10,15,13,.55);transform:none;cursor:pointer;font:inherit;text-align:left;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.bpd-starter:hover{transform:translateY(-2px);border-color:var(--atlas);background:var(--surface);box-shadow:0 20px 36px -25px rgba(5,59,44,.48)}.bpd-starter:active{transform:translateY(0);box-shadow:0 4px 10px rgba(5,59,44,.12)}.bpd-starter:focus-visible{outline:3px solid var(--mint);outline-offset:3px}.bpd-starter-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--paper-soft);color:var(--atlas)}.bpd-starter-icon svg{width:20px;height:20px}.bpd-starter-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.bpd-starter-copy small{font:700 9px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--atlas)}.bpd-starter-copy b{font-size:14px;line-height:1.3;color:var(--ink)}.bpd-starter-copy>span{font-size:11.5px;line-height:1.4;color:var(--n-500)}.bpd-starter strong{font:700 16px var(--mono);color:var(--atlas);white-space:nowrap}.bpd-starter .bpd-starter-arrow{position:static;width:16px;height:16px;padding:0;border-radius:0;background:transparent;color:var(--n-500);transform:none}.bpd-starter:hover .bpd-starter-arrow{color:var(--atlas)}
      .bpd-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;padding:14px 16px;border:1px solid var(--n-200);border-radius:17px;background:var(--surface)}.bpd-sync{display:flex;flex-direction:column;gap:3px}.bpd-sync span{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--ink)}.bpd-sync span svg{width:14px;height:14px;color:var(--atlas)}.bpd-sync small{color:var(--n-500);font-size:11.5px}.bpd-seg{margin-bottom:16px;border:1px solid var(--n-200);background:var(--paper-soft);border-radius:14px}.bpd-seg button{min-height:38px;border-radius:10px}.bpd-seg small{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:rgba(127,127,127,.12)}
      .bpd-list{grid-template-columns:repeat(auto-fill,minmax(390px,1fr));gap:12px}.bpd-card{display:grid;grid-template-columns:92px minmax(0,1fr);min-height:190px;border-color:var(--n-200);background:var(--surface);box-shadow:0 18px 35px -30px rgba(10,15,13,.55);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.bpd-card:hover{transform:translateY(-2px);border-color:var(--n-300);box-shadow:0 24px 42px -28px rgba(5,59,44,.45)}.bpd-card.active{border-color:rgba(11,110,79,.35)}.bpd-ribbon,.bpd-card.active .bpd-ribbon{flex:none;display:flex;align-items:center;justify-content:center;gap:7px;padding:17px 10px;background:var(--paper-soft);color:var(--atlas);border-right:1px solid var(--n-200)}.bpd-ribbon span{order:2;font:700 9px var(--mono);letter-spacing:.1em}.bpd-ribbon b{order:1;font-size:20px;color:var(--ink)}.bpd-body{padding:17px 18px;gap:12px}.bpd-top>div{display:flex;flex-direction:column;align-items:flex-start;gap:7px}.bpd-top h3{white-space:normal;font-size:17px;line-height:1.25}.bpd-state{order:-1}.bpd-meta span{font-size:11.8px}.bpd-foot{padding-top:11px}.bpd-icon{width:34px;height:34px;background:var(--surface)}
      .bpd-section-empty{max-width:none;margin:24px 0;padding:54px 24px;border:1px dashed var(--n-300);border-radius:20px;background:var(--paper-soft)}.bpd-empty-icon{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:15px;background:var(--surface);color:var(--atlas);box-shadow:0 10px 22px -16px rgba(5,59,44,.5)}.bpd-empty-icon svg{width:22px;height:22px}.bpd-section-empty h2{font-size:21px}.bpd-section-empty .bpd-btn{margin-top:18px}
      .kiwi-modal:has([data-bpd-host]){height:min(760px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden}.kiwi-modal:has([data-bpd-host]) .kiwi-modal-body{flex:1;min-height:0}.kiwi-modal:has([data-bpd-host]) [data-bpd-shell]{height:100%}.bpd-modal{display:flex;flex-direction:column;width:min(1040px,91vw);height:100%}.bpd-compose{flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 310px;gap:16px;overflow:hidden;align-items:stretch}.bpd-form{min-height:0;gap:10px;overflow-y:auto;padding-right:6px;scrollbar-width:thin;scrollbar-color:var(--n-300) transparent}.bpd-step{flex:none;overflow:hidden;padding:0!important;border:1px solid var(--n-200);border-radius:17px;background:var(--surface)}.bpd-step>header{display:flex;align-items:center;gap:11px;padding:13px 15px;border-bottom:1px solid var(--n-200);background:var(--paper-soft)}.bpd-step>header>span{display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:var(--atlas);color:var(--inverse-ink);font:700 11px var(--mono)}.bpd-step>header>div{display:flex;flex-direction:column;gap:2px}.bpd-step>header b{font-size:13px;color:var(--ink)}.bpd-step>header small{font-size:11px;color:var(--n-500)}.bpd-step-body{padding:14px 15px}.bpd-field+.bpd-field{margin-top:13px}.bpd-field label{margin-bottom:7px}.bpd-input{min-height:43px;padding:10px 12px;border-color:var(--n-300);border-radius:11px;background:var(--paper-soft)}.bpd-input:focus{border-color:var(--atlas);box-shadow:0 0 0 3px rgba(11,110,79,.10)}.bpd-kinds{gap:6px}.bpd-choice{min-height:53px;border-color:var(--n-200);border-radius:12px;background:var(--paper-soft)}.bpd-choice b{font-size:11.5px}.bpd-choice.on{box-shadow:0 7px 16px -12px rgba(5,59,44,.6)}.bpd-value{display:grid;grid-template-columns:126px 1fr;gap:9px}.bpd-value-box{position:relative;display:block}.bpd-value-box input{width:100%;padding-right:43px}.bpd-value-box .bpd-unit{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none}.bpd-value>.bpd-chips{align-content:center}.bpd-scopes{gap:6px}.bpd-scopes .bpd-choice{min-height:67px;padding:8px 4px}.bpd-chip{min-height:34px;background:var(--paper-soft)}.bpd-search{background:var(--paper-soft)}.bpd-dates{gap:8px}
      .bpd-preview{top:0;height:fit-content;overflow:hidden;padding:18px;border-color:rgba(247,245,240,.16);border-radius:18px;background:var(--inverse-surface);color:var(--inverse-ink);box-shadow:0 24px 44px -34px rgba(5,59,44,.65)}.bpd-preview-live{display:flex;align-items:center;gap:6px;margin-bottom:24px;font:700 9px var(--mono);letter-spacing:.11em;text-transform:uppercase;color:#7DF2B0}.bpd-preview-live i{width:7px;height:7px;border-radius:50%;background:#7DF2B0;box-shadow:0 0 0 4px rgba(125,242,176,.12)}.bpd-preview-head span,.bpd-swap span{color:rgba(247,245,240,.63)}.bpd-preview-head b{font-size:38px;color:#F7F5F0}.bpd-preview-head em{color:rgba(247,245,240,.63)}.bpd-swap{margin-top:18px;padding:14px 0;border-top:1px solid rgba(247,245,240,.14);border-bottom:1px solid rgba(247,245,240,.14)}.bpd-swap b{color:#F7F5F0}.bpd-swap .next b{color:#7DF2B0}.bpd-swap svg{color:rgba(247,245,240,.58)}.bpd-give{color:rgba(247,245,240,.63)}.bpd-give b{color:#F7F5F0}.bpd-sample{border-top-color:rgba(247,245,240,.14)}.bpd-srow{color:rgba(247,245,240,.68)}.bpd-srow s{color:rgba(247,245,240,.62)}.bpd-srow b{color:#7DF2B0}.bpd-none{color:rgba(247,245,240,.63)}.bpd-compose-foot{margin:14px -2px -2px;padding:13px 2px 2px;border-top:1px solid var(--n-200);background:var(--surface)}.bpd-problem{display:flex;align-items:center;gap:6px}.bpd-problem svg{width:14px;height:14px;flex:none}.bpd-compose-actions .bpd-btn{min-width:112px}
      @media(max-width:900px){.kiwi-modal:has([data-bpd-host]){height:auto;max-height:calc(100vh - 40px);overflow-y:auto}.kiwi-modal:has([data-bpd-host]) .kiwi-modal-body,.kiwi-modal:has([data-bpd-host]) [data-bpd-shell]{height:auto}.bpd-modal{height:auto}.bpd-onboard{grid-template-columns:1fr;padding:30px!important}.bpd-compose{grid-template-columns:1fr;overflow:visible}.bpd-form{overflow:visible;padding-right:0}.bpd-preview{position:static;order:-1}.bpd-scopes{grid-template-columns:repeat(2,1fr)}.bpd-starters{grid-template-columns:1fr}.bpd-starter{min-height:96px}.bpd-section-head{align-items:flex-start;flex-direction:column;gap:8px}.bpd-section-head p{text-align:left}.bpd-list{grid-template-columns:1fr}}
      @media(max-width:620px){.bpd-onboard{padding:25px 20px;border-radius:21px}.bpd-onboard h2{font-size:34px}.bpd-toolbar{align-items:stretch;flex-direction:column}.bpd-toolbar .bpd-btn{width:100%}.bpd-seg{width:100%;overflow-x:auto}.bpd-seg button{white-space:nowrap}.bpd-card{grid-template-columns:74px minmax(0,1fr)}.bpd-ribbon b{font-size:17px}.bpd-kinds{grid-template-columns:1fr}.bpd-value{grid-template-columns:1fr}.bpd-scopes{grid-template-columns:1fr 1fr}.bpd-dates{grid-template-columns:1fr}.bpd-modal{width:100%;min-width:0}.kiwi-modal:has([data-bpd-host]) .kiwi-modal-body{padding-bottom:0}.bpd-compose-foot{align-items:stretch;flex-direction:column;position:sticky;bottom:0;z-index:3;background:var(--paper);margin-bottom:0;padding-bottom:16px;box-shadow:0 -10px 18px -14px rgba(10,15,13,.35)}.bpd-compose-actions{width:100%;margin-left:0}.bpd-compose-actions .bpd-btn{flex:1}.bpd-starter{grid-template-columns:40px minmax(0,1fr) auto}.bpd-starter .bpd-starter-arrow{display:none}}
      html[data-theme="dark"] .bpd-card,
      html[data-theme="dark"] .bpd-starter,
      html[data-theme="dark"] .bpd-toolbar,
      html[data-theme="dark"] .bpd-step,
      html[data-theme="dark"] .bpd-btn:not(.primary) { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.08); }
      html[data-theme="dark"] .bpd-input,
      html[data-theme="dark"] .bpd-choice:not(.on),
      html[data-theme="dark"] .bpd-chip:not(.on),
      html[data-theme="dark"] .bpd-search { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.12); color:#fff; }
      html[data-theme="dark"] .bpd-starter-icon { background:rgba(125,242,176,0.12); color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter-copy small { color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter-copy b { color:#F7F5F0; }
      html[data-theme="dark"] .bpd-starter-copy > span { color:rgba(247,245,240,0.68); }
      html[data-theme="dark"] .bpd-starter strong { color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter .bpd-starter-arrow { color:rgba(247,245,240,0.45); }
      html[data-theme="dark"] .bpd-starter:hover .bpd-starter-arrow { color:#7DF2B0; }

      /* Promotions v3 · même grammaire que l'inventaire : pleine largeur,
         chiffres en tête, lignes fines. Aucun bloc ne bouge au survol. */
      .bpd-page{max-width:none;margin:0}
      .bpd-btn:hover:not(:disabled),.bpd-starter:hover,.bpd-card:hover{transform:none}
      .bpd-kpis .kx-kpi .l{text-transform:none;letter-spacing:0;font-family:var(--sans);font-size:12.5px;font-weight:500}
      .bpd-intro{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,400px);gap:20px 36px;align-items:center;padding:24px 26px;border:1px solid var(--n-200);border-radius:18px;background:var(--surface)}
      .bpd-intro h2{margin:0 0 6px;font-size:20px;font-weight:600;letter-spacing:-.02em;color:var(--ink)}.bpd-intro p{max-width:560px;margin:0;font-size:13.5px;line-height:1.55;color:var(--n-500)}.bpd-intro .bpd-btn{margin-top:16px}
      .bpd-intro-sync{list-style:none;margin:0;padding:4px 0;display:flex;flex-direction:column;border-left:1px solid var(--n-200)}
      .bpd-intro-sync li{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;padding:9px 0 9px 20px}.bpd-intro-sync li svg{width:18px;height:18px;color:var(--atlas)}
      .bpd-intro-sync b{display:block;font-size:13px;font-weight:600;color:var(--ink)}.bpd-intro-sync small{display:block;margin-top:2px;font-size:12px;color:var(--n-500)}
      .bpd-template-block{margin-top:22px}.bpd-section-head{align-items:flex-end;margin-bottom:12px}.bpd-section-head h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}.bpd-section-head p{max-width:none;font-size:12.5px}
      .bpd-starters{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.bpd-starter{min-height:0;padding:16px;border-radius:16px;box-shadow:none}.bpd-starter:hover{border-color:color-mix(in srgb,var(--atlas) 55%,var(--n-200));box-shadow:0 12px 26px -20px rgba(10,15,13,.35)}
      .bpd-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 12px}.bpd-bar .kx-tabs{margin:0;padding:3px;flex:none}.bpd-bar .kx-tab{flex:none;padding:7px 13px;font-size:13px}.bpd-bar .kx-tab small{margin-left:6px;font-family:var(--sans);font-size:11.5px;color:var(--n-500);font-variant-numeric:tabular-nums}
      .bpd-sync-note{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--n-500)}.bpd-sync-note svg{width:14px;height:14px;color:var(--atlas)}.bpd-bar-r{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
      .bpd-rows{border:1px solid var(--n-200);border-radius:16px;overflow:hidden;background:var(--surface)}
      .bpd-row{display:grid;grid-template-columns:96px minmax(180px,1.6fr) minmax(150px,1.2fr) minmax(170px,1.3fr) 96px 156px;gap:16px;align-items:center;padding:13px 18px;border-top:1px solid var(--n-100)}
      .bpd-row.th{border-top:0;padding-top:9px;padding-bottom:9px;font-size:12px;font-weight:500;color:var(--n-500);background:var(--paper-soft)}.bpd-row.th .r{text-align:right}
      .bpd-row.ended{opacity:.62}.bpd-row>span{min-width:0}
      .bpd-off{display:inline-flex;align-items:center;justify-content:center;min-width:72px;padding:7px 10px;border-radius:10px;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);font:700 14px/1 var(--sans);font-variant-numeric:tabular-nums;white-space:nowrap}
      .bpd-row.ended .bpd-off,.bpd-row.soon .bpd-off{background:var(--paper-soft);color:var(--ink)}
      .bpd-rname .bpd-state{text-transform:none;letter-spacing:0;font-size:11.5px;font-weight:500}.bpd-rname b{display:block;font-size:14px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}.bpd-rname .bpd-state{display:inline-block;margin-top:5px}
      .bpd-rtxt{font-size:12.5px;line-height:1.4;color:var(--n-600)}.bpd-rnum{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;color:var(--n-600)}
      .bpd-row .bpd-actions{justify-content:flex-end}
      html[data-theme="dark"] .bpd-intro,html[data-theme="dark"] .bpd-rows{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08)}
      html[data-theme="dark"] .bpd-row.th{background:rgba(255,255,255,0.04)}
      html[data-theme="dark"] .bpd-intro h2,html[data-theme="dark"] .bpd-intro-sync b,html[data-theme="dark"] .bpd-rname b{color:#F7F5F0}
      html[data-theme="dark"] .bpd-off{color:#7DF2B0;background:rgba(125,242,176,.12)}
      @media(max-width:520px){.bpd-kpis.kx-kpi-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.bpd-kpis .kx-kpi{padding:14px}}
      @media(max-width:900px){.bpd-intro{grid-template-columns:1fr}.bpd-intro-sync{border-left:0;border-top:1px solid var(--n-200);padding-top:8px}.bpd-intro-sync li{padding-left:0}
        .bpd-row.th{display:none}.bpd-row{grid-template-columns:auto minmax(0,1fr);gap:6px 14px}.bpd-row .bpd-off{grid-row:1/3}.bpd-rname{grid-column:2}.bpd-row .bpd-rtxt{grid-column:2}.bpd-row .bpd-rnum{grid-column:2;text-align:left}.bpd-row .bpd-actions{grid-column:1/-1;justify-content:flex-start}}
      @media(prefers-reduced-motion:reduce){.bpd-btn,.bpd-card,.bpd-starter{transition:none!important}}`;
    document.head.appendChild(s);
  }

  function scopeText(ctx, p) {
    var sc = p.scope || {};
    if (sc.type === 'tout') return L('Tout le magasin', 'Whole shop', 'كل المتجر');
    if (sc.type === 'rayon') {
      var names = (sc.ids || []).map(function (id) { var r = ctx.rayons.find(function (x) { return x.id === id; }); return r && r.label; }).filter(Boolean);
      if (!names.length) return L('Aucun rayon choisi', 'No department chosen', 'لم يتم اختيار أي قسم');
      if (names.length <= 2) return names.join(L(' et ', ' and ', ' و'));
      var k = names.length - 1;
      return L(names[0] + ' et ' + k + ' autres rayons', names[0] + ' and ' + k + ' other departments', names[0] + ' و' + arN(k, ['قسم آخر', 'قسمان آخران', 'أقسام أخرى', 'قسمًا آخر']));
    }
    if (sc.type === 'produits') {
      var n = (sc.ids || []).length;
      if (!n) return L('Aucun article choisi', 'No item chosen', 'لم يتم اختيار أي صنف');
      if (n === 1) return ctx.products[sc.ids[0]] ? ctx.products[sc.ids[0]].name : L('1 article', '1 item', 'صنف واحد');
      return L(n + ' articles choisis', n + ' items selected', 'الأصناف المختارة: ' + n);
    }
    if (sc.type === 'avant') return sc.before ? L('Entré en stock avant le ' + fmtDay(new Date(sc.before)), 'Received before ' + fmtDay(new Date(sc.before)), 'دخل المخزون قبل ' + fmtDay(new Date(sc.before))) : L('Aucune date choisie', 'No date chosen', 'لم يتم اختيار تاريخ');
    if (sc.type === 'stock') return L('Il en reste ' + (sc.max || 0) + ' ou moins', (sc.max || 0) + ' or fewer left', 'المتبقي ' + (sc.max || 0) + ' أو أقل');
    return '·';
  }

  /* « Mar, Jeu · 12:00–14:00 » : le créneau tel qu'on l'afficherait en
     vitrine. Vide quand la promotion court toute la journée, tous les jours. */
  var dayShort = function (i) { return L(['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'])[i]; };
  var dayLong = function (i) { return L(['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ['يوم الأحد', 'يوم الإثنين', 'يوم الثلاثاء', 'يوم الأربعاء', 'يوم الخميس', 'يوم الجمعة', 'يوم السبت'])[i]; };
  var WEEK = [1, 2, 3, 4, 5, 6, 0];
  function windowText(p) {
    var parts = [];
    if (p.days && p.days.length) parts.push(WEEK.filter(function (d) { return p.days.indexOf(d) >= 0; }).map(function (d) { return dayShort(d); }).join(L(', ', ', ', '، ')));
    if (p.start && p.end) parts.push(p.start + '–' + p.end);
    return parts.join(' · ');
  }
  function resumeText(p, now) {
    var next = PRM().nextWindow ? PRM().nextWindow(p, now) : null;
    if (!next) return L('Hors créneau', 'Outside hours', 'خارج الأوقات');
    var day = next.day === 0 ? L('aujourd’hui', 'today', 'اليوم') : next.day === 1 ? L('demain', 'tomorrow', 'غدًا') : dayLong(next.weekday);
    return L('Reprend ' + day + (next.at ? ' à ' + next.at : ''), 'Resumes ' + day + (next.at ? ' at ' + next.at : ''), 'يستأنف ' + day + (next.at ? ' في الساعة ' + next.at : ''));
  }
  function whenText(p, now) {
    var st = PRM().status(p, now || Date.now());
    var slot = windowText(p);
    var base = whenBase(p, st);
    return slot && st !== 'ended' ? slot + ' · ' + (st === 'waiting' ? resumeText(p, now) + ' · ' : '') + base : base;
  }
  function whenBase(p, st) {
    if (st === 'paused') return L('En pause, aucun prix n’est modifié', 'Paused, no price is changed', 'متوقف مؤقتًا، لا يتغير أي سعر');
    if (st === 'scheduled') {
      var j = Math.ceil((p.from - Date.now()) / DAY);
      return L('Démarre ' + (j <= 1 ? 'demain' : 'dans ' + j + ' jours') + ' · ' + fmtDay(new Date(p.from)),
        'Starts ' + (j <= 1 ? 'tomorrow' : 'in ' + j + ' days') + ' · ' + fmtDay(new Date(p.from)),
        'يبدأ ' + (j <= 1 ? 'غدًا' : 'بعد ' + arN(j, DAYW, 'يوم واحد')) + ' · ' + fmtDay(new Date(p.from)));
    }
    if (st === 'ended') return L('Terminée le ' + fmtDay(new Date(p.to)), 'Ended on ' + fmtDay(new Date(p.to)), 'انتهى في ' + fmtDay(new Date(p.to)));
    if (!p.to) return L('Sans date de fin, jusqu’à ce que vous l’arrêtiez', 'No end date, until you stop it', 'بلا تاريخ انتهاء، حتى توقفه');
    var left = p.to - Date.now();
    if (left < 2 * 3600000) return L('Se termine à ' + fmtHM(new Date(p.to)), 'Ends at ' + fmtHM(new Date(p.to)), 'ينتهي في ' + fmtHM(new Date(p.to)));
    var days = Math.ceil(left / DAY);
    return days <= 1
      ? L('Se termine aujourd’hui à ' + fmtHM(new Date(p.to)), 'Ends today at ' + fmtHM(new Date(p.to)), 'ينتهي اليوم في ' + fmtHM(new Date(p.to)))
      : L('Se termine dans ' + days + ' jours · ' + fmtDay(new Date(p.to)), 'Ends in ' + days + ' days · ' + fmtDay(new Date(p.to)), 'ينتهي بعد ' + arN(days, DAYW) + ' · ' + fmtDay(new Date(p.to)));
  }

  /* Les modèles sont construits à l'appel : la langue peut changer entre deux
     ouvertures de la page. */
  function starters() {
    return {
      destock: { name: L('Déstockage', 'Clearance', 'تصفية المخزون'), kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6, icon: 'archive-restore', kicker: L('Stock dormant', 'Dormant stock', 'مخزون راكد'), title: L('Déstocker l’ancienne saison', 'Clear last season’s stock', 'تصفية مخزون الموسم الماضي'), desc: L('Articles entrés il y a plus de 6 mois', 'Items received more than 6 months ago', 'أصناف دخلت المخزون منذ أكثر من 6 أشهر') },
      finserie: { name: L('Fins de série', 'End of line', 'نهاية السلسلة'), kind: 'percent', value: 20, scope: { type: 'stock', max: 5 }, icon: 'package-minus', kicker: L('Faible stock', 'Low stock', 'مخزون منخفض'), title: L('Écouler les fins de série', 'Sell off end-of-line items', 'تصريف أصناف نهاية السلسلة'), desc: L('Articles avec 5 pièces ou moins', 'Items with 5 pieces or fewer', 'أصناف متبقٍ منها 5 قطع أو أقل') },
      weekend: { name: L('Week-end', 'Weekend', 'نهاية الأسبوع'), kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2, icon: 'calendar-days', kicker: L('Temps fort', 'Key moment', 'مناسبة مميزة'), title: L('Animer le week-end', 'Liven up the weekend', 'تنشيط نهاية الأسبوع'), desc: L('Tout le magasin jusqu’à dimanche soir', 'Whole shop until Sunday evening', 'كل المتجر حتى مساء الأحد') }
    };
  }
  function starter(key) {
    var s = starters()[key]; if (!s) return null;
    var p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(Date.now() - s.months * 30 * DAY));
    if (s.days) p.to = endOfDay(new Date(Date.now() + s.days * DAY));
    return p;
  }

  /* Une promotion = une ligne : la remise, le nom et son état, la cible,
     la période, le nombre d'articles, puis les gestes. */
  function row(ctx, p, now) {
    var status = PRM().status(p, now);
    var n = preview(ctx, p).count;
    var tone = status === 'active' ? 'active' : status === 'ended' ? 'ended' : 'soon';
    var label = status === 'active' ? L('En cours', 'Active', 'جارٍ') : status === 'waiting' ? L('Hors créneau', 'Outside hours', 'خارج الأوقات') : status === 'scheduled' ? L('Programmée', 'Scheduled', 'مجدول') : status === 'paused' ? L('En pause', 'Paused', 'متوقف مؤقتًا') : L('Terminée', 'Ended', 'منتهٍ');
    var tPrint = L('Imprimer les étiquettes', 'Print labels', 'طباعة الملصقات');
    var tToggle = p.paused ? L('Reprendre', 'Resume', 'استئناف') : L('Mettre en pause', 'Pause', 'إيقاف مؤقت');
    var tEdit = L('Modifier', 'Edit', 'تعديل');
    var tDel = L('Supprimer', 'Delete', 'حذف');
    return '<div class="bpd-row ' + tone + '"><span><span class="bpd-off">' + esc(PRM().badgeOf(p)) + '</span></span>' +
      '<span class="bpd-rname"><b>' + esc(p.name) + '</b><span class="bpd-state ' + tone + '">' + label + '</span></span>' +
      '<span class="bpd-rtxt">' + esc(scopeText(ctx, p)) + '</span><span class="bpd-rtxt">' + esc(whenText(p, now)) + '</span>' +
      '<span class="bpd-rnum">' + nItems(n) + '</span><span class="bpd-actions">' +
      (n ? '<button class="bpd-icon" data-action="bpd-print" data-arg="' + esc(p.id) + '" title="' + tPrint + '" aria-label="' + tPrint + '"><i data-lucide="printer"></i></button>' : '') +
      (status !== 'ended' ? '<button class="bpd-icon" data-action="bpd-toggle" data-arg="' + esc(p.id) + '" title="' + tToggle + '" aria-label="' + tToggle + '"><i data-lucide="' + (p.paused ? 'play' : 'pause') + '"></i></button>' : '') +
      '<button class="bpd-icon" data-action="bpd-edit" data-arg="' + esc(p.id) + '" title="' + tEdit + '" aria-label="' + tEdit + '"><i data-lucide="pencil"></i></button>' +
      '<button class="bpd-icon danger" data-action="bpd-delete" data-arg="' + esc(p.id) + '" title="' + tDel + '" aria-label="' + tDel + '"><i data-lucide="trash-2"></i></button></span></div>';
  }

  function startersHtml(title) {
    var ok = allowedPercents();
    var all = starters();
    var badge = function (s) { var v = s.value; if (ok && s.kind === 'percent') v = fitPolicy({ kind: 'percent', value: s.value }).value; return pct(v); };
    return '<section class="bpd-template-block"><div class="bpd-section-head"><div><h3>' + title + '</h3></div><p>' + L('Chaque modèle ouvre un brouillon : rien ne change avant votre validation.', 'Each template opens a draft: nothing changes until you confirm.', 'يفتح كل نموذج مسودة: لا يتغير شيء قبل تأكيدك.') + '</p></div>' +
      '<div class="bpd-starters">' + Object.keys(all).map(function (key) { var s = all[key]; return '<button class="bpd-starter" data-action="bpd-starter" data-arg="' + key + '"><span class="bpd-starter-icon"><i data-lucide="' + s.icon + '"></i></span><span class="bpd-starter-copy"><small>' + esc(s.kicker) + '</small><b>' + esc(s.title) + '</b><span>' + esc(s.desc) + '</span></span><strong>' + esc(badge(s)) + '</strong><i class="bpd-starter-arrow" data-lucide="arrow-up-right"></i></button>'; }).join('') + '</div></section>';
  }

  function emptyHtml() {
    return '<section class="bpd-intro"><div class="bpd-intro-copy"><h2>' + L('Aucune promotion pour l’instant', 'No promotions yet', 'لا توجد عروض بعد') + '</h2>' +
      '<p>' + L('Choisissez la remise, les articles et la durée. ', 'Choose the discount, the items and the duration. ', 'اختر الخصم والأصناف والمدة. ') + (tillApplies()
        ? L('La caisse applique le bon prix automatiquement, sans manipulation au comptoir.', 'The till applies the right price automatically, with nothing to do at the counter.', 'يطبّق الصندوق السعر الصحيح تلقائيًا دون أي تدخل عند المنضدة.')
        : L('Votre caisse n’applique pas encore ces promotions toute seule : la remise se saisit au comptoir.', 'Your till does not apply these promotions on its own yet: enter the discount at the counter.', 'لا يطبّق صندوقك هذه العروض تلقائيًا بعد: يُدخل الخصم يدويًا عند المنضدة.')) + '</p>' +
      '<button class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>' + L('Créer une promotion', 'Create a promotion', 'إنشاء عرض') + '</button></div>' +
      '<ul class="bpd-intro-sync" aria-label="' + L('Ce que Kiwi synchronise', 'What Kiwi syncs', 'ما تزامنه Kiwi') + '"><li><i data-lucide="scan-barcode"></i><span><b>' + L('Prix caisse', 'Till prices', 'أسعار الصندوق') + '</b><small>' + L('Mis à jour instantanément', 'Updated instantly', 'تحديث فوري') + '</small></span></li>' +
      '<li><i data-lucide="receipt-text"></i><span><b>' + L('Tickets & reçus', 'Receipts', 'الإيصالات') + '</b><small>' + L('Remise clairement affichée', 'Discount clearly shown', 'الخصم ظاهر بوضوح') + '</small></span></li>' +
      '<li><i data-lucide="printer"></i><span><b>' + L('Étiquettes', 'Labels', 'الملصقات') + '</b><small>' + L('Prêtes à imprimer', 'Ready to print', 'جاهزة للطباعة') + '</small></span></li></ul></section>' +
      startersHtml(L('Partir d’un modèle', 'Start from a template', 'ابدأ من نموذج'));
  }

  function renderPage() {
    injectCss();
    if (!ready()) { K.toast(L('Promotions indisponibles', 'Promotions unavailable', 'العروض غير متاحة'), { type: 'warn', desc: L('Rechargez le dashboard pour charger le module.', 'Reload the dashboard to load the module.', 'أعد تحميل لوحة التحكم لتحميل الوحدة.') }); return; }
    var ctx = context();
    var now = Date.now();
    var all = PRM().list();
    var groups = {
      /* « Hors créneau » n'est ni fini ni à venir : c'est une promotion en
         cours qui attend son heure. Elle reste sous « En cours ». */
      active: all.filter(function (p) { return ['active', 'waiting'].indexOf(PRM().status(p, now)) >= 0; }),
      soon: all.filter(function (p) { return ['scheduled', 'paused'].indexOf(PRM().status(p, now)) >= 0; }),
      ended: all.filter(function (p) { return PRM().status(p, now) === 'ended'; })
    };
    var shown = groups[filter] || groups.active;
    var seen = new Set();
    /* Un article n'est « remisé » que par une promotion qui s'applique À CET
       INSTANT ; celles qui attendent leur créneau restent sous « En cours ». */
    groups.active.forEach(function (p) { if (PRM().status(p, now) !== 'active') return; items(ctx).forEach(function (it) { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); }); });
    var na = groups.active.length, ns = seen.size;
    var sub = L(na + ' promotion' + (na > 1 ? 's' : '') + ' en cours' + (ns ? ' · ' + ns + ' article' + (ns > 1 ? 's' : '') + ' remisé' + (ns > 1 ? 's' : '') : ''),
      na + ' active promotion' + (na === 1 ? '' : 's') + (ns ? ' · ' + ns + ' discounted item' + (ns === 1 ? '' : 's') : ''),
      arN(na, ['عرض', 'عرضان', 'عروض', 'عرضًا'], 'عرض واحد') + ' قيد التنفيذ' + (ns ? ' · الأصناف المخفضة: ' + ns : ''));
    var seenDesc = ns
      ? L(ns + ' article' + (ns > 1 ? 's' : '') + ' remisé' + (ns > 1 ? 's' : '') + ' en caisse', ns + ' discounted item' + (ns === 1 ? '' : 's') + ' at the till', 'الأصناف المخفضة في الصندوق: ' + ns)
      : L('Aucun article remisé', 'No discounted items', 'لا توجد أصناف مخفضة');
    var lActive = L('En cours', 'Active', 'الجارية');
    var lSoon = L('À venir et en pause', 'Upcoming and paused', 'القادمة والمتوقفة');
    var lEnded = L('Terminées', 'Ended', 'المنتهية');
    var tab = function (key, lbl) { return '<button class="kx-tab' + (filter === key ? ' on' : '') + '" aria-pressed="' + (filter === key) + '" data-action="bpd-filter" data-arg="' + key + '">' + lbl + '<small>' + groups[key].length + '</small></button>'; };
    var listHtml = shown.length
      ? '<div class="bpd-rows"><div class="bpd-row th" aria-hidden="true"><span>' + L('Remise', 'Discount', 'الخصم') + '</span><span>' + L('Promotion', 'Promotion', 'العرض') + '</span><span>' + L('Articles visés', 'Target items', 'الأصناف المستهدفة') + '</span><span>' + L('Période', 'Period', 'الفترة') + '</span><span class="r">' + L('Concernés', 'Affected', 'المعنية') + '</span><span></span></div>' + shown.map(function (p) { return row(ctx, p, now); }).join('') + '</div>'
      : '<div class="bpd-empty bpd-section-empty"><span class="bpd-empty-icon"><i data-lucide="inbox"></i></span><h2>' + L('Aucune promotion ici', 'No promotions here', 'لا توجد عروض هنا') + '</h2><p>' + L('Changez de section ou créez une nouvelle offre.', 'Switch section or create a new offer.', 'غيّر القسم أو أنشئ عرضًا جديدًا.') + '</p><button class="bpd-btn" data-action="bpd-new"><i data-lucide="plus"></i>' + L('Créer une promotion', 'Create a promotion', 'إنشاء عرض') + '</button></div>';
    K.appPage('promos', { title: L('Promotions', 'Promotions', 'العروض'), subtitle: sub, body:
      '<div class="bpd-page">' + (all.length
        ? '<div class="kx-kpi-strip cols-3 bpd-kpis"><div class="kx-kpi' + (groups.active.length ? ' good' : '') + '"><div class="l">' + lActive + '</div><div class="v">' + groups.active.length + '</div><div class="d">' + seenDesc + '</div></div>' +
          '<div class="kx-kpi"><div class="l">' + lSoon + '</div><div class="v">' + groups.soon.length + '</div><div class="d">' + L('Ne modifient aucun prix', 'Change no prices', 'لا تغيّر أي سعر') + '</div></div>' +
          '<div class="kx-kpi"><div class="l">' + lEnded + '</div><div class="v">' + groups.ended.length + '</div><div class="d">' + L('Gardées pour l’historique', 'Kept for the record', 'محفوظة للسجل') + '</div></div></div>' +
          '<div class="bpd-bar"><div class="kx-tabs" role="group" aria-label="' + L('État des promotions', 'Promotion status', 'حالة العروض') + '">' + tab('active', lActive) + tab('soon', lSoon) + tab('ended', lEnded) + '</div>' +
          '<div class="bpd-bar-r">' + (tillApplies() ? '<span class="bpd-sync-note"><i data-lucide="refresh-cw"></i>' + L('Synchronisé avec la caisse', 'Synced with the till', 'متزامن مع الصندوق') + '</span>' : '<span class="bpd-sync-note">' + L('Remise à saisir au comptoir', 'Discount entered at the counter', 'يُدخل الخصم عند المنضدة') + '</span>') + '<button class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>' + L('Nouvelle promotion', 'New promotion', 'عرض جديد') + '</button></div></div>' +
          listHtml + startersHtml(L('Partir d’un modèle', 'Start from a template', 'ابدأ من نموذج'))
        : emptyHtml()) + '</div>' });
    icons();
    if (!subscribed) {
      subscribed = true;
      PRM().subscribe(function () { var active = document.querySelector('[data-nav="promos"].active'); if (active) renderPage(); });
    }
  }

  var scopes = function () {
    return [
      { id: 'tout', label: L('Tout le magasin', 'Whole shop', 'كل المتجر'), icon: 'store' }, { id: 'rayon', label: L('Un rayon', 'One department', 'قسم'), icon: 'layout-grid' },
      { id: 'produits', label: L('Des articles', 'Items', 'أصناف'), icon: 'shirt' }, { id: 'avant', label: L('Ancien stock', 'Old stock', 'مخزون قديم'), icon: 'calendar-clock' },
      { id: 'stock', label: L('Fin de série', 'End of line', 'نهاية السلسلة'), icon: 'package-minus' }
    ];
  };
  function valid(d) {
    if (!d.value) return L('Choisissez de combien vous baissez le prix', 'Choose how much to lower the price', 'اختر قيمة تخفيض السعر');
    if (d.kind === 'percent' && window.KiwiDiscountPolicy?.configured(venueKey())
        && !window.KiwiDiscountPolicy.allowed(d.value, venueKey())) {
      var list = (allowedPercents() || []).map(function (v) { return pct(v); }).join(L(', ', ', ', '، '));
      return L('Vos réglages autorisent seulement ' + list + '. Choisissez une de ces remises ou changez les réglages.',
        'Your settings only allow ' + list + '. Choose one of these discounts or change the settings.',
        'تسمح إعداداتك فقط بـ ' + list + '. اختر أحد هذه الخصومات أو غيّر الإعدادات.');
    }
    var sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return L('Choisissez au moins un élément à viser', 'Choose at least one target', 'اختر هدفًا واحدًا على الأقل');
    if (sc.type === 'avant' && !sc.before) return L('Choisissez la date avant laquelle les articles sont visés', 'Choose the date before which items are targeted', 'اختر التاريخ الذي تُستهدف الأصناف قبله');
    if (sc.type === 'stock' && !sc.max) return L('Indiquez le seuil de stock', 'Enter the stock threshold', 'أدخل حد المخزون');
    if (d.to && d.from && d.to <= d.from) return L('La date de fin doit venir après le début', 'The end date must be after the start', 'يجب أن يأتي تاريخ الانتهاء بعد البداية');
    if (!!d.start !== !!d.end) return L('Indiquez l’heure de début et l’heure de fin, ou aucune', 'Enter both a start time and an end time, or neither', 'أدخل وقت البداية ووقت النهاية معًا، أو اتركهما فارغين');
    if (d.start && d.start === d.end) return L('L’heure de fin doit différer de l’heure de début', 'The end time must differ from the start time', 'يجب أن يختلف وقت النهاية عن وقت البداية');
    return '';
  }
  function autoName(ctx, d) {
    if (d.scope.type === 'avant') return L('Déstockage', 'Clearance', 'تصفية المخزون');
    if (d.scope.type === 'stock') return L('Fins de série', 'End of line', 'نهاية السلسلة');
    if (d.scope.type === 'rayon') return scopeText(ctx, d);
    if (d.scope.type === 'produits') return L('Sélection', 'Selection', 'مجموعة مختارة');
    return d.kind === 'percent' ? L('Tout le magasin −' + d.value + ' %', 'Whole shop −' + d.value + '%', 'كل المتجر −' + d.value + '%') : L('Promotion', 'Promotion', 'عرض');
  }

  function scopeControl(ctx, d) {
    var sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="bpd-hint">' + L('Chaque article du magasin, sans exception.', 'Every item in the shop, without exception.', 'كل صنف في المتجر دون استثناء.') + '</div>';
    if (sc.type === 'rayon') return '<div class="bpd-chips">' + ctx.rayons.map(function (r) { return '<button class="bpd-chip ' + ((sc.ids || []).indexOf(r.id) >= 0 ? 'on' : '') + '" data-prr="' + esc(r.id) + '">' + esc(r.label) + ' <small>' + r.items.length + '</small></button>'; }).join('') + '</div>';
    if (sc.type === 'produits') {
      var ids = sc.ids || [];
      return '<div class="bpd-search"><i data-lucide="search"></i><input id="bpd-q" placeholder="' + L('Chercher un article ou scanner son code-barres…', 'Search for an item or scan its barcode…', 'ابحث عن صنف أو امسح رمزه الشريطي…') + '" autocomplete="off"></div>' +
        '<div class="bpd-chips">' + (ids.length ? ids.map(function (id) { return '<button class="bpd-chip on" data-prp="' + esc(id) + '">' + esc(ctx.products[id] ? ctx.products[id].name : id) + ' <i data-lucide="x"></i></button>'; }).join('') : '<span class="bpd-hint">' + L('Aucun article choisi.', 'No item chosen.', 'لم يتم اختيار أي صنف.') + '</span>') + '</div><div class="bpd-hits" id="bpd-hits"></div>';
    }
    if (sc.type === 'avant') return '<div class="bpd-chips">' + [{m:3,l:L('Plus de 3 mois', 'Over 3 months', 'أكثر من 3 أشهر')},{m:6,l:L('Plus de 6 mois', 'Over 6 months', 'أكثر من 6 أشهر')},{m:12,l:L('Plus d’un an', 'Over a year', 'أكثر من سنة')}].map(function (o) { return '<button class="bpd-chip" data-pra="' + o.m + '">' + o.l + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-before" type="date" value="' + toInput(sc.before) + '"><div class="bpd-hint">' + L('Vise les articles entrés avant cette date.', 'Targets items received before this date.', 'يستهدف الأصناف التي دخلت المخزون قبل هذا التاريخ.') + '</div>';
    if (sc.type === 'stock') return '<div class="bpd-chips">' + [2,3,5,10].map(function (n) { return '<button class="bpd-chip ' + (sc.max === n ? 'on' : '') + '" data-prm="' + n + '">' + L(n + ' ou moins', n + ' or fewer', n + ' أو أقل') + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-max" type="number" min="1" value="' + (sc.max || '') + '" placeholder="' + L('ou un seuil à vous', 'or your own threshold', 'أو حدًا تختاره') + '"><div class="bpd-hint">' + L('La cible suit automatiquement le stock disponible.', 'The target follows available stock automatically.', 'يتبع الهدف المخزون المتاح تلقائيًا.') + '</div>';
    return '';
  }

  function composerHtml(ctx) {
    var d = composer.draft;
    var prev = preview(ctx, d);
    var problem = valid(d);
    var sc = d.scope || {};
    var quick = d.kind === 'percent' ? (window.KiwiDiscountPolicy?.percentages(venueKey(), [10,20,30,50]) || [10,20,30,50]) : d.kind === 'amount' ? [20,50,100,200] : [49,99,149,199];
    var kinds = [['percent', L('Pourcentage', 'Percentage', 'نسبة مئوية'), pct(20)], ['amount', L('Montant', 'Amount', 'مبلغ'), '−50 MAD'], ['fixed', L('Prix final', 'Final price', 'السعر النهائي'), '99 MAD']];
    var presets = [['today', L('Aujourd’hui', 'Today', 'اليوم')], ['we', L('Ce week-end', 'This weekend', 'نهاية هذا الأسبوع')], ['7', L('7 jours', '7 days', '7 أيام')], ['30', L('30 jours', '30 days', '30 يومًا')], ['none', L('Sans fin', 'No end', 'بلا نهاية')]];
    return '<div class="bpd-modal" data-bpd-host><div class="bpd-compose"><div class="bpd-form">' +
      '<section class="bpd-step"><header><span>1</span><div><b>' + L('Définir l’offre', 'Define the offer', 'تحديد العرض') + '</b><small>' + L('Le nom et la baisse de prix', 'The name and the price drop', 'الاسم وقيمة تخفيض السعر') + '</small></div></header><div class="bpd-step-body">' +
      '<div class="bpd-field"><label>' + L('Nom', 'Name', 'الاسم') + ' <span>' + L('· visible sur le reçu', '· shown on the receipt', '· يظهر على الإيصال') + '</span></label><input class="bpd-input" id="bpd-name" maxlength="80" placeholder="' + L('Soldes d’été, Déstockage…', 'Summer sale, Clearance…', 'تخفيضات الصيف، تصفية المخزون…') + '" value="' + esc(d.name) + '"></div>' +
      '<div class="bpd-field"><label>' + L('Type de remise', 'Discount type', 'نوع الخصم') + '</label><div class="bpd-kinds">' + kinds.map(function (x) { return '<button class="bpd-choice ' + (d.kind === x[0] ? 'on' : '') + '" aria-pressed="' + (d.kind === x[0]) + '" data-prk="' + x[0] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></button>'; }).join('') + '</div><div class="bpd-value"><span class="bpd-value-box"><input class="bpd-input" id="bpd-value" type="number" min="0" value="' + d.value + '"><span class="bpd-unit">' + (d.kind === 'percent' ? '%' : 'MAD') + '</span></span><div class="bpd-chips">' + quick.map(function (n) { return '<button class="bpd-chip ' + (d.value === n ? 'on' : '') + '" data-prv="' + n + '">' + (d.kind === 'percent' ? pct(n) : d.kind === 'amount' ? '−' + n : n) + '</button>'; }).join('') + '</div></div></div></div></section>' +
      '<section class="bpd-step"><header><span>2</span><div><b>' + L('Choisir les articles', 'Choose the items', 'اختيار الأصناف') + '</b><small>' + L('Kiwi garde cette sélection à jour', 'Kiwi keeps this selection up to date', 'تُبقي Kiwi هذا الاختيار محدّثًا') + '</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-scopes">' + scopes().map(function (x) { return '<button class="bpd-choice ' + (sc.type === x.id ? 'on' : '') + '" aria-pressed="' + (sc.type === x.id) + '" data-prs="' + x.id + '"><i data-lucide="' + x.icon + '"></i><b>' + x.label + '</b></button>'; }).join('') + '</div><div class="bpd-scopebody">' + scopeControl(ctx, d) + '</div></div></div></section>' +
      '<section class="bpd-step"><header><span>3</span><div><b>' + L('Programmer la durée', 'Set the duration', 'تحديد المدة') + '</b><small>' + L('Démarrez maintenant ou planifiez', 'Start now or schedule', 'ابدأ الآن أو جدول') + '</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-chips">' + presets.map(function (x) { return '<button class="bpd-chip" data-prw="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><div class="bpd-dates"><div><label>' + L('Début', 'Start', 'البداية') + ' <span>' + L('· vide = maintenant', '· empty = now', '· فارغ = الآن') + '</span></label><input class="bpd-input" id="bpd-from" type="date" value="' + toInput(d.from) + '"></div><div><label>' + L('Fin', 'End', 'النهاية') + ' <span>' + L('· vide = sans fin', '· empty = no end', '· فارغ = بلا نهاية') + '</span></label><input class="bpd-input" id="bpd-to" type="date" value="' + toInput(d.to) + '"></div></div></div>' +
        '<div class="bpd-field"><label>' + L('Jours', 'Days', 'الأيام') + ' <span>' + L('· aucun = tous les jours', '· none = every day', '· بلا اختيار = كل يوم') + '</span></label><div class="bpd-chips bpd-days" role="group" aria-label="' + L('Jours de la promotion', 'Promotion days', 'أيام العرض') + '">' + WEEK.map(function (wd) { var on = (d.days || []).indexOf(wd) >= 0; return '<button class="bpd-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-prd="' + wd + '">' + dayShort(wd) + '</button>'; }).join('') + '</div></div>' +
        '<div class="bpd-field"><label>' + L('Heures', 'Hours', 'الساعات') + ' <span>' + L('· vides = toute la journée', '· empty = all day', '· فارغة = طوال اليوم') + '</span></label><div class="bpd-dates"><div><input class="bpd-input" id="bpd-start" type="time" step="900" aria-label="' + L('Heure de début', 'Start time', 'وقت البداية') + '" value="' + esc(d.start || '') + '"></div><div><input class="bpd-input" id="bpd-end" type="time" step="900" aria-label="' + L('Heure de fin', 'End time', 'وقت النهاية') + '" value="' + esc(d.end || '') + '"></div></div><div class="bpd-hint">' + L('En heure du Maroc. Une fin avant le début passe minuit : 22:00 → 01:00 compte pour le jour où elle a commencé.', 'Morocco time. An end before the start runs past midnight: 22:00 → 01:00 counts for the day it started.', 'بتوقيت المغرب. إذا كانت النهاية قبل البداية فالعرض يمتد بعد منتصف الليل: 22:00 ← 01:00 يُحتسب لليوم الذي بدأ فيه.') + '</div></div>' +
        '</div></section>' +
      '</div><aside class="bpd-preview" data-surface="inverse"><span class="bpd-preview-live"><i></i>' + L('Aperçu en direct', 'Live preview', 'معاينة مباشرة') + '</span><div class="bpd-preview-head"><span>' + L('Articles concernés', 'Items affected', 'الأصناف المعنية') + '</span><b>' + prev.count + '</b><em>' + L('article' + (prev.count > 1 ? 's' : ''), 'item' + (prev.count === 1 ? '' : 's'), arW(prev.count, ITEM)) + '</em></div>' +
      (prev.count ? '<div class="bpd-swap"><div><span>' + L('Prix plein', 'Full price', 'السعر الكامل') + '</span><b>' + money(prev.from) + '</b></div><i data-lucide="arrow-right"></i><div class="next"><span>' + L('Prix promo', 'Promo price', 'سعر العرض') + '</span><b>' + money(prev.to) + '</b></div></div><div class="bpd-give">' + L('Vous offrez <b>' + money(prev.from - prev.to) + '</b> si tout part.', 'You give away <b>' + money(prev.from - prev.to) + '</b> if everything sells.', 'تتنازل عن <b>' + money(prev.from - prev.to) + '</b> إذا بيع كل شيء.') + '</div>' + (prev.under ? '<div class="bpd-warn"><i data-lucide="alert-triangle"></i><span><b>' + L(prev.under + ' article' + (prev.under > 1 ? 's passent' : ' passe') + ' sous le prix d’achat.', prev.under + ' item' + (prev.under === 1 ? ' falls' : 's fall') + ' below cost price.', arN(prev.under, ITEM, 'صنف واحد') + ' بسعر أقل من سعر الشراء.') + '</b></span></div>' : '') + '<div class="bpd-sample">' + prev.sample.map(function (x) { return '<div class="bpd-srow"><span class="name">' + esc(x.name) + '</span><span class="prices"><s>' + money(x.was) + '</s><b>' + money(x.price) + '</b></span></div>'; }).join('') + '</div>' : '<div class="bpd-none">' + esc(problem || L('Aucun article ne correspond à cette cible.', 'No item matches this target.', 'لا يوجد صنف يطابق هذا الهدف.')) + '</div>') + '</aside></div>' +
      '<div class="bpd-compose-foot"><span class="bpd-problem">' + (problem ? '<i data-lucide="info"></i>' + esc(problem) : '<i data-lucide="check-circle-2"></i>' + (composer.editing ? L('Prête à être enregistrée', 'Ready to be saved', 'جاهز للحفظ') : L('Prête à être lancée', 'Ready to be launched', 'جاهز للإطلاق'))) + '</span><span class="bpd-compose-actions"><button class="bpd-btn" data-bpd-cancel>' + L('Annuler', 'Cancel', 'إلغاء') + '</button><button class="bpd-btn primary" id="bpd-save" ' + (problem || !prev.count ? 'disabled' : '') + '><i data-lucide="check"></i>' + (composer.editing ? L('Enregistrer', 'Save', 'حفظ') : L('Lancer la promotion', 'Launch the promotion', 'إطلاق العرض')) + '</button></span></div></div>';
  }

  /* Les pourcentages que le propriétaire autorise (Réglages), ou null quand
     il n'a rien restreint. */
  function allowedPercents() {
    var pol = window.KiwiDiscountPolicy;
    return pol && pol.configured(venueKey()) ? pol.percentages(venueKey()).slice().sort(function (a, b) { return a - b; }) : null;
  }
  /* Un brouillon ne s'ouvre jamais sur une valeur que la boutique refuse :
     sinon le bouton « Lancer » est grisé avant même le premier geste. On prend
     le pourcentage autorisé le plus proche de celui proposé. */
  function fitPolicy(d) {
    var ok = allowedPercents();
    if (!ok || !ok.length || d.kind !== 'percent' || ok.indexOf(d.value) >= 0) return d;
    d.value = ok.reduce(function (best, v) { return Math.abs(v - d.value) < Math.abs(best - d.value) ? v : best; }, ok[0]);
    return d;
  }
  function openComposer(seed) {
    /* Le composeur s'ouvre aussi hors de la page Promotions (un modèle proposé
       ailleurs) : ses styles ne doivent pas dépendre d'y être passé avant. */
    injectCss();
    var ctx = context();
    composer.editing = seed && seed.id ? seed.id : null;
    composer.draft = PRM().normalize(seed || { name:'', kind:'percent', value:20, scope:{type:'tout'} });
    if (!composer.editing) fitPolicy(composer.draft);
    if (!seed) composer.draft.name = '';
    promoModal = K.modal({ title: composer.editing ? L('Modifier la promotion', 'Edit the promotion', 'تعديل العرض') : L('Créer une promotion', 'Create a promotion', 'إنشاء عرض'), desc: L('Trois choix, puis Kiwi applique les bons prix partout.', 'Three choices, then Kiwi applies the right prices everywhere.', 'ثلاثة اختيارات، ثم تطبّق Kiwi الأسعار الصحيحة في كل مكان.'), width: 1080, body: '<div data-bpd-shell></div>', foot: '' });
    function draw() {
      var shell = promoModal.el.querySelector('[data-bpd-shell]');
      shell.innerHTML = composerHtml(ctx);
      wire(shell, ctx, draw);
      icons();
    }
    draw();
  }

  function wire(el, ctx, redraw) {
    var d = composer.draft;
    var name = el.querySelector('#bpd-name');
    if (name) name.oninput = function () { d.name = name.value; };
    el.querySelectorAll('[data-prk]').forEach(function (b) { b.onclick = function () { d.kind = b.dataset.prk; fitPolicy(d); redraw(); }; });
    var val = el.querySelector('#bpd-value'); if (val) val.onchange = function () { d.value = Math.max(0, Math.round(+val.value || 0)); redraw(); };
    el.querySelectorAll('[data-prv]').forEach(function (b) { b.onclick = function () { d.value = +b.dataset.prv; redraw(); }; });
    el.querySelectorAll('[data-prs]').forEach(function (b) { b.onclick = function () { d.scope = PRM().normalize({ scope:{type:b.dataset.prs} }).scope; redraw(); }; });
    el.querySelectorAll('[data-prr]').forEach(function (b) { b.onclick = function () { var ids = d.scope.ids || (d.scope.ids=[]); var i=ids.indexOf(b.dataset.prr); if(i>=0) ids.splice(i,1); else ids.push(b.dataset.prr); redraw(); }; });
    el.querySelectorAll('[data-prp]').forEach(function (b) { b.onclick = function () { var i=d.scope.ids.indexOf(b.dataset.prp); if(i>=0)d.scope.ids.splice(i,1); redraw(); }; });
    var q = el.querySelector('#bpd-q');
    if (q) {
      var hits = el.querySelector('#bpd-hits');
      var paint = function () { var term=q.value.trim().toLowerCase(); if(!term){hits.innerHTML='';return;} var by=ctx.byEan[q.value.trim()]; var found=by?[ctx.products[by]].filter(Boolean):items(ctx).filter(function(it){return it.name.toLowerCase().indexOf(term)>=0;}).slice(0,8); hits.innerHTML=found.map(function(it){return '<button class="bpd-hit" data-pick="'+esc(it.id)+'"><span>'+esc(it.name)+'</span><b>'+money(it.price)+'</b></button>';}).join('')||'<div class="bpd-hint">'+L('Aucun article trouvé.','No item found.','لم يُعثر على أي صنف.')+'</div>'; hits.querySelectorAll('[data-pick]').forEach(function(b){b.onclick=function(){var ids=d.scope.ids||(d.scope.ids=[]);if(ids.indexOf(b.dataset.pick)<0)ids.push(b.dataset.pick);redraw();};}); };
      q.oninput = paint; q.onkeydown = function(e){if(e.key==='Enter'){e.preventDefault();paint();}};
    }
    el.querySelectorAll('[data-pra]').forEach(function(b){b.onclick=function(){d.scope.before=startOfDay(new Date(Date.now()-(+b.dataset.pra)*30*DAY));redraw();};});
    var before=el.querySelector('#bpd-before');if(before)before.onchange=function(){d.scope.before=before.value?startOfDay(new Date(before.value+'T12:00:00')):0;redraw();};
    el.querySelectorAll('[data-prm]').forEach(function(b){b.onclick=function(){d.scope.max=+b.dataset.prm;redraw();};});
    var max=el.querySelector('#bpd-max');if(max)max.onchange=function(){d.scope.max=Math.max(0,Math.round(+max.value||0));redraw();};
    el.querySelectorAll('[data-prw]').forEach(function(b){b.onclick=function(){var key=b.dataset.prw,now=new Date();if(key==='none')d.to=0;else if(key==='today')d.to=endOfDay(now);else if(key==='we')d.to=endOfDay(new Date(now.getTime()+((7-now.getDay())%7)*DAY));else d.to=endOfDay(new Date(now.getTime()+(+key)*DAY));redraw();};});
    var from=el.querySelector('#bpd-from');if(from)from.onchange=function(){d.from=from.value?startOfDay(new Date(from.value+'T12:00:00')):0;redraw();};
    var to=el.querySelector('#bpd-to');if(to)to.onchange=function(){d.to=to.value?endOfDay(new Date(to.value+'T12:00:00')):0;redraw();};
    el.querySelectorAll('[data-prd]').forEach(function(b){b.onclick=function(){var wd=+b.dataset.prd,days=(d.days||[]).slice(),i=days.indexOf(wd);if(i>=0)days.splice(i,1);else days.push(wd);d.days=days.length===7?[]:days.sort(function(a,z){return a-z;});redraw();};});
    var hStart=el.querySelector('#bpd-start');if(hStart)hStart.onchange=function(){d.start=hStart.value||'';redraw();};
    var hEnd=el.querySelector('#bpd-end');if(hEnd)hEnd.onchange=function(){d.end=hEnd.value||'';redraw();};
    el.querySelector('[data-bpd-cancel]').onclick=function(){promoModal.close();};
    var save=el.querySelector('#bpd-save');if(save)save.onclick=function(){if(valid(d))return;if(!d.name.trim())d.name=autoName(ctx,d);if(composer.editing)d.id=composer.editing;PRM().save(d);promoModal.close();K.toast(composer.editing?L(d.name+' enregistrée',d.name+' saved','تم حفظ '+d.name):(tillApplies()?L(d.name+' lancée, la caisse est à jour',d.name+' launched, the till is up to date','تم إطلاق '+d.name+'، الصندوق محدّث'):L(d.name+' enregistrée · la remise se saisit au comptoir',d.name+' saved · enter the discount at the counter','تم حفظ '+d.name+' · يُدخل الخصم عند المنضدة')),{type:'success'});renderPage();};
  }

  function labelFor(ctx, pid, variant) {
    var item = ctx.products[pid]; if (!item) return null;
    var code = ctx.cat.primaryBarcode(variant); if (!code) return null;
    var deal = PRM().priceFor(item, { stock: stockOf(item) });
    return { title:item.name, sub:variant.colorLabel+' · '+variant.size, price:String(deal ? deal.price : item.price), was:deal ? String(deal.was) : null, code:code, format:window.KiwiBarcode.isValidEan13(code)?'ean13':'code128' };
  }
  function labelPlan(id) {
    var ctx=context(), p=PRM().get(id), labels=[], products=0;
    if(!p)return {promo:null,labels:labels,products:0};
    items(ctx).forEach(function(item){if(!PRM().matches(p,item,stockOf(item)))return;var used=0;ctx.cat.listVariants(item.id).forEach(function(v){if(!(v.stock>0))return;var l=labelFor(ctx,item.id,v);if(l){labels.push(l);used++;}});if(used)products++;});
    return {promo:p,labels:labels,products:products};
  }

  document.addEventListener('kiwi:langchange', function () { if (document.querySelector('[data-nav="promos"].active')) renderPage(); });
  H['nav-promos'] = renderPage;
  H['bpd-filter'] = function (_el,arg) { filter=arg||'active';renderPage(); };
  H['bpd-new'] = function () { openComposer(null); };
  H['bpd-starter'] = function (_el,arg) { openComposer(starter(arg)); };
  H['bpd-edit'] = function (_el,arg) { var p=PRM().get(arg);if(p)openComposer(p); };
  H['bpd-toggle'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;PRM().setPaused(arg,!p.paused);K.toast(p.paused?L(p.name+' reprend',p.name+' resumes','تم استئناف '+p.name):L(p.name+' mise en pause',p.name+' paused','تم إيقاف '+p.name+' مؤقتًا'),{type:p.paused?'success':'warn'});renderPage(); };
  H['bpd-delete'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;var m=K.modal({title:L('Supprimer « '+p.name+' » ?','Delete "'+p.name+'"?','حذف « '+p.name+' »؟'),desc:L('Les articles repassent immédiatement au prix plein. Les ventes encaissées ne changent pas.','Items go back to full price immediately. Completed sales do not change.','تعود الأصناف فورًا إلى السعر الكامل. لا تتغير المبيعات المحصّلة.'),width:470,foot:'<button class="kb ghost" data-cancel>'+L('Garder','Keep','إبقاء')+'</button><button class="kb danger" data-delete>'+L('Supprimer','Delete','حذف')+'</button>'});m.el.querySelector('[data-cancel]').onclick=m.close;m.el.querySelector('[data-delete]').onclick=function(){PRM().remove(arg);m.close();K.toast(L(p.name+' supprimée',p.name+' deleted','تم حذف '+p.name),{type:'warn'});renderPage();}; };
  H['bpd-print'] = function (_el,arg) { var plan=labelPlan(arg);if(!plan.promo)return;var n=plan.labels.length;var m=K.modal({title:L('Étiquettes · ','Labels · ','الملصقات · ')+plan.promo.name,desc:n?L('Chaque étiquette portera le prix réellement appliqué en caisse.','Each label will carry the price actually applied at the till.','سيحمل كل ملصق السعر المطبّق فعليًا في الصندوق.'):L('Aucun article en stock avec un code-barres.','No item in stock with a barcode.','لا يوجد صنف في المخزون له رمز شريطي.'),width:520,body:n?'<div class="bpd-print-summary"><b>'+n+'</b><span>'+L('étiquette'+(n>1?'s':'')+' · '+plan.products+' article'+(plan.products>1?'s':'')+' concerné'+(plan.products>1?'s':''),'label'+(n===1?'':'s')+' · '+plan.products+' item'+(plan.products===1?'':'s')+' affected',arN(n,['ملصق','ملصقان','ملصقات','ملصقًا'],'ملصق واحد')+' · الأصناف المعنية: '+plan.products)+'</span></div>':'',foot:'<button class="kb ghost" data-cancel>'+ (n?L('Annuler','Cancel','إلغاء'):L('Fermer','Close','إغلاق')) +'</button>'+(n?'<button class="kb atlas" data-print><i data-lucide="printer"></i>'+L('Imprimer ','Print ','طباعة ')+n+'</button>':'')});m.el.querySelector('[data-cancel]').onclick=m.close;var b=m.el.querySelector('[data-print]');if(b)b.onclick=function(){m.close();window.KiwiBarcode.printLabels(plan.labels,{copies:1});};icons(); };
})();

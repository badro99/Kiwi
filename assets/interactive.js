/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · interactive demo layer
 * Handles all click interactions across index / dashboard / wallet / brand / pitch
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─────────── INJECTED STYLES ─────────── */
  const CSS = `
  /* Toasts */
  .kiwi-toasts { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 9999; pointer-events: none; max-width: 360px; }
  .kiwi-toast { background: #fff; border: 1px solid var(--n-200); border-radius: 14px; padding: 14px 16px; min-width: 280px; display: flex; gap: 12px; align-items: flex-start; box-shadow: 0 20px 40px -20px rgba(10,15,13,0.25), 0 2px 4px rgba(10,15,13,0.04); pointer-events: all; opacity: 0; transform: translateY(-10px); transition: opacity 220ms, transform 220ms cubic-bezier(0.32,0.72,0,1); font-family: var(--sans); color: var(--ink); }
  .kiwi-toast.in { opacity: 1; transform: translateY(0); }
  .kiwi-toast .ti { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .kiwi-toast.success .ti { background: #E3F7EC; color: var(--atlas-700); }
  .kiwi-toast.info .ti { background: #E3F0F7; color: var(--info); }
  .kiwi-toast.warn .ti { background: #FFF4DD; color: #8A6210; }
  .kiwi-toast.danger .ti { background: #FDE8E4; color: #9B2F22; }
  .kiwi-toast .tb { flex: 1; min-width: 0; }
  .kiwi-toast .tm { font-size: 14px; font-weight: 500; line-height: 1.35; letter-spacing: -0.005em; }
  .kiwi-toast .ts { font-size: 12.5px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }
  .kiwi-toast .ta { margin-top: 8px; font-size: 12.5px; color: var(--atlas); font-weight: 500; cursor: pointer; background: none; border: 0; padding: 0; }
  .kiwi-toast .tx { background: none; border: 0; color: var(--n-400); cursor: pointer; font-size: 18px; line-height: 1; padding: 0; margin-left: 4px; }
  .kiwi-toast .tx:hover { color: var(--ink); }

  /* Modal */
  .kiwi-backdrop { position: fixed; inset: 0; background: rgba(10,15,13,0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9990; opacity: 0; transition: opacity 260ms; padding: 20px; }
  .kiwi-backdrop.in { opacity: 1; }
  .kiwi-modal { background: var(--paper); border-radius: 22px; width: 100%; max-height: calc(100vh - 40px); overflow-y: auto; position: relative; transform: translateY(20px) scale(0.985); transition: transform 320ms cubic-bezier(0.32,0.72,0,1); font-family: var(--sans); color: var(--ink); }
  .kiwi-backdrop.in .kiwi-modal { transform: translateY(0) scale(1); }
  .kiwi-modal-head { padding: 24px 28px 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .kiwi-modal-head h3 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }
  .kiwi-modal-head p { margin: 5px 0 0; font-size: 14px; color: var(--n-500); line-height: 1.45; }
  .kiwi-modal-head .tag { display: inline-block; margin-bottom: 10px; padding: 4px 10px; background: var(--mint-soft); color: var(--riad); border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
  .kiwi-modal-body { padding: 0 28px 24px; }
  .kiwi-modal-foot { padding: 16px 28px; border-top: 1px solid var(--n-200); display: flex; justify-content: flex-end; gap: 10px; background: rgba(255,255,255,0.5); border-radius: 0 0 22px 22px; }
  .kiwi-modal-close { position: absolute; top: 18px; right: 18px; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--n-200); background: #fff; color: var(--n-500); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 150ms; z-index: 2; }
  .kiwi-modal-close:hover { color: var(--ink); border-color: var(--n-400); }

  /* Drawer */
  .kiwi-drawer-backdrop { position: fixed; inset: 0; background: rgba(10,15,13,0.45); backdrop-filter: blur(4px); z-index: 9990; opacity: 0; transition: opacity 220ms; }
  .kiwi-drawer-backdrop.in { opacity: 1; }
  .kiwi-drawer { position: fixed; top: 0; right: 0; bottom: 0; background: var(--paper); width: 420px; max-width: calc(100vw - 40px); transform: translateX(100%); transition: transform 320ms cubic-bezier(0.32,0.72,0,1); box-shadow: -20px 0 40px -10px rgba(10,15,13,0.2); display: flex; flex-direction: column; font-family: var(--sans); color: var(--ink); }
  .kiwi-drawer-backdrop.in .kiwi-drawer { transform: translateX(0); }
  .kiwi-drawer-head { padding: 20px 24px; border-bottom: 1px solid var(--n-200); display: flex; justify-content: space-between; align-items: center; }
  .kiwi-drawer-head h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
  .kiwi-drawer-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--n-500); }
  .kiwi-drawer-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
  .kiwi-drawer-foot { padding: 16px 24px; border-top: 1px solid var(--n-200); }
  .kiwi-drawer-close { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--n-200); background: #fff; color: var(--n-500); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 150ms; }
  .kiwi-drawer-close:hover { color: var(--ink); border-color: var(--n-400); }

  /* Command palette */
  .kp { position: fixed; top: 16vh; left: 50%; transform: translateX(-50%) scale(0.97); width: min(600px, calc(100vw - 40px)); background: var(--paper); border-radius: 16px; z-index: 9995; box-shadow: 0 40px 80px -20px rgba(10,15,13,0.35), 0 4px 8px rgba(10,15,13,0.05); opacity: 0; transition: opacity 200ms, transform 200ms cubic-bezier(0.32,0.72,0,1); overflow: hidden; }
  .kp.in { opacity: 1; transform: translateX(-50%) scale(1); }
  .kp-head { padding: 16px 20px; border-bottom: 1px solid var(--n-200); display: flex; align-items: center; gap: 12px; }
  .kp-head input { flex: 1; border: 0; outline: 0; background: none; font-size: 16px; color: var(--ink); font-family: var(--sans); letter-spacing: -0.005em; }
  .kp-head input::placeholder { color: var(--n-400); }
  .kp-list { padding: 8px 0; max-height: 420px; overflow-y: auto; }
  .kp-sect { padding: 10px 20px 6px; font-size: 10.5px; font-weight: 500; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-family: var(--mono); }
  .kp-item { padding: 10px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; font-size: 13.5px; color: var(--ink); transition: background 100ms; }
  .kp-item:hover, .kp-item.active { background: var(--mint-soft); }
  .kp-item .kpi-ic { width: 28px; height: 28px; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--atlas); border: 1px solid var(--n-200); flex-shrink: 0; }
  .kp-item .kpi-t { flex: 1; font-weight: 500; letter-spacing: -0.005em; }
  .kp-item .kpi-s { color: var(--n-500); font-size: 12.5px; font-weight: 400; }
  .kp-item .kpi-k { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--n-200); }
  .kp-foot { padding: 10px 20px; border-top: 1px solid var(--n-200); display: flex; justify-content: space-between; align-items: center; background: #fff; font-size: 11px; color: var(--n-500); }
  .kp-foot span { display: inline-flex; align-items: center; gap: 6px; }
  .kp-foot kbd { font-family: var(--mono); background: var(--n-100); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--n-200); font-size: 10px; }

  /* Notification item in drawer */
  .notif { display: flex; gap: 12px; padding: 14px 4px; border-bottom: 1px solid var(--n-200); align-items: flex-start; cursor: pointer; transition: background 120ms; border-radius: 8px; }
  .notif:hover { background: var(--paper-soft); }
  .notif.unread::before { content: ""; width: 6px; height: 6px; background: var(--atlas); border-radius: 50%; margin-top: 10px; flex-shrink: 0; }
  .notif:not(.unread)::before { content: ""; width: 6px; height: 6px; margin-top: 10px; flex-shrink: 0; }
  .notif .n-ico { width: 34px; height: 34px; border-radius: 10px; background: var(--paper-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .notif .n-body { flex: 1; min-width: 0; }
  .notif .n-title { font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em; }
  .notif .n-desc { font-size: 12.5px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .notif .n-time { font-size: 11px; color: var(--n-400); font-family: var(--mono); margin-top: 6px; }

  /* Form input */
  .kf-label { display: block; font-size: 12px; font-weight: 500; color: var(--n-600); margin-bottom: 6px; letter-spacing: 0.02em; }
  .kf-input { width: 100%; background: #fff; border: 1px solid var(--n-200); border-radius: 10px; padding: 11px 14px; font-size: 14px; color: var(--ink); font-family: var(--sans); outline: 0; transition: border-color 150ms, box-shadow 150ms; }
  .kf-input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.12); }
  .kf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .kf-group { margin-bottom: 14px; }
  .kf-help { font-size: 11.5px; color: var(--n-500); margin-top: 5px; line-height: 1.4; }

  /* Dropdown menu */
  .kiwi-menu { position: absolute; background: #fff; border: 1px solid var(--n-200); border-radius: 12px; box-shadow: 0 20px 40px -16px rgba(10,15,13,0.24); padding: 6px; min-width: 220px; z-index: 9990; font-family: var(--sans); opacity: 0; transform: translateY(-6px); transition: opacity 160ms, transform 160ms; }
  .kiwi-menu.in { opacity: 1; transform: translateY(0); }
  .kiwi-menu-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 13.5px; color: var(--ink); border-radius: 8px; cursor: pointer; transition: background 100ms; }
  .kiwi-menu-item:hover { background: var(--paper-soft); }
  .kiwi-menu-item .m-ico { width: 18px; height: 18px; color: var(--n-500); }
  .kiwi-menu-item.active { background: var(--mint-soft); color: var(--atlas); }
  .kiwi-menu-item.danger { color: var(--danger); }
  .kiwi-menu-sep { height: 1px; background: var(--n-200); margin: 6px -6px; }
  .kiwi-menu-head { padding: 8px 12px; font-size: 10.5px; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }

  /* Confetti */
  .kiwi-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 10000; overflow: hidden; }
  .kiwi-confetti span { position: absolute; width: 8px; height: 12px; border-radius: 2px; animation: kiwi-confetti-fall 2s cubic-bezier(0.35,0.04,0.63,0.72) forwards; }
  @keyframes kiwi-confetti-fall {
    0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
  }

  /* Signup wizard */
  .wiz-steps { display: flex; gap: 8px; margin-bottom: 20px; }
  .wiz-step { flex: 1; height: 4px; background: var(--n-200); border-radius: 2px; transition: background 220ms; }
  .wiz-step.done { background: var(--atlas); }
  .wiz-step.active { background: var(--atlas); }
  .wiz-choice { border: 1px solid var(--n-200); border-radius: 14px; padding: 18px 18px; cursor: pointer; transition: all 160ms; display: flex; gap: 14px; align-items: flex-start; }
  .wiz-choice:hover { border-color: var(--atlas); background: #fff; }
  .wiz-choice.selected { border-color: var(--atlas); background: var(--mint-soft); }
  .wiz-choice .wc-ic { width: 40px; height: 40px; border-radius: 10px; background: var(--paper-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .wiz-choice .wc-t { font-weight: 600; font-size: 14.5px; letter-spacing: -0.01em; }
  .wiz-choice .wc-d { font-size: 13px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .wiz-choice.selected .wc-ic { background: var(--atlas); color: var(--mint); }

  /* Transaction detail */
  .tx-detail-hero { background: var(--paper-soft); border-radius: 14px; padding: 22px; margin-bottom: 20px; }
  .tx-detail-hero .amt { font-size: 40px; font-weight: 600; letter-spacing: -0.035em; line-height: 1; font-feature-settings: "tnum" 1; }
  .tx-detail-hero .status { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--atlas); }
  .tx-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 13.5px; }
  .tx-detail-grid dt { color: var(--n-500); padding: 8px 0; border-bottom: 1px solid var(--n-200); }
  .tx-detail-grid dd { margin: 0; padding: 8px 0; border-bottom: 1px solid var(--n-200); text-align: right; font-family: var(--mono); font-weight: 500; font-feature-settings: "tnum" 1; }
  .tx-timeline { margin-top: 24px; position: relative; padding-left: 24px; }
  .tx-timeline::before { content: ""; position: absolute; left: 7px; top: 4px; bottom: 4px; width: 2px; background: var(--n-200); }
  .tx-timeline-item { position: relative; padding: 8px 0 12px; font-size: 13px; }
  .tx-timeline-item::before { content: ""; position: absolute; left: -23px; top: 13px; width: 12px; height: 12px; border-radius: 50%; background: var(--atlas); border: 2px solid var(--paper); }
  .tx-timeline-item.last::before { background: var(--n-300); }
  .tx-timeline-item .t { font-family: var(--mono); font-size: 11px; color: var(--n-500); margin-bottom: 3px; }
  .tx-timeline-item .n { font-weight: 500; letter-spacing: -0.005em; }
  .tx-timeline-item .d { font-size: 12.5px; color: var(--n-500); margin-top: 2px; }

  /* Button base for modals */
  .kb { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-family: var(--sans); font-weight: 500; font-size: 14px; letter-spacing: -0.005em; cursor: pointer; transition: all 150ms; border: 1px solid transparent; }
  .kb.primary { background: var(--ink); color: var(--paper); }
  .kb.primary:hover { background: var(--atlas); }
  .kb.ghost { background: #fff; color: var(--ink); border-color: var(--n-200); }
  .kb.ghost:hover { border-color: var(--ink); }
  .kb.atlas { background: var(--atlas); color: var(--paper); }
  .kb.atlas:hover { background: var(--atlas-700); }
  .kb.danger { background: var(--danger); color: #fff; }

  /* Loading spinner */
  .kiwi-spinner { width: 18px; height: 18px; border: 2px solid rgba(11,110,79,0.2); border-top-color: var(--atlas); border-radius: 50%; animation: kiwi-spin 600ms linear infinite; display: inline-block; }
  @keyframes kiwi-spin { to { transform: rotate(360deg); } }

  /* AI drawer-ready for dynamic content */
  .ai-msg-user { background: var(--atlas); color: var(--paper); border-radius: 12px 12px 2px 12px; padding: 10px 14px; font-size: 13px; margin-bottom: 10px; margin-left: 32px; }
  .ai-msg-typing { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 14px; font-size: 13px; color: #d6dcd8; margin-bottom: 10px; display: inline-flex; gap: 5px; }
  .ai-msg-typing i { width: 6px; height: 6px; background: var(--mint); border-radius: 50%; animation: typing-bounce 1.2s infinite; }
  .ai-msg-typing i:nth-child(2) { animation-delay: 0.15s; }
  .ai-msg-typing i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.6; } 30% { transform: translateY(-5px); opacity: 1; } }
  `;

  /* ─────────── BOOTSTRAP STYLES + CONTAINERS ─────────── */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  function ensureToasts() {
    let c = document.querySelector('.kiwi-toasts');
    if (!c) { c = document.createElement('div'); c.className = 'kiwi-toasts'; document.body.appendChild(c); }
    return c;
  }

  /* ─────────── SVG ICONS ─────────── */
  const I = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5L20 7"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    danger: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
  };

  /* ═══════════════════════ TOAST ═══════════════════════ */
  function toast(title, {desc = '', type = 'success', duration = 3000, action = null} = {}) {
    const c = ensureToasts();
    const t = document.createElement('div');
    t.className = `kiwi-toast ${type}`;
    t.innerHTML = `
      <div class="ti">${I[type] || I.info}</div>
      <div class="tb">
        <div class="tm">${escape(title)}</div>
        ${desc ? `<div class="ts">${escape(desc)}</div>` : ''}
        ${action ? `<button class="ta">${escape(action.label)}</button>` : ''}
      </div>
      <button class="tx" aria-label="Fermer">×</button>
    `;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const dismiss = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 280); };
    const timer = setTimeout(dismiss, duration);
    t.querySelector('.tx').onclick = () => { clearTimeout(timer); dismiss(); };
    if (action) t.querySelector('.ta').onclick = () => { clearTimeout(timer); dismiss(); action.onClick?.(); };
  }

  /* ═══════════════════════ MODAL ═══════════════════════ */
  function modal({title = '', tag = '', desc = '', body = '', foot = '', width = 540}) {
    const back = document.createElement('div');
    back.className = 'kiwi-backdrop';
    back.innerHTML = `
      <div class="kiwi-modal" style="max-width:${width}px;">
        <button class="kiwi-modal-close" aria-label="Fermer">${I.close}</button>
        <div class="kiwi-modal-head">
          <div>
            ${tag ? `<div class="tag">${tag}</div>` : ''}
            <h3>${title}</h3>
            ${desc ? `<p>${desc}</p>` : ''}
          </div>
        </div>
        <div class="kiwi-modal-body">${body}</div>
        ${foot ? `<div class="kiwi-modal-foot">${foot}</div>` : ''}
      </div>
    `;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 280); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.kiwi-modal-close').onclick = close;
    return { close, el: back };
  }

  /* ═══════════════════════ DRAWER ═══════════════════════ */
  function drawer({title = '', subtitle = '', body = '', foot = '', width = 420}) {
    const back = document.createElement('div');
    back.className = 'kiwi-drawer-backdrop';
    back.innerHTML = `
      <div class="kiwi-drawer" style="width:${width}px;">
        <div class="kiwi-drawer-head">
          <div>
            <h3>${title}</h3>
            ${subtitle ? `<p>${subtitle}</p>` : ''}
          </div>
          <button class="kiwi-drawer-close" aria-label="Fermer">${I.close}</button>
        </div>
        <div class="kiwi-drawer-body">${body}</div>
        ${foot ? `<div class="kiwi-drawer-foot">${foot}</div>` : ''}
      </div>
    `;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 280); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.kiwi-drawer-close').onclick = close;
    return { close, el: back };
  }

  /* ═══════════════════════ MENU (dropdown near anchor) ═══════════════════════ */
  function menu(anchor, items) {
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'kiwi-menu';
    m.style.top = `${r.bottom + 6 + window.scrollY}px`;
    m.style.left = `${r.left + window.scrollX}px`;
    m.innerHTML = items.map(it => it.head ? `<div class="kiwi-menu-head">${escape(it.head)}</div>` : it.sep ? `<div class="kiwi-menu-sep"></div>` : `<div class="kiwi-menu-item ${it.danger?'danger':''} ${it.active?'active':''}" data-idx="${items.indexOf(it)}">${it.icon || ''}<span>${escape(it.label)}</span></div>`).join('');
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('in'));
    const close = () => { m.classList.remove('in'); setTimeout(() => m.remove(), 180); document.removeEventListener('click', outside, true); };
    const outside = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('click', outside, true), 10);
    m.querySelectorAll('.kiwi-menu-item').forEach(el => {
      el.onclick = () => {
        const it = items[+el.dataset.idx];
        close();
        it.onClick?.();
      };
    });
    return close;
  }

  /* ═══════════════════════ CONFETTI ═══════════════════════ */
  function confetti() {
    const c = document.createElement('div');
    c.className = 'kiwi-confetti';
    const colors = ['#0B6E4F', '#7DF2B0', '#053B2C', '#C9F6DC', '#D99A2B'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = '-5vh';
      s.style.background = colors[Math.floor(Math.random() * colors.length)];
      s.style.animationDelay = Math.random() * 0.3 + 's';
      s.style.animationDuration = (1.6 + Math.random() * 0.8) + 's';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.appendChild(s);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }

  /* ═══════════════════════ COMMAND PALETTE ═══════════════════════ */
  function commandPalette() {
    if (document.querySelector('.kp')) return;
    const back = document.createElement('div');
    back.className = 'kiwi-backdrop';
    back.style.background = 'rgba(10,15,13,0.45)';
    const kp = document.createElement('div');
    kp.className = 'kp';
    const items = [
      { sect: 'NAVIGATION' },
      { icon: '📊', label: 'Tableau de bord', sub: 'Vue principale', href: 'dashboard.html', kbd: 'G A' },
      { icon: '💳', label: 'Transactions', sub: '182 aujourd\'hui', action: () => toast('Page transactions', {type: 'info'}), kbd: 'G T' },
      { icon: '🏦', label: 'Règlements', sub: 'Prochain · demain 9h00', action: () => toast('Règlements — 23 091 MAD demain', {type: 'info'}), kbd: 'G R' },
      { icon: '👥', label: 'Équipe', sub: '8 membres', action: () => toast('Page équipe', {type: 'info'}), kbd: 'G E' },
      { sect: 'ACTIONS RAPIDES' },
      { icon: '➕', label: 'Nouvelle vente', sub: 'Encaisser un montant', action: () => handlers['new-sale']() },
      { icon: '↩', label: 'Rembourser une transaction', action: () => toast('Sélectionnez une transaction', {type: 'info'}) },
      { icon: '📧', label: 'Envoyer résumé par WhatsApp', action: () => toast('Résumé envoyé · +212 6 xx xx xx xx', {type: 'success'}) },
      { icon: '⚡', label: 'Régler instantanément', sub: '1,50 MAD · ~10s', action: () => handlers['instant-settle']() },
      { icon: '📤', label: 'Exporter les transactions', action: () => handlers.export() },
      { sect: 'RESTAURATION' },
      { icon: '🍽️', label: 'Ouvrir plan de salle', action: () => toast('Tables · 6 occupées · 2 libres', {type: 'info'}) },
      { icon: '📋', label: 'Modifier le menu', action: () => toast('Éditeur de menu', {type: 'info'}) },
      { icon: '🧾', label: 'Fermeture de service', action: () => toast('Clôture initiée…', {type: 'info'}) },
      { sect: 'AIDE' },
      { icon: '💬', label: 'Contacter le support WhatsApp', action: () => toast('Redirection WhatsApp…', {type: 'info', desc: '+212 5 22 xx xx xx'}) },
      { icon: '📚', label: 'Documentation', action: () => toast('docs.kiwi.ma', {type: 'info'}) },
    ];
    renderKp();

    function renderKp(q = '') {
      const filtered = items.filter(it => it.sect || !q || it.label.toLowerCase().includes(q.toLowerCase()));
      kp.innerHTML = `
        <div class="kp-head">
          <span style="color:var(--n-500);">${I.search}</span>
          <input type="text" placeholder="Rechercher transactions, produits, équipe, actions…" autofocus />
          <span style="font-family:var(--mono); font-size:10.5px; background:var(--n-100); padding:3px 8px; border-radius:5px; color:var(--n-500);">ESC</span>
        </div>
        <div class="kp-list">
          ${filtered.map(it => it.sect ? `<div class="kp-sect">${it.sect}</div>` : `
            <div class="kp-item" data-idx="${items.indexOf(it)}">
              <div class="kpi-ic" style="font-size:14px;">${it.icon}</div>
              <div style="flex:1;">
                <div class="kpi-t">${it.label}</div>
                ${it.sub ? `<div class="kpi-s">${it.sub}</div>` : ''}
              </div>
              ${it.kbd ? `<div class="kpi-k">${it.kbd}</div>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="kp-foot">
          <span><kbd>↑↓</kbd> naviguer</span>
          <span><kbd>↵</kbd> sélectionner</span>
          <span>Kiwi ⌘K</span>
        </div>
      `;
      kp.querySelector('input').oninput = (e) => renderKp(e.target.value);
      kp.querySelectorAll('.kp-item').forEach(el => {
        el.onclick = () => {
          const it = items[+el.dataset.idx];
          close();
          if (it.href) location.href = it.href;
          else it.action?.();
        };
      });
    }

    back.appendChild(kp);
    document.body.appendChild(back);
    requestAnimationFrame(() => { back.classList.add('in'); kp.classList.add('in'); kp.querySelector('input')?.focus(); });
    const close = () => { back.classList.remove('in'); kp.classList.remove('in'); setTimeout(() => back.remove(), 220); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
  }

  /* ═══════════════════════ HANDLERS ═══════════════════════ */
  const handlers = {

    'signup': () => {
      let step = 0;
      let business = 'resto';
      const steps = ['Type de commerce', 'Identité', 'Activation'];
      const m = modal({
        tag: 'INSCRIPTION',
        title: 'Commençons par vous connaître.',
        desc: 'Votre compte Kiwi est activé en 3 minutes, directement depuis ce site.',
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
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; text-transform:uppercase; font-family:var(--mono); margin-bottom:10px;">ÉTAPE ${step + 1} / 3 · ${steps[step]}</div>
          ${step === 0 ? step0() : step === 1 ? step1() : step2()}
          <div style="display:flex; justify-content:space-between; margin-top:22px; gap:10px;">
            <button class="kb ghost" data-prev ${step === 0 ? 'disabled style="opacity:0.4;"' : ''}>← Retour</button>
            <button class="kb primary" data-next>${step === 2 ? 'Terminer l\'inscription ✓' : 'Continuer →'}</button>
          </div>
        `;
      }
      function step0() {
        return `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="wiz-choice ${business==='resto'?'selected':''}" data-biz="resto">
              <div class="wc-ic">🍽️</div>
              <div><div class="wc-t">Restaurant / café</div><div class="wc-d">Plan de salle, tables, split bill, ticket cuisine inclus.</div></div>
            </div>
            <div class="wiz-choice ${business==='retail'?'selected':''}" data-biz="retail">
              <div class="wc-ic">🛒</div>
              <div><div class="wc-t">Commerce de détail</div><div class="wc-d">Épicerie, boutique, pharmacie — caisse rapide avec inventaire.</div></div>
            </div>
            <div class="wiz-choice ${business==='services'?'selected':''}" data-biz="services">
              <div class="wc-ic">✂️</div>
              <div><div class="wc-t">Services</div><div class="wc-d">Salon de coiffure, beauté, VTC — prise de rdv + encaissement.</div></div>
            </div>
            <div class="wiz-choice ${business==='other'?'selected':''}" data-biz="other">
              <div class="wc-ic">💼</div>
              <div><div class="wc-t">Autre activité</div><div class="wc-d">Notre équipe vous recommande la meilleure configuration.</div></div>
            </div>
          </div>
        `;
      }
      function step1() {
        return `
          <div class="kf-group">
            <label class="kf-label">Nom de la boutique</label>
            <input class="kf-input" placeholder="Ex. Café Atlas" value="Café Atlas" />
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">Prénom</label>
              <input class="kf-input" placeholder="Rachid" value="Rachid" />
            </div>
            <div class="kf-group">
              <label class="kf-label">Nom</label>
              <input class="kf-input" placeholder="Benhima" value="Benhima" />
            </div>
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">Téléphone marocain</label>
              <input class="kf-input" placeholder="+212 6 xx xx xx xx" />
            </div>
            <div class="kf-group">
              <label class="kf-label">Ville</label>
              <input class="kf-input" placeholder="Casablanca" value="Casablanca" />
            </div>
          </div>
          <div class="kf-help">🔒 Vos données restent hébergées au Maroc. KYC automatique via votre CIN à l'étape suivante.</div>
        `;
      }
      function step2() {
        return `
          <div style="text-align:center; padding:10px 0 20px;">
            <div style="width:70px; height:70px; margin:0 auto 16px; border-radius:22px; background:var(--atlas); color:var(--mint); display:flex; align-items:center; justify-content:center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <h3 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; margin:0 0 8px;">Votre compte Kiwi est prêt.</h3>
            <p style="color:var(--n-600); font-size:14px; margin:0 auto; max-width:380px;">Vous recevez votre terminal PAX A920 gratuitement sous 48h. En attendant, commencez à encaisser dès maintenant sur votre téléphone.</p>
          </div>
          <div style="background:var(--paper-soft); border-radius:12px; padding:16px; display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">ABONNEMENT</div><b style="font-size:18px;">399 MAD/mois</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">RÈGLEMENT</div><b style="font-size:18px;">T+1 auto</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">MATÉRIEL</div><b style="font-size:18px;">Offert</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">ENGAGEMENT</div><b style="font-size:18px;">Aucun</b></div>
          </div>
        `;
      }
      m.el.addEventListener('click', (e) => {
        const biz = e.target.closest('[data-biz]');
        if (biz) { business = biz.dataset.biz; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        if (e.target.closest('[data-next]')) {
          if (step < 2) { step++; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
          else { m.close(); confetti(); toast('Compte Kiwi créé · RC en cours de vérification', {type: 'success', desc: 'Un conseiller vous contacte dans 2 heures sur WhatsApp.'}); }
        }
        if (e.target.closest('[data-prev]')) {
          if (step > 0) { step--; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        }
      });
    },

    'login': () => {
      modal({
        title: 'Se connecter à Kiwi',
        desc: 'Accédez à votre tableau de bord commerçant.',
        width: 440,
        body: `
          <div class="kf-group">
            <label class="kf-label">Email ou téléphone</label>
            <input class="kf-input" placeholder="rachid@cafeatlas.ma" />
          </div>
          <div class="kf-group">
            <label class="kf-label">Mot de passe</label>
            <input class="kf-input" type="password" placeholder="••••••••" />
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-top:8px;">
            <label style="display:flex; gap:6px; color:var(--n-600);"><input type="checkbox" checked/> Se souvenir de moi</label>
            <a href="#" style="color:var(--atlas); font-weight:500;">Mot de passe oublié ?</a>
          </div>
          <button class="kb primary" style="width:100%; justify-content:center; margin-top:18px; padding:12px;" data-login-go>Se connecter →</button>
          <div style="text-align:center; margin-top:14px; font-size:13px; color:var(--n-500);">Pas encore de compte ? <a href="#" data-to-signup style="color:var(--atlas); font-weight:500;">Créer un compte Kiwi</a></div>
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

    'notifications': () => drawer({
      title: 'Notifications',
      subtitle: '3 non lues · 12 cette semaine',
      body: `
        <div class="notif unread">
          <div class="n-ico" style="background:#E3F7EC; color:var(--atlas);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg></div>
          <div class="n-body">
            <div class="n-title">Règlement prêt : 23 091 MAD</div>
            <div class="n-desc">Votre règlement du 24 avril sera déposé demain matin à 9h00 sur BMCE ••3291.</div>
            <div class="n-time">Il y a 12 min</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:#FFF4DD; color:#8A6210;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div class="n-body">
            <div class="n-title">Terminal Terrasse hors-ligne</div>
            <div class="n-desc">PAX A920 #2832 n'a pas de signal depuis 09:18. Vérifiez le Wi-Fi ou basculez en 4G.</div>
            <div class="n-time">Il y a 1 h</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:#E3F0F7; color:var(--info);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg></div>
          <div class="n-body">
            <div class="n-title">Kiwi AI · Suggestion</div>
            <div class="n-desc">Votre pic samedi soir génère +34 % vs moyenne. Ajoutez un 2e serveur ?</div>
            <div class="n-time">Il y a 2 h</div>
          </div>
        </div>
        <div class="notif">
          <div class="n-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/></svg></div>
          <div class="n-body">
            <div class="n-title">182 transactions hier</div>
            <div class="n-desc">Total 20 656 MAD · commission 246 MAD · pourboires 1 412 MAD.</div>
            <div class="n-time">Hier, 23:45</div>
          </div>
        </div>
        <div class="notif">
          <div class="n-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12l-2-2m-6 6l-6 6H4v-4l6-6m4-4l6-6 4 4-6 6-4-4z"/></svg></div>
          <div class="n-body">
            <div class="n-title">Fatima Khalki a signé 14h de service</div>
            <div class="n-desc">Bilan hebdo équipe prêt pour consultation.</div>
            <div class="n-time">Hier, 21:00</div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" style="width:100%; justify-content:center;" data-mark-read>Marquer tout comme lu</button>
      `
    }),

    'settings': () => drawer({
      title: 'Paramètres',
      subtitle: 'Compte · boutique · conformité',
      width: 460,
      body: `
        <div style="margin-bottom:20px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-weight:500; font-family:var(--mono); margin-bottom:10px;">PRÉFÉRENCES</div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${settingsRow('🌍', 'Langue', 'Français · Darija · العربية')}
            ${settingsRow('🌓', 'Mode sombre', 'Automatique selon système')}
            ${settingsRow('🔔', 'Notifications WhatsApp', 'Résumé quotidien 19h')}
            ${settingsRow('💰', 'Devise d\'affichage', 'MAD · Dirham marocain')}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-weight:500; font-family:var(--mono); margin-bottom:10px;">BOUTIQUE</div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${settingsRow('🏪', 'Café Atlas · Maarif', 'Emplacement principal')}
            ${settingsRow('⏰', 'Heures d\'ouverture', '07:00 - 23:00 · tous les jours')}
            ${settingsRow('💳', 'Méthodes acceptées', 'Visa · MC · Kiwi Tap · QR')}
            ${settingsRow('🎯', 'Objectif journalier', '28 000 MAD')}
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-weight:500; font-family:var(--mono); margin-bottom:10px;">CONFORMITÉ & SÉCURITÉ</div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${settingsRow('🛡️', 'Authentification 2FA', 'SMS activé', true)}
            ${settingsRow('🔐', 'PCI-DSS', 'Certification valide 2026', true)}
            ${settingsRow('📋', 'KYC', 'Vérifié le 12 mars 2026', true)}
            ${settingsRow('🏛️', 'Bank Al-Maghrib', 'Sponsoring actif', true)}
          </div>
        </div>
        <div>
          <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); font-weight:500; font-family:var(--mono); margin-bottom:10px;">INTÉGRATIONS</div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            ${settingsRow('🟠', 'Glovo', 'Connecté · 1 420 MAD aujourd\'hui', true)}
            ${settingsRow('🔴', 'Jumia Food', 'Connecté · 24 commandes', true)}
            ${settingsRow('📊', 'Comptabilité', 'Export quotidien OCP', true)}
            ${settingsRow('🏦', 'BMCE Banque', 'IBAN vérifié ••3291', true)}
          </div>
        </div>
      `,
    }),

    'export': () => {
      toast('Préparation de l\'export…', { type: 'info', duration: 1600 });
      setTimeout(() => {
        toast('Export CSV prêt', { type: 'success', desc: '182 transactions · 24 avril 2026', action: { label: 'Télécharger', onClick: () => toast('Téléchargement démarré', {type:'info'}) } });
      }, 1800);
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
            <div style="font-size:64px; font-weight:600; letter-spacing:-0.045em; font-feature-settings:'tnum' 1; line-height:1;" data-amt>0<span style="font-size:22px; color:var(--n-400); margin-left:6px;">MAD</span></div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
            ${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(n => `<button class="kb ghost" style="padding:18px; font-size:19px; font-weight:500; justify-content:center;" data-key="${n}">${n}</button>`).join('')}
          </div>
          <div style="margin-top:18px; display:flex; flex-direction:column; gap:8px;">
            <button class="kb atlas" style="padding:14px; justify-content:center; font-size:15px;" data-method="card">Encaisser par carte · Tap ou dip</button>
            <button class="kb ghost" style="padding:14px; justify-content:center; font-size:15px;" data-method="qr">Afficher QR Kiwi Wallet</button>
            <button class="kb ghost" style="padding:14px; justify-content:center; font-size:15px;" data-method="link">Envoyer un lien de paiement</button>
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
          m.el.querySelector('[data-amt]').innerHTML = `${amount || '0'}<span style="font-size:22px; color:var(--n-400); margin-left:6px;">MAD</span>`;
        }
        const met = e.target.closest('[data-method]');
        if (met) {
          if (!amount) { toast('Saisissez un montant', {type: 'warn'}); return; }
          m.close();
          const method = met.dataset.method;
          if (method === 'card') toast(`En attente de la carte · ${amount} MAD`, {type: 'info', desc: 'Présentez la carte au terminal ou téléphone'});
          if (method === 'qr') toast(`QR généré · ${amount} MAD`, {type: 'info', desc: 'Client scanne depuis Kiwi Wallet'});
          if (method === 'link') toast('Lien de paiement copié', {type: 'success', desc: 'Envoyez-le par WhatsApp à votre client'});
        }
      });
    },

    'instant-settle': () => {
      const m = modal({
        tag: 'RÈGLEMENT INSTANTANÉ',
        title: 'Recevoir 23 091 MAD en ~10 secondes',
        desc: 'Via Virement Instantané Bank Al-Maghrib. Frais : 1,50 MAD.',
        body: `
          <div style="background:var(--atlas); color:var(--paper); border-radius:14px; padding:22px; margin-bottom:18px;">
            <div style="font-size:11px; color:var(--mint); letter-spacing:0.1em; font-family:var(--mono);">VOUS ALLEZ RECEVOIR</div>
            <div style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; margin-top:6px; font-feature-settings:'tnum' 1;">23 089,50 <span style="font-size:18px; opacity:0.7;">MAD</span></div>
            <div style="font-size:13px; color:#c6ead4; margin-top:10px;">Sur BMCE ••3291 · d'ici 10 secondes</div>
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
          toast('Règlement en cours…', {type: 'info', duration: 2000});
          setTimeout(() => toast('23 089,50 MAD crédités sur BMCE ••3291', {type: 'success', desc: 'Virement Instantané exécuté en 8,4 s'}), 2200);
        }
      });
    },

    'tx-detail': (el, arg) => {
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
              <div class="d">Inclus dans le batch de 23 089,50 MAD → BMCE ••3291</div>
            </div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-refund>Rembourser partiellement</button>
          <button class="kb ghost" data-print>Renvoyer le reçu</button>
          <button class="kb primary" data-dismiss>Fermer</button>
        `
      });
      document.body.addEventListener('click', function once(e) {
        if (e.target.closest('[data-refund]')) { document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click(); setTimeout(() => toast('Choisir montant à rembourser', {type:'info'}), 220); }
        if (e.target.closest('[data-print]')) toast('Reçu envoyé par WhatsApp à Karim B.', {type:'success'});
        if (e.target.closest('[data-dismiss]')) document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click();
        document.body.removeEventListener('click', once);
      });
    },

    'upgrade-pro': () => modal({
      tag: 'KIWI PRO',
      title: 'Passez à Pro pour 300 MAD de plus par mois.',
      desc: 'Multi-terminal, routing par sous-catégorie, gestion stock, API et intégrations.',
      width: 560,
      body: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div style="padding:20px; background:var(--paper-soft); border-radius:14px;">
            <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; font-family:var(--mono);">KIWI BASIC</div>
            <div style="font-size:28px; font-weight:600; letter-spacing:-0.025em; margin-top:4px;">399 MAD<span style="font-size:13px; opacity:0.7;">/mois</span></div>
            <div style="font-size:12.5px; color:var(--n-500); margin-top:4px;">Matériel offert · tout inclus</div>
            <ul style="list-style:none; padding:0; margin:14px 0 0; font-size:13px; color:var(--n-700); line-height:1.9;">
              <li>✓ Caisse restaurant</li>
              <li>✓ Règlement T+1</li>
              <li>✓ Support WhatsApp</li>
              <li>✓ 8 membres staff max</li>
            </ul>
          </div>
          <div style="padding:20px; background:var(--atlas); color:var(--paper); border-radius:14px; position:relative;">
            <div style="position:absolute; top:-10px; right:14px; background:var(--mint); color:var(--riad); font-size:10px; font-weight:700; padding:4px 10px; border-radius:999px; letter-spacing:0.05em;">RECOMMANDÉ</div>
            <div style="font-size:11px; color:var(--mint); letter-spacing:0.08em; font-family:var(--mono);">KIWI PRO</div>
            <div style="font-size:28px; font-weight:600; letter-spacing:-0.025em; margin-top:4px;">699 MAD<span style="font-size:13px; opacity:0.7;">/mois</span></div>
            <div style="font-size:12.5px; color:#c6ead4; margin-top:4px;">Multi-terminal · multi-site</div>
            <ul style="list-style:none; padding:0; margin:14px 0 0; font-size:13px; color:#d0eed9; line-height:1.9;">
              <li>✓ Routing par sous-catégorie</li>
              <li>✓ Équipe illimitée</li>
              <li>✓ Gestion stock ingrédients</li>
              <li>✓ Analytics avancés + API</li>
              <li>✓ Support prioritaire</li>
            </ul>
          </div>
        </div>
        <div style="margin-top:18px; padding:16px; background:var(--mint-soft); border-radius:12px; font-size:13px; display:flex; gap:10px;">
          <div>💡</div>
          <div style="flex:1;"><b>Quand passer à Pro :</b> dès qu'on ouvre une seconde zone de préparation (Crêpes Bar, Pâtisserie, Terrasse dédiée) ou qu'on dépasse 8 membres d'équipe.</div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Plus tard</button>
        <button class="kb atlas" data-upgrade>Passer à Pro maintenant →</button>
      `
    }),

    'add-integration': () => drawer({
      title: 'Ajouter une intégration',
      subtitle: 'Connectez vos outils favoris',
      body: `
        <input class="kf-input" placeholder="Rechercher une intégration…" style="margin-bottom:16px;" />
        ${['Careem','inDrive','Toptal','Yassir','Fenix','Wafacash','Inwi Money','Orange Money','Odoo','QuickBooks','Bank of Africa','CIH','AttijariWafa'].map(n => `
          <div class="notif" style="border-radius:10px; padding:12px; cursor:pointer;">
            <div class="n-ico" style="font-weight:700; color:var(--atlas); background:var(--paper-soft);">${n.charAt(0)}</div>
            <div class="n-body"><div class="n-title">${n}</div><div class="n-desc">Connexion en un clic via API officielle</div></div>
          </div>
        `).join('')}
      `
    }),

    'location-switch': (el) => menu(el, [
      { head: 'EMPLACEMENTS' },
      { label: 'Café Atlas · Maarif', active: true, icon: '<div style="width:18px; height:18px; background:var(--atlas); border-radius:5px;"></div>' },
      { label: 'Café Atlas · Agdal (Rabat)', icon: '<div style="width:18px; height:18px; background:var(--riad); border-radius:5px;"></div>' },
      { label: 'Café Atlas · Marrakech', icon: '<div style="width:18px; height:18px; background:#D99A2B; border-radius:5px;"></div>' },
      { sep: true },
      { label: '+ Ajouter un emplacement', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>', onClick: () => toast('Assistant de nouvel emplacement', {type:'info'}) },
      { label: 'Paramètres multi-boutiques', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>', onClick: () => handlers.settings() },
    ]),

    'profile-menu': (el) => menu(el, [
      { head: 'RACHID BENHIMA' },
      { label: 'Mon profil', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/></svg>', onClick: () => toast('Profil ouvert', {type:'info'}) },
      { label: 'Paramètres', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>', onClick: () => handlers.settings() },
      { label: 'Facturation', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>', onClick: () => toast('Historique factures Kiwi', {type:'info'}) },
      { sep: true },
      { label: 'Centre d\'aide', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>', onClick: () => toast('help.kiwi.ma', {type:'info'}) },
      { label: 'Se déconnecter', danger: true, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>', onClick: () => { toast('Déconnexion…', {type:'info'}); setTimeout(() => location.href = 'index.html', 800); } },
    ]),

    'download-app': () => {
      const m = modal({
        title: 'Télécharger Kiwi Wallet',
        desc: 'Scannez le QR ou recevez le lien par SMS.',
        width: 440,
        body: `
          <div style="display:flex; gap:20px; align-items:center; margin:14px 0 18px;">
            <div style="width:140px; height:140px; border-radius:14px; background:var(--ink); padding:10px; flex-shrink:0;">
              <div style="background:var(--paper); width:100%; height:100%; border-radius:6px; background-image: repeating-linear-gradient(0deg, var(--ink) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px);"></div>
            </div>
            <div style="flex:1;">
              <div style="font-weight:600; font-size:16px; letter-spacing:-0.015em;">Scannez avec votre iPhone ou Android.</div>
              <div style="font-size:13px; color:var(--n-500); margin-top:8px; line-height:1.5;">L'app s'installe automatiquement. Votre Kiwi Wallet est prêt en 30 secondes.</div>
            </div>
          </div>
          <div style="padding-top:16px; border-top:1px solid var(--n-200);">
            <div class="kf-label">Ou recevez le lien par SMS</div>
            <div style="display:flex; gap:8px;">
              <input class="kf-input" placeholder="+212 6 xx xx xx xx" style="flex:1;" />
              <button class="kb atlas" data-sms>Envoyer</button>
            </div>
          </div>
        `
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-sms]')) { m.close(); toast('SMS envoyé', {type:'success', desc:'Ouvrez le lien pour installer Kiwi Wallet'}); }
      });
    },

    'download-kit': () => {
      toast('Préparation du kit de marque…', {type:'info', duration:1500});
      setTimeout(() => toast('Kit téléchargé', {type:'success', desc:'Logo · Palette · Typographies · Mockups · 24 Mo'}), 1700);
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
        typing.innerHTML = aiResponses[txt] || `<b>Kiwi AI :</b> ${txt} — exécuté. Consultez les détails dans l'onglet correspondant.`;
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
      toast('Téléchargement du deck…', {type:'info', duration: 1400});
      setTimeout(() => toast('Deck PDF envoyé', {type:'success', desc:'NDA inclus · valable 48 h'}), 1600);
    },

    'kpi-detail': (el, arg) => drawer({
      title: kpiData[arg]?.title || 'Métrique',
      subtitle: kpiData[arg]?.subtitle || 'Analyse détaillée · 30 jours',
      width: 540,
      body: kpiData[arg]?.body || `<div style="color:var(--n-500); padding:20px 0;">Analyse détaillée disponible ici.</div>`,
      foot: kpiData[arg]?.foot || '',
    }),

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

  /* ─── Helpers for rendering ─── */
  function settingsRow(emoji, label, value, toggle = false) {
    return `<div style="display:flex; align-items:center; gap:12px; padding:11px 4px; border-bottom:1px solid var(--n-200); cursor:pointer; transition:background 100ms;"><div style="width:28px; text-align:center; font-size:16px;">${emoji}</div><div style="flex:1;"><div style="font-size:13.5px; font-weight:500;">${label}</div><div style="font-size:12px; color:var(--n-500); margin-top:1px;">${value}</div></div>${toggle ? '<div style="width:34px; height:20px; background:var(--atlas); border-radius:999px; position:relative;"><div style="position:absolute; top:2px; right:2px; width:16px; height:16px; background:#fff; border-radius:50%;"></div></div>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--n-400)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'}</div>`;
  }

  function escape(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ─── Demo data ─── */
  const txData = {
    'tx1': { id: 'TXN-28410398281', method: 'Visa •• 4291', amount: '240,00 MAD', status: 'Réglé · en attente de règlement', date: '24 avril 2026 14:32', network: 'Visa', customer: 'Karim B. (régulier)', table: 'T4', cart: 'Tajine kefta · Thé menthe × 2', tip: '24,00 MAD (10%)', fee: 'Inclus · abonnement Kiwi', net: '240,00 MAD', card: 'Visa •• 4291', issuer: 'Attijariwafa Bank', country: '🇲🇦 Maroc', staff: 'Fatima Khalki' },
    'default': { id: 'TXN-0000', method: 'Paiement carte', amount: '180,00 MAD', status: 'Réglé', date: '24 avril 2026', network: 'Carte', customer: 'Client', table: '—', cart: '—', tip: '—', fee: 'Inclus · abonnement Kiwi', net: '180,00 MAD', card: '••••', issuer: '—', country: '—', staff: '—' }
  };

  /* ─── KPI detail drawer content (one rich view per metric) ─── */
  // Shared style helpers for inline composition
  const kpiHero = (big, sub, deltaTxt, deltaCls = 'good') => `
    <div style="display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:6px;">
      <div style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; font-feature-settings:'tnum' 1;">${big}</div>
      ${deltaTxt ? `<div style="font-size:13px; font-weight:500; color:var(--${deltaCls === 'good' ? 'success' : deltaCls === 'warn' ? 'warning' : 'n-500'});">${deltaTxt}</div>` : ''}
    </div>
    <div style="font-size:13px; color:var(--n-500); margin-bottom:22px;">${sub}</div>
  `;
  const kpiSection = (label, body) => `
    <div style="margin-bottom:18px;">
      <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${label}</div>
      ${body}
    </div>
  `;
  const kpiInsight = (text) => `
    <div style="padding:14px 16px; background:var(--atlas); color:var(--paper); border-radius:12px; display:flex; gap:12px; font-size:13px; line-height:1.45; margin-top:6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:var(--mint); flex-shrink:0; margin-top:2px;"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></svg>
      <div>${text}</div>
    </div>
  `;
  const kpiRow = (left, right, sub = '') => `
    <div style="display:grid; grid-template-columns:1fr auto; gap:12px; padding:10px 0; border-top:1px solid var(--n-200); font-size:13.5px; align-items:center;">
      <div><div style="font-weight:500;">${left}</div>${sub ? `<div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${sub}</div>` : ''}</div>
      <div style="font-family:var(--mono); font-weight:500; font-size:12.5px;">${right}</div>
    </div>
  `;
  const kpiFootBtns = (ghostLabel, atlasLabel) => `
    <button class="kb ghost" data-dismiss style="flex:1; justify-content:center;">${ghostLabel}</button>
    <button class="kb atlas" style="flex:1; justify-content:center;">${atlasLabel}</button>
  `;

  const kpiData = {
    /* ════════ Transactions ════════ */
    'tx': {
      title: 'Transactions',
      subtitle: 'Vendredi 24 avril · service en cours',
      foot: kpiFootBtns('Fermer', 'Voir le journal complet →'),
      body: `
        ${kpiHero('182', 'Pic à 13h00 · 24 transactions sur l\'heure', '↑ +24 vs hier (+15 %)')}
        ${kpiSection('RÉPARTITION HORAIRE', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            <div style="display:flex; align-items:end; gap:4px; height:80px;">
              ${[4,6,9,12,18,24,21,13,10,9,13,18,25].map(n => {
                const peak = n >= 18;
                return `<div style="flex:1; background:${peak ? 'var(--atlas)' : '#B9E5CC'}; height:${(n/25)*100}%; border-radius:3px 3px 0 0; min-height:5px; transition:opacity 200ms;" title="${n} tx"></div>`;
              }).join('')}
            </div>
            <div style="display:flex; gap:4px; margin-top:8px; font-family:var(--mono); font-size:9.5px; color:var(--n-500);">
              ${['8h','9h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'].map(t => `<span style="flex:1; text-align:center;">${t}</span>`).join('')}
            </div>
          </div>
        `)}
        ${kpiSection('PAR SERVEUR', [
          ['Sofia Belkadi', 'barista · comptoir', '54 tx · 23 800 MAD'],
          ['Fatima Khalki', 'serveuse · salle', '42 tx · 18 200 MAD'],
          ['Hamid Jelloul', 'serveur · terrasse', '38 tx · 16 500 MAD'],
          ['Youssef Amrani', 'serveur · 17h-23h', '25 tx · 11 200 MAD'],
          ['Auto-caisse', 'sans contact', '23 tx · 4 800 MAD'],
        ].map(([n, role, v]) => kpiRow(n, v, role)).join(''))}
        ${kpiInsight(`<b style="color:var(--mint);">Insight :</b> Sofia transforme 54 % de plus que la moyenne salle. Lui assigner les tables T1-T3 ce soir pourrait ajouter ~2 400 MAD au service.`)}
      `
    },

    /* ════════ Panier moyen ════════ */
    'panier': {
      title: 'Panier moyen',
      subtitle: '24 dernières heures · tous canaux',
      foot: kpiFootBtns('Fermer', 'Activer recommandations IA →'),
      body: `
        ${kpiHero('134 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', 'Médiane 95 MAD · max 1 240 MAD (anniversaire T8)', '≈ stable vs hier', 'neutral')}
        ${kpiSection('DISTRIBUTION DES TICKETS', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['< 50 MAD',   38, '#B9E5CC'],
              ['50-100',     54, '#7FD4A4'],
              ['100-200',    58, 'var(--atlas)'],
              ['200-400',    24, '#B9E5CC'],
              ['> 400',       8, 'var(--mint-soft)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:80px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:#fff; border-radius:4px; overflow:hidden;"><div style="width:${(n/58)*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:right; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection('SEGMENTATION', [
          ['Clients réguliers', '47 clients · ticket moyen', '186 MAD'],
          ['Clients occasionnels', '108 clients · ticket moyen', '128 MAD'],
          ['Touristes (carte étrangère)', '27 clients · ticket moyen', '184 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight(`<b style="color:var(--mint);">Insight :</b> Vos réguliers dépensent <b>+45 %</b> vs occasionnels. Les recommandations IA en fin de commande (« +1 thé pour 12 MAD ») peuvent lever le ticket moyen de <b>~12 %</b>.`)}
      `
    },

    /* ════════ Pourboires ════════ */
    'tips': {
      title: 'Pourboires',
      subtitle: 'Cumul du jour · à distribuer en fin de service',
      foot: kpiFootBtns('Fermer', 'Distribuer maintenant →'),
      body: `
        ${kpiHero('1 867 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', '7,6 % du chiffre encaissé · taux moyen 8,2 %', '↑ +32 % vs semaine')}
        ${kpiSection('PROMPT POURBOIRE', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <div>
              <div style="font-weight:500; font-size:13.5px;">Prompt auto +10 %</div>
              <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">Affiché sur 78 % des tickets aujourd'hui · taux d'acceptation 64 %</div>
            </div>
            <div style="width:38px; height:22px; background:var(--atlas); border-radius:999px; position:relative;">
              <div style="position:absolute; top:2px; right:2px; width:18px; height:18px; background:#fff; border-radius:50%;"></div>
            </div>
          </div>
        `)}
        ${kpiSection('PAR SERVEUR', [
          ['Sofia Belkadi', 'taux 11,2 %', '+654 MAD'],
          ['Fatima Khalki', 'taux 8,8 %', '+560 MAD'],
          ['Hamid Jelloul', 'taux 7,4 %', '+467 MAD'],
          ['Youssef Amrani', 'taux 5,1 %', '+186 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection('PAR PÉRIODE', [
          ['Petit-déj 8h-11h', '1,8 % de taux', '+120 MAD'],
          ['Déjeuner 12h-15h', '7,4 % de taux', '+820 MAD'],
          ['Goûter 15h-18h', '4,2 % de taux', '+92 MAD'],
          ['Dîner 19h-23h', '11,8 % de taux', '+835 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight(`<b style="color:var(--mint);">Insight :</b> Le taux du soir est <b>~3×</b> celui du midi. Activer un prompt « +15 % » spécifique après 20h pourrait ajouter <b>~280 MAD/soir</b>.`)}
      `
    },

    /* ════════ Taux de succès ════════ */
    'success': {
      title: 'Taux de succès',
      subtitle: 'Conformité réseau et passerelle Bank Al-Maghrib',
      foot: kpiFootBtns('Fermer', 'Voir les échecs →'),
      body: `
        ${kpiHero('99,32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', '184 tentatives · 183 succès · 1 échec', '↑ +0,2 pt vs hier')}
        ${kpiSection('BENCHMARK MARCHÉ', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['Café Atlas (vous)',   99.32, 'var(--atlas)'],
              ['Cafés Casa moyenne',  99.00, '#7FD4A4'],
              ['CMI traditionnel',    98.10, '#A8A49A'],
              ['Standard PCI-DSS',    97.50, 'var(--n-300)'],
            ].map(([lbl, pct, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 50px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:#fff; border-radius:4px; overflow:hidden;"><div style="width:${(pct - 97) / 2.5 * 100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:right; font-weight:500;">${pct.toFixed(2).replace('.',',')} %</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection('UNIQUE ÉCHEC AUJOURD\'HUI', `
          <div style="background:#FDE8E4; border:1px solid #F5C2B8; border-radius:12px; padding:14px 16px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
              <div>
                <div style="font-weight:500; font-size:13.5px;">Mastercard •• 7821 · 13:42</div>
                <div style="font-size:11.5px; color:#9B2F22; margin-top:3px;">Code 51 · fonds insuffisants · BNP Paribas FR</div>
              </div>
              <span style="background:#fff; color:#9B2F22; padding:2px 8px; border-radius:999px; font-size:10.5px; font-family:var(--mono); font-weight:600;">ÉCHEC</span>
            </div>
            <div style="font-size:12px; color:var(--n-700);">Client a réessayé avec une autre carte 18 secondes plus tard · succès. Aucune perte.</div>
          </div>
        `)}
        ${kpiSection('SANTÉ TECHNIQUE', [
          ['Latence moyenne autorisation', 'p95 = 2,1 s', '1,4 s'],
          ['Disponibilité passerelle', 'BAM + acquéreur', '100,00 %'],
          ['Terminaux en ligne', '3 / 3 PAX A920', '✓'],
          ['Connectivité 4G secours', 'utilisée 0 fois', '✓'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
      `
    },

    /* ════════ Ratio carte / cash ════════ */
    'ratio': {
      title: 'Ratio carte / espèces',
      subtitle: 'Mix de paiement · 24 dernières heures',
      foot: kpiFootBtns('Fermer', 'Désactiver l\'espèces →'),
      body: `
        ${kpiHero('68 / 32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', 'Carte gagne 4 pts vs semaine dernière · +12 pts depuis lancement', '↑ +4 pts carte')}
        ${kpiSection('DÉTAIL DES MOYENS', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['Visa',          48, 'var(--atlas)',  '11 700 MAD'],
              ['Mastercard',    24, '#7DF2B0',       '5 850 MAD'],
              ['Kiwi Tap',      18, 'var(--riad)',   '4 388 MAD'],
              ['Kiwi Wallet QR',10, '#D99A2B',       '2 438 MAD'],
              ['Espèces',       32, '#A8A49A',       '7 800 MAD'],
            ].map(([lbl, pct, c, mad]) => `
              <div style="display:grid; grid-template-columns:120px 1fr 50px 100px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="display:flex; align-items:center; gap:8px; color:var(--n-700);"><i style="width:10px; height:10px; border-radius:3px; background:${c}; display:inline-block;"></i>${lbl}</div>
                <div style="height:8px; background:#fff; border-radius:4px; overflow:hidden;"><div style="width:${pct/48*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:right; font-weight:500;">${pct} %</div>
                <div style="font-family:var(--mono); text-align:right; color:var(--n-500); font-size:11.5px;">${mad}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection('COÛT CACHÉ DE L\'ESPÈCES', [
          ['Tournée banque hebdo', '~ 45 min de gérance · vendredi', '180 MAD/sem'],
          ['Erreurs de caisse moy.', '0,4 % du volume cash', '~ 31 MAD/jour'],
          ['Risque vol / perte', 'absent en mode 100 % carte', '—'],
          ['Total annuel évitable', '180 + 11 300 + risque', '≈ 21 000 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight(`<b style="color:var(--mint);">Insight :</b> Si vous passez à 80 % carte (vs 68 % aujourd'hui) avec un prompt « payez par carte = café offert le 10ᵉ », vous économisez <b>~12 800 MAD/an</b> de manipulation cash.`)}
      `
    },

    /* ════════ Clients réguliers ════════ */
    'regulars': {
      title: 'Clients réguliers',
      subtitle: 'Identifiés par carte tokenisée ou Kiwi Wallet',
      foot: kpiFootBtns('Fermer', 'Lancer programme fidélité →'),
      body: `
        ${kpiHero('47 <span style="font-size:18px; color:var(--n-500); font-weight:500;">/ 182</span>', '26 % de la base · taux de rétention 30 jours = 72 %', '↑ +9 nouveaux cette semaine')}
        ${kpiSection('TOP 5 RÉGULIERS · CE MOIS', [
          ['Karim Bensouda', '12 visites · 18 cafés · 6 tajines', '2 380 MAD'],
          ['Sara Lahlou', '10 visites · membre depuis 2024', '1 920 MAD'],
          ['Hicham Cherki', '9 visites · toujours T6', '1 740 MAD'],
          ['Nawal Khalifi', '8 visites · payeur Kiwi Wallet', '1 480 MAD'],
          ['Youssef Amrani (employé)', '8 visites · pause déj.', '420 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection('COHORTES DE FRÉQUENCE', `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['1ʳᵉ visite ce mois',  68,  '#B9E5CC'],
              ['2-3 visites',         42,  '#7FD4A4'],
              ['4-7 visites',         28,  'var(--atlas)'],
              ['8+ visites (hard core)', 19, 'var(--riad)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-700);">${lbl}</div>
                <div style="height:8px; background:#fff; border-radius:4px; overflow:hidden;"><div style="width:${n/68*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:right; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection('CLIENTS À RÉACTIVER', `
          <div style="padding:14px 16px; background:#FFF4DD; border:1px solid #F4D89A; border-radius:12px; font-size:13px; color:#5C4310; line-height:1.5;">
            <b>14 réguliers</b> n'ont pas commandé depuis 6 semaines. Un message WhatsApp « on vous a manqué · −15 % la semaine prochaine » a converti <b>43 %</b> des relances le mois dernier.
          </div>
        `)}
        ${kpiInsight(`<b style="color:var(--mint);">Insight :</b> Vos 19 hard-core représentent <b>34 % du chiffre</b> alors qu'ils ne sont que 10 % de la base. Un programme de fidélité (10ᵉ café offert) coûterait <b>~280 MAD/mois</b> et garderait ce groupe à très haute valeur.`)}
      `
    },

    'default': { title: 'Métrique', body: `<p style="color:var(--n-600);">Analyse détaillée disponible ici.</p>` }
  };

  const aiResponses = {
    'Envoyer le résumé de midi sur WhatsApp': '<b>Kiwi AI :</b> Résumé envoyé à <b>+212 6 xx xx xx xx</b>. Contenu : 24 380 MAD · 182 transactions · pic 13h · top serveuse Sofia (54 tx).',
    'Préparer la relance des 5 impayés à > 500 MAD': '<b>Kiwi AI :</b> Brouillon créé pour 5 clients totalisant <b>3 280 MAD</b>. Envoi WhatsApp prêt, validation humaine requise.',
    'Activer le prompt pourboire +10 % après 20h': '<b>Kiwi AI :</b> Activé. Le prompt s\'affichera après 20h sur toutes les tables. Estimation de gain : <b>+380 MAD/soir</b>.',
  };

  /* ═══════════════════════ UNIVERSAL ROUTER ═══════════════════════ */
  /* Elements that OWN their own click handling — the fallback must not touch them */
  const SKIP_FALLBACK_ATTRS = ['data-close', 'data-dismiss', 'data-confirm', 'data-save', 'data-next', 'data-prev', 'data-pay', 'data-activate', 'data-send', 'data-sms', 'data-agent-approve', 'data-agent-dismiss', 'data-agent-run-all', 'data-filter-apply', 'data-mark-read', 'data-contact-go', 'data-login-go', 'data-to-signup', 'data-biz', 'data-en', 'data-amt', 'data-cap', 'data-rec', 'data-from', 'data-f', 'data-r', 'data-m', 'data-key', 'data-method', 'data-copy', 'data-share', 'data-upgrade', 'data-refund', 'data-print', 'data-new', 'data-gen', 'data-confirm-settle', 'data-ai-send', 'data-copilot-send', 'data-bubble-close'];
  const SKIP_FALLBACK_CONTAINERS = '.kiwi-modal, .kiwi-drawer, .kiwi-menu, .kp, .ai-drawer, .amount-pad, .mode-tg';

  function shouldSkipFallback(el) {
    if (!el) return true;
    if (el.closest(SKIP_FALLBACK_CONTAINERS)) return true;
    for (const attr of SKIP_FALLBACK_ATTRS) {
      if (el.hasAttribute(attr) || el.closest('[' + attr + ']')) return true;
    }
    return false;
  }

  document.addEventListener('click', (e) => {
    // 1. explicit data-action
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const a = actionEl.dataset.action;
      const arg = actionEl.dataset.arg;
      if (handlers[a]) { e.preventDefault(); handlers[a](actionEl, arg); return; }
    }

    // 2. range / tab toggles
    const rangeSpan = e.target.closest('.range span, .dash-range span');
    if (rangeSpan && !rangeSpan.classList.contains('on')) {
      rangeSpan.parentElement.querySelectorAll('span').forEach(s => s.classList.remove('on'));
      rangeSpan.classList.add('on');
      return;
    }

    // 3. Lang switch — delegated to i18n.js directly; no-op here to avoid double toast

    // 4. Smooth anchor scroll
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor) {
      const id = anchor.getAttribute('href').slice(1);
      if (id) {
        const t = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (t) { e.preventDefault(); t.scrollIntoView({behavior:'smooth', block:'start'}); return; }
      }
    }

    // 5. AI drawer suggestion
    const sugg = e.target.closest('.sugg');
    if (sugg) { handlers['ai-suggest'](sugg); return; }

    // 6. AI drawer close
    if (e.target.closest('.ai-drawer .head .x')) { document.querySelector('.ai-drawer').style.display = 'none'; toast('Kiwi AI masqué · ⌘J pour rouvrir', {type:'info', duration: 2000}); return; }

    // 7. AI drawer input
    const aiInput = e.target.closest('.ai-drawer .input');
    if (aiInput) { toast('Kiwi AI chat ouvert', {type:'info', desc: 'Tapez votre question ou commande'}); return; }

    // 8. feed-row → transaction detail
    const feedRow = e.target.closest('.feed-row, .tx-row');
    if (feedRow) { handlers['tx-detail'](feedRow, 'tx1'); return; }

    // 9. kpi-m / kpi-c → expand
    const kpi = e.target.closest('.kpi-m, .kpi-c');
    if (kpi && !e.target.closest('[data-action]')) {
      let arg = kpi.dataset.kpi;
      if (!arg) {
        const label = kpi.querySelector('.l, .lbl')?.textContent?.toLowerCase() || '';
        if (label.includes('transaction')) arg = 'tx';
        else if (label.includes('panier')) arg = 'panier';
        else if (label.includes('pourboire')) arg = 'tips';
        else if (label.includes('succès') || label.includes('success')) arg = 'success';
        else if (label.includes('ratio')) arg = 'ratio';
        else if (label.includes('régulier') || label.includes('regular')) arg = 'regulars';
        else arg = 'default';
      }
      handlers['kpi-detail'](kpi, arg);
      return;
    }

    // 10. Sidebar nav → highlight + toast
    const sidebarLink = e.target.closest('.sidebar nav a');
    if (sidebarLink && !sidebarLink.dataset.action && sidebarLink.getAttribute('href') === '#') {
      e.preventDefault();
      sidebarLink.parentElement.querySelectorAll('a').forEach(a => a.classList.remove('active'));
      sidebarLink.classList.add('active');
      const label = sidebarLink.childNodes[2]?.textContent?.trim() || sidebarLink.textContent.trim();
      toast(`${label} ouvert`, {type:'info', duration: 1800});
      return;
    }

    // 11. Location switcher
    const loc = e.target.closest('.loc-switch');
    if (loc) { handlers['location-switch'](loc); return; }

    // 12. Merchant profile (sidebar bottom)
    const merchant = e.target.closest('.sidebar .merchant');
    if (merchant) { handlers['profile-menu'](merchant); return; }

    // 13. Icon buttons in topbar
    if (e.target.closest('.icon-btn')) {
      const btn = e.target.closest('.icon-btn');
      const aria = btn.getAttribute('aria-label') || '';
      if (aria.toLowerCase().includes('notif')) { handlers.notifications(); return; }
      if (aria.toLowerCase().includes('param')) { handlers.settings(); return; }
      toast('Action', {type:'info', duration: 1200});
      return;
    }

    // 14. Search bar
    if (e.target.closest('.search-big, .search')) { handlers.search(); return; }

    // 15. AI button in topbar — opens command palette (Kiwi AI panel is now in the green hero block)
    if (e.target.closest('.ai-btn')) { commandPalette(); return; }

    // 16. Team stack
    if (e.target.closest('.team-stack')) { handlers.notifications(); return; } // reuse drawer-style

    // 17. integ-card
    if (e.target.closest('.integ-card')) {
      const n = e.target.closest('.integ-card').querySelector('.n')?.textContent || 'Intégration';
      toast(`${n} · paramètres`, {type:'info', desc:'Ouvrir la configuration'});
      return;
    }

    // 18. timeline-day
    const tday = e.target.closest('.timeline-day');
    if (tday) { toast(`${tday.querySelector('.d')?.textContent} · ${tday.querySelector('.n')?.textContent}`, {type:'info', desc: tday.classList.contains('today') ? 'Journée en cours' : tday.classList.contains('tomorrow') ? 'Règlement prévu 9h00 · 23 091 MAD' : 'Règlement projeté'}); return; }

    // 19. heatmap cell
    const cell = e.target.closest('.heatmap .cell');
    if (cell) { toast('Créneau · intensité élevée', {type:'info', desc: 'Samedi 20h-22h · ~840 MAD/h en moyenne'}); return; }

    // 20. staff row
    const staff = e.target.closest('.staff-row');
    if (staff) { const n = staff.querySelector('.n')?.textContent || 'Employé'; toast(`${n}`, {type:'info', desc: 'Profil équipe · ouvrir'}); return; }

    // 21. prod-row
    const prod = e.target.closest('.prod-row');
    if (prod) { const n = prod.querySelector('.n')?.textContent || 'Produit'; toast(n, {type:'info', desc: 'Éditer produit · prix · modificateurs'}); return; }

    // 22. health check li
    const hc = e.target.closest('.health-check li');
    if (hc) { toast(hc.querySelector('span')?.textContent || 'Critère', {type:'info', desc:'Détails et recommandations'}); return; }

    // 23. bench row
    const bench = e.target.closest('.bench-row');
    if (bench) { toast(bench.querySelector('.lbl')?.textContent || 'Métrique', {type:'info', desc: 'Voir vos pairs dans cette catégorie'}); return; }

    // 24. testimonial card
    const testi = e.target.closest('.testi-card');
    if (testi) { toast('Témoignage complet', {type:'info', desc: testi.querySelector('.n')?.textContent || ''}); return; }

    // 25. Pricing card
    const priceCard = e.target.closest('.price-card, .bm-card, .pillar, .prod');
    if (priceCard) { toast(priceCard.querySelector('h3, h4')?.textContent || 'Plan', {type:'info'}); return; }

    // 26. roadmap card
    const rmap = e.target.closest('.rmap-card');
    if (rmap) { toast(rmap.querySelector('h4')?.textContent || 'Phase', {type:'info', desc: 'Détails de la phase'}); return; }

    // 27. f-card (wallet features)
    const fcard = e.target.closest('.f-card');
    if (fcard) { toast(fcard.querySelector('h3')?.textContent || 'Fonction', {type:'info'}); return; }

    // 28. sec-item
    const sec = e.target.closest('.sec-item');
    if (sec) { toast(sec.querySelector('h4')?.textContent || 'Sécurité', {type:'info', desc: sec.querySelector('p')?.textContent || ''}); return; }

    // 29. Store buttons (app store / google play)
    const store = e.target.closest('.store-btn');
    if (store) { handlers['download-app'](); return; }

    // 30. socials
    const soc = e.target.closest('.socials a');
    if (soc) { toast('Réseau social', {type:'info', desc: 'Ouvrir @kiwi.ma'}); return; }

    // 31. logo cells in brand
    const logoCell = e.target.closest('.logo-cell');
    if (logoCell) { toast('Copié au presse-papier', {type:'success', desc: 'SVG disponible dans le kit de marque'}); return; }

    // 32. color swatches
    const color = e.target.closest('.color');
    if (color) { const h = color.querySelector('.h')?.textContent || 'couleur'; toast(`${h} copié`, {type:'success'}); return; }

    // 33. btn / kb / various buttons — fallback only for top-level CTAs, never inside modal/drawer/menu
    const btn = e.target.closest('button, .btn, .btn-slim, .btn-primary, .btn-ghost, .btn-atlas, .btn-mint, .btn-lg');
    if (btn && !btn.closest('a[href]') && !shouldSkipFallback(btn)) {
      e.preventDefault();
      const label = btn.textContent.trim().slice(0, 50);
      toast(label || 'Action exécutée', {type: 'success', duration: 2000});
      return;
    }

    // 34. pill / chip
    const pill = e.target.closest('.pill, .chip, .rest-chips span');
    if (pill && !pill.closest('[data-action]') && !pill.closest('a') && !shouldSkipFallback(pill)) {
      toast(pill.textContent.trim().slice(0, 50), {type:'info', duration:1500});
      return;
    }
  });

  /* ─── Keyboard shortcuts ─── */
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); commandPalette(); }
    if ((e.metaKey || e.ctrlKey) && k === 'j') { e.preventDefault(); commandPalette(); }
    if (e.key === '/' && !e.target.matches('input, textarea')) { e.preventDefault(); commandPalette(); }
    if (k === 'arrowright' && document.querySelector('.deck')) {
      const slides = document.querySelectorAll('.slide');
      const cur = [...slides].findIndex(s => s.getBoundingClientRect().top >= -50);
      if (cur < slides.length - 1) slides[cur + 1]?.scrollIntoView({behavior:'smooth'});
    }
    if (k === 'arrowleft' && document.querySelector('.deck')) {
      const slides = document.querySelectorAll('.slide');
      const cur = [...slides].findIndex(s => s.getBoundingClientRect().top >= -50);
      if (cur > 0) slides[cur - 1]?.scrollIntoView({behavior:'smooth'});
    }
  });

  /* ─── Global handle for escape on drawers/modals is done per-instance ─── */

  /* ─── Expose a tiny API for inline usage if needed ─── */
  window.Kiwi = { toast, modal, drawer, menu, commandPalette, confetti, handlers };

})();

/* Droits de l'équipe · l'écran du propriétaire (Équipe → Droits).
 *
 * Lit et écrit /api/permissions (functions/api/permissions.js).
 *   · Avant tout : l'ACTIVATION. Tant que le propriétaire n'a pas activé, chaque
 *     geste garde sa règle d'avant. L'écran montre, personne par personne, ses
 *     droits d'aujourd'hui et ce que le rôle proposé changerait ; par défaut
 *     chacun garde exactement ce qu'il a. Rien ne s'écrit avant « Activer ».
 *   · Équipe  : une ligne par personne (une carte sur téléphone), le rôle, la
 *               phrase en clair, le détail droit par droit avec l'endroit où il
 *               est tenu (serveur, journal, caisse seule) ;
 *   · Rôles   : les rôles par défaut et le seuil de remise libre ;
 *   · Journal : qui a changé quoi, ce qui a été fait sans le droit, et
 *               « Défaire » sur chaque changement.
 * Les anciens réglages que ce navigateur gardait (KiwiPlatform.access) ne
 * partent jamais seuls : l'écran les montre, personne par personne, et le
 * propriétaire les reprend ou les écarte. Une règle joker n'est jamais étendue.
 * Ce qui est masqué ici ne protège rien : le serveur relit tout.
 */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, handlers } = window.Kiwi;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const lang = () => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' || l === 'ar' ? l : 'fr'; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => window.KiwiPermCatalog;
  const slug = () => { try { return window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) { return ''; } };
  const fold = (s) => { let t = String(s || '').toLowerCase(); try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {} return t; };
  const when = (ts) => {
    try { return new Date(ts).toLocaleString(document.documentElement.lang || 'fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  };

  const state = { loaded: false, error: '', data: null, tab: 'team', q: '', expanded: '', open: '', drafts: {}, presetDrafts: {},
    busy: false, choices: {}, pct: null, confirmOff: false, filter: 'all', legacy: null, legacyAccept: {}, reviewOpen: false };

  function css() {
    if (document.getElementById('pm-css')) return;
    const sheetStyle = document.createElement('style');
    sheetStyle.id = 'pm-css';
    sheetStyle.textContent = `
.pm-page{display:grid;gap:14px;min-width:0}
.pm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.pm-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,#F2F0EA)}
.pm-tabs button{border:0;background:transparent;padding:7px 14px;border-radius:9px;font:inherit;font-size:13px;color:var(--n-600,#4B4944);cursor:pointer}
.pm-tabs button.on{background:var(--surface,#FFFDFA);color:var(--ink,#0A0F0D)}
.pm-count{display:inline-block;margin-inline-start:6px;padding:0 7px;border-radius:999px;background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210);font-size:11.5px}
.pm-search{min-width:0;flex:1 1 220px;max-width:360px;padding:8px 12px;border-radius:10px;border:1px solid var(--n-200,#E8E6E0);background:var(--surface,#FFFDFA);font:inherit;font-size:13px;color:inherit}
.pm-note{margin:0;padding:10px 14px;border-radius:12px;background:var(--n-100,#F2F0EA);font-size:13px;line-height:1.5;color:var(--n-600,#4B4944)}
.pm-note.warn{background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210)}
.pm-muted{display:block;font-size:11.5px;color:var(--n-500,#6F6C65);margin-top:2px;line-height:1.4}
.pm-scroll{overflow-x:auto;border:1px solid var(--n-200,#E8E6E0);border-radius:16px;background:var(--surface,#FFFDFA)}
.pm-grid{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.pm-grid th,.pm-grid td{padding:9px 10px;border-bottom:1px solid var(--n-200,#E8E6E0);text-align:start;vertical-align:middle;white-space:nowrap}
.pm-grid thead th{font-weight:500;font-size:12px;color:var(--n-500,#6F6C65);background:var(--n-50,#FAFAF8)}
.pm-grid .pm-who{position:sticky;inset-inline-start:0;background:var(--surface,#FFFDFA);z-index:1;min-width:170px;white-space:normal}
.pm-grid thead .pm-who{background:var(--n-50,#FAFAF8)}
.pm-grid tr.on td{background:var(--n-50,#FAFAF8)}
.pm-name{border:0;background:none;padding:0;font:inherit;font-weight:500;color:var(--ink,#0A0F0D);cursor:pointer;text-align:start}
.pm-colbtn{border:0;background:none;font:inherit;font-size:12px;color:inherit;cursor:pointer;padding:2px 4px;border-radius:6px}
.pm-colbtn[aria-expanded="true"]{color:var(--atlas,#0B6E4F)}
.pm-sub{font-size:11px;max-width:120px;white-space:normal;line-height:1.3}
.pm-cell{min-width:46px;border:1px solid var(--n-200,#E8E6E0);background:transparent;border-radius:999px;padding:3px 9px;font:inherit;font-size:12px;cursor:pointer;color:var(--n-500,#6F6C65)}
.pm-cell.full{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
.pm-cell.part{border-color:var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F)}
.pm-tog{flex:none;width:30px;height:18px;border-radius:999px;border:1px solid var(--n-300,#D4D1C8);background:var(--n-100,#F2F0EA);position:relative;cursor:pointer;padding:0}
.pm-tog::after{content:"";position:absolute;top:2px;inset-inline-start:2px;width:12px;height:12px;border-radius:50%;background:var(--n-400,#A8A49A);transition:inset-inline-start .18s ease,background .18s ease}
.pm-tog[aria-pressed="true"]{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F)}
.pm-tog[aria-pressed="true"]::after{inset-inline-start:14px;background:var(--paper,#F7F5F0)}
.pm-tog:disabled{opacity:.45;cursor:not-allowed}
.pm-sel{min-width:132px;max-width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--n-200,#E8E6E0);background:var(--surface,#FFFDFA);font:inherit;font-size:12.5px;color:inherit}
.pm-num{width:72px;min-width:0}
.pm-dirty td{background:rgba(11,110,79,.05)}
.pm-acts{display:inline-flex;flex-wrap:wrap;gap:6px}
.pm-card{border:1px solid var(--n-200,#E8E6E0);border-radius:14px;padding:12px 14px;background:var(--surface,#FFFDFA);min-width:0}
.pm-card h3{margin:0;font-size:15px;font-weight:600}
.pm-card h4{margin:0 0 8px;font-size:13px;font-weight:600}
.pm-sum{margin:6px 0 10px;font-size:13.5px;line-height:1.55;color:var(--ink,#0A0F0D)}
.pm-groups{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;font-size:12.5px}
.pm-row>span{min-width:0}
.pm-chk{display:block;font-size:11px;color:var(--n-500,#6F6C65)}
.pm-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.pm-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0;font-size:12.5px}
.pm-list{display:grid;gap:10px}
.pm-plus{color:var(--atlas,#0B6E4F)}
.pm-minus{color:var(--n-600,#4B4944)}
.pm-cards{display:none}
.pm-log{display:grid;border:1px solid var(--n-200,#E8E6E0);border-radius:16px;background:var(--surface,#FFFDFA)}
.pm-entry{display:grid;grid-template-columns:110px 1fr auto;gap:14px;align-items:start;padding:11px 16px;border-top:1px solid var(--n-200,#E8E6E0);font-size:13px;line-height:1.5}
.pm-entry:first-child{border-top:0}
.pm-entry time{font-family:var(--mono,'JetBrains Mono',monospace);font-size:11.5px;color:var(--n-500,#6F6C65)}
.pm-flag{padding:1px 8px;border-radius:6px;background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210)}
.pm-alert{border-inline-start:3px solid var(--warn-ink,#8A6210)}
.pm-gone{text-decoration:line-through;color:var(--n-500,#6F6C65)}
@media(max-width:640px){
  .pm-scroll,.pm-desk{display:none}
  .pm-cards{display:grid;gap:10px}
  .pm-groups{grid-template-columns:1fr}
  .pm-search{max-width:none}
  .pm-sel{width:100%}
  .pm-sel.pm-num{width:72px}
  .pm-entry{grid-template-columns:1fr;gap:4px}
}
`;
    document.head.appendChild(sheetStyle);
  }

  /* ── Données ─────────────────────────────────────────────────────────── */
  async function load() {
    state.error = '';
    const m = slug();
    if (!m) { state.error = 'no-store'; state.loaded = true; return; }
    try {
      const r = await fetch('/api/permissions?merchant=' + encodeURIComponent(m), { credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) { state.error = (j && j.error) || 'load'; state.loaded = true; return; }
      state.data = j; state.drafts = {}; state.presetDrafts = {}; state.confirmOff = false;
    } catch (_) { state.error = 'offline'; }
    state.loaded = true;
    await legacyPreview();
  }
  async function send(body, quiet) {
    const r = await fetch('/api/permissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: slug() }, body)) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (!quiet) {
        const msg = j.error === 'owner-required' ? L('Seul le propriétaire change les droits.', 'Only the owner changes permissions.', 'غير مول المحل اللي يقدر يبدّل الحقوق.')
          : j.error === 'already-undone' ? L('Ce changement a déjà été défait.', 'This change was already undone.', 'هاد التبديل ترجع من قبل.')
            : L('Enregistrement impossible. Réessayez.', 'Could not save. Try again.', 'ما تسجّلش. عاود.');
        toast(msg, { type: 'error' });
      }
      return null;
    }
    return j;
  }
  /* Les anciens réglages de ce navigateur : on DEMANDE au serveur ce qu'ils
     changeraient, sans rien écrire. Le propriétaire décide ensuite. */
  function legacyDoc() {
    let doc = null;
    try { doc = window.KiwiPlatform?.access?.read?.() || null; } catch (_) { doc = null; }
    if (!doc || !((doc.grants || []).length || (doc.denies || []).length)) return null;
    return { grants: doc.grants || [], denies: doc.denies || [] };
  }
  async function legacyPreview() {
    state.legacy = null;
    const d = state.data;
    if (!d || d.readOnly || !d.configured || d.legacyImported) return;
    const doc = legacyDoc();
    if (!doc) return;
    const out = await send({ action: 'legacy-preview', legacy: doc }, true);
    if (out && !out.already && ((out.people || []).length || (out.ignored || []).length)) {
      state.legacy = { doc, people: out.people || [], ignored: out.ignored || [] };
      state.legacyAccept = {};
    }
  }

  /* ── Aides ───────────────────────────────────────────────────────────── */
  const person = (key) => (state.data?.staff || []).find((s) => s.key === key);
  function draftOf(s) { return state.drafts[s.key] || { preset: s.preset, perms: s.perms.slice() }; }
  const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
  const dirty = (s) => { const d = state.drafts[s.key]; return !!d && (d.preset !== s.preset || !same(d.perms, s.perms)); };
  const presetLabel = (id) => (C().PRESET_LABEL[id] || {})[lang()] || id;
  const permLabel = (id) => C().label(id, lang());
  const names = (ids) => (ids || []).map(permLabel).join(', ');
  const presetsOf = () => (state.data && state.data.presets) || C().DEFAULT_PRESETS;
  const ro = () => !!(state.data && state.data.readOnly);
  const btn = (action, argv, text, ghost, extra) => `<button type="button" class="kb${ghost ? ' ghost' : ''}" data-action="${action}"${argv != null ? ` data-arg="${esc(argv)}"` : ''}${extra || ''}>${esc(text)}</button>`;
  const changes = (added, removed) => [
    added && added.length ? `<span class="pm-plus">+ ${esc(names(added))}</span>` : '',
    removed && removed.length ? `<span class="pm-minus">− ${esc(names(removed))}</span>` : '',
  ].filter(Boolean).join(' · ');
  const diff = (from, to) => ({ added: to.filter((id) => !from.includes(id)), removed: from.filter((id) => !to.includes(id)) });
  /* Un code intitulé « Propriétaire » ouvre le compte au palier du patron : tout, sans réglage. */
  const ownerAccessNote = () => L('Accès propriétaire complet. Ce code ouvre le compte comme vous : tous les droits, rien à régler ici. Vous seul pouvez donner cet intitulé ; pour limiter cette personne, changez son intitulé dans Équipe.',
    'Full owner access. This code opens the account like you do: every permission, nothing to set here. Only you can give this title; to limit this person, change the title in Team.',
    'دخول كامل بحال مول المحل. هاد الكود كيحلّ الحساب بحالك: كاع الحقوق، والو ما يتّعدّل هنا. غير نتا اللي تقدر تعطي هاد السمية؛ باش تحدّ ليه، بدّل السمية ديالو فالفريق.');
  const ownerBadge = () => `<span class="pm-chk">${esc(L('Accès propriétaire complet', 'Full owner access', 'دخول كامل بحال مول المحل'))}</span>`;
  /* Une fiche ou un code ajouté hors de votre session : aucun droit tant que vous ne l'avez pas revu. */
  /* Un auteur du journal ({ kind, name } du serveur), dit dans la langue de l'écran. */
  const actorText = (a) => {
    const k = a && a.kind, n = String((a && a.name) || '');
    if (k === 'account') return L('compte du propriétaire', 'owner account', 'الحساب ديال مول المحل');
    if (k === 'code') return L(`${n} · code propriétaire`, `${n} · owner code`, `${n} · كود مول المحل`);
    if (k === 'operator') return n ? L(`${n} · Kiwi`, `${n} · Kiwi`, `${n} · Kiwi`) : L('opérateur Kiwi', 'Kiwi operator', 'مسيّر Kiwi');
    return n || L('une session de l’équipe', 'a team session', 'جلسة ديال الفريق');
  };
  const heldNote = (s) => L(`Ajouté, retitré ou recodé par ${actorText(s.heldBy)} : aucun droit tant que vous ne l’avez pas revu. « Revoir » lui rend ses droits, ou choisissez son rôle puis Enregistrer.`,
    `Added, retitled or recoded by ${actorText(s.heldBy)}: no permissions until you review them. “Review” gives them back, or pick a role, then Save.`,
    `زادو، بدّل ليه السمية ولا الكود (دارها ${actorText(s.heldBy)}): حتى حق حتى تراجعو نتا. «راجع» كترجّع ليه الحقوق ديالو، ولا ختار الدور ديالو ومن بعد سجّل.`);
  const personNote = (s) => s.ownerAccess ? `<p class="pm-note">${esc(ownerAccessNote())}</p>` : s.held ? `<p class="pm-note">${esc(heldNote(s))}</p>` : '';
  const cans = (ids) => ids.map((id) => C().BY_ID[id] && C().BY_ID[id].can[lang()]).filter(Boolean).join(', ');

  /* Un droit, sa bascule et l'endroit où il est tenu. */
  function permRow(p, on, action, argv, disabled) {
    return `<div class="pm-row"><span>${esc(p[lang()])}<span class="pm-chk">${esc(C().checkLabel(p.id, lang()))}</span></span><button type="button" class="pm-tog" data-action="${action}" data-arg="${esc(argv)}|${p.id}" aria-pressed="${on}" aria-label="${esc(p[lang()])}" ${disabled ? 'disabled' : ''}></button></div>`;
  }
  const groupsOf = (list, action, argv, disabled) => `<div class="pm-groups">${C().GROUPS.map((g) => `<div class="pm-card"><h4>${esc(g[lang()])}</h4>${g.perms.map((p) => permRow(p, list.includes(p.id), action, argv, disabled)).join('')}</div>`).join('')}</div>`;
  const presetSelect = (s, dr) => `<select class="pm-sel" data-pm-preset="${esc(s.key)}" aria-label="${esc(L('Rôle de', 'Role of', 'الدور ديال') + ' ' + s.name)}" ${ro() ? 'disabled' : ''}>${C().PRESET_IDS.map((id) => `<option value="${id}" ${dr.preset === id ? 'selected' : ''}>${esc(presetLabel(id))}</option>`).join('')}</select>`;
  const saveActs = (s) => dirty(s) ? `<span class="pm-acts">${btn('pm-save', s.key, L('Enregistrer', 'Save', 'سجّل'))}${btn('pm-revert', s.key, L('Annuler', 'Cancel', 'خلّيها'), true)}</span>` : '';

  /* ── Activation ──────────────────────────────────────────────────────── */
  function activationView() {
    const d = state.data, Cat = C();
    if (ro()) return `<p class="pm-note">${esc(L('Les droits ne sont pas encore actifs. Chaque geste garde sa règle d’avant.', 'Permissions are not active yet. Every action keeps its previous rule.', 'الحقوق مازال ما خدامينش. كل حركة باقة بالقاعدة القديمة.'))}</p>`;
    let changed = 0;
    const cards = d.staff.map((s) => {
      const choice = state.choices[s.key] || (s.custom ? 'keep' : 'today');
      const today = s.today || [];
      const proposed = s.proposed || [];
      const dd = diff(today, proposed);
      if (choice === 'preset' && (dd.added.length || dd.removed.length)) changed += 1;
      const partial = (s.todayPartial || []).length ? `<span class="pm-muted">${esc(L('Aujourd’hui, voit une partie de : ', 'Today, partly sees: ', 'اليوم، كيشوف شوية من: ') + names(s.todayPartial) + L('. Ce n’est pas repris : donnez-le ensuite si besoin.', '. Not carried over: grant it afterwards if needed.', '. ما كيتنقلش: عطيه من بعد إلا بغيتي.'))}</span>` : '';
      const opts = [
        s.custom ? `<option value="keep" ${choice === 'keep' ? 'selected' : ''}>${esc(L('Garder son réglage enregistré', 'Keep the saved setting', 'خلّي الإعداد اللي تسجّل'))}</option>` : '',
        `<option value="today" ${choice === 'today' ? 'selected' : ''}>${esc(L('Garder ses droits d’aujourd’hui', 'Keep today’s permissions', 'يبقى بالحقوق ديال اليوم'))}</option>`,
        `<option value="preset" ${choice === 'preset' ? 'selected' : ''}>${esc(L('Prendre le rôle proposé : ', 'Take the proposed role: ', 'ياخد الدور المقترح: ') + presetLabel(s.defaultPreset))}</option>`,
      ].join('');
      const delta = dd.added.length || dd.removed.length
        ? `<span class="pm-muted">${esc(L('Avec le rôle proposé : ', 'With the proposed role: ', 'بالدور المقترح: '))}${changes(dd.added, dd.removed)}</span>`
        : `<span class="pm-muted">${esc(L('Le rôle proposé ne change rien pour cette personne.', 'The proposed role changes nothing for this person.', 'الدور المقترح ما كيبدّل والو لهاد الشخص.'))}</span>`;
      if (s.ownerAccess) return `<div class="pm-card"><div class="pm-head"><div><strong>${esc(s.name)}</strong><span class="pm-muted">${esc(s.role || '')}</span></div>${ownerBadge()}</div><p class="pm-note">${esc(ownerAccessNote())}</p></div>`;
      const plain = dd.added.length || dd.removed.length ? `<p class="pm-sum">${esc([
        L(`Avec le rôle ${presetLabel(s.defaultPreset)}, ${s.name}`, `With the ${presetLabel(s.defaultPreset)} role, ${s.name}`, `بالدور ${presetLabel(s.defaultPreset)}، ${s.name}`),
        dd.added.length ? L(` pourrait en plus ${cans(dd.added)}`, ` could also ${cans(dd.added)}`, ` يقدر حتى ${cans(dd.added)}`) : '',
        dd.added.length && dd.removed.length ? L(' ;', ';', '؛') : '',
        dd.removed.length ? L(` ne pourrait plus ${cans(dd.removed)}`, ` could no longer ${cans(dd.removed)}`, ` ما بقاش يقدر ${cans(dd.removed)}`) : '',
        L('. Garder ses droits d’aujourd’hui ne change rien.', '. Keeping today’s permissions changes nothing.', '. إلا خلّيتي الحقوق ديال اليوم، والو ما كيتبدّل.'),
      ].join(''))}</p>` : '';
      return `<div class="pm-card"><div class="pm-head"><div><strong>${esc(s.name)}</strong><span class="pm-muted">${esc(s.role || '')}</span></div></div>
        <p class="pm-sum">${esc(Cat.summary(today, s.name, lang()))}</p>${partial}${plain}${delta}
        <div class="pm-line"><select class="pm-sel" data-pm-choice="${esc(s.key)}" aria-label="${esc(s.name)}">${opts}</select></div></div>`;
    }).join('');
    const pct = state.pct == null ? d.freeDiscountPct : state.pct;
    return `<div class="pm-card"><h3>${esc(L('Activer les droits de l’équipe', 'Switch on team permissions', 'شعّل الحقوق ديال الفريق'))}</h3>
      <p class="pm-sum">${esc(L('Aujourd’hui, chaque geste garde sa règle d’avant (le code d’un responsable pour rembourser, annuler, corriger le stock). Choisissez pour chaque personne. Par défaut, chacun garde exactement ses droits d’aujourd’hui. Rien ne change avant « Activer ».',
        'Today, every action keeps its previous rule (a manager code to refund, cancel or adjust stock). Choose for each person. By default, everyone keeps exactly today’s permissions. Nothing changes before “Switch on”.',
        'دابا، كل حركة باقة بالقاعدة القديمة (كود المسؤول باش يرجّع، يلغي ولا يصحّح السلعة). ختار لكل واحد. من الأول، كل واحد كيبقى بنفس الحقوق ديال اليوم. والو ما كيتبدّل قبل ما تضغط «شعّل».'))}</p>
      <div class="pm-line"><label>${esc(L('Remise libre jusqu’à', 'Free discount up to', 'التخفيض الحر حتى'))} <input class="pm-sel pm-num" type="number" min="0" max="100" step="1" data-pm-pct value="${esc(pct)}"> %</label></div></div>
      <div class="pm-list">${cards}</div>
      <div class="pm-line">${btn('pm-activate', null, L('Activer', 'Switch on', 'شعّل'))}<span class="pm-muted">${esc(changed
        ? L(`${changed} personne(s) prennent le rôle proposé ; les autres gardent leurs droits.`, `${changed} person(s) take the proposed role; the others keep theirs.`, `${changed} ديال الناس غادي ياخدو الدور المقترح؛ الباقيين كيبقاو بالحقوق ديالهم.`)
        : L('Personne ne change de droits.', 'Nobody’s permissions change.', 'حتى واحد ما غادي تتبدّل ليه الحقوق.'))}</span></div>`;
  }

  /* ── Reprise des anciens réglages ───────────────────────────────────── */
  function legacyView() {
    const lg = state.legacy;
    if (!lg) return '';
    const people = lg.people.map((p) => `<label class="pm-row"><span><strong>${esc(p.name)}</strong><span class="pm-muted">${changes(p.added, p.removed)}</span></span><input type="checkbox" data-pm-legacy="${esc(p.key)}" ${state.legacyAccept[p.key] ? 'checked' : ''}></label>`).join('');
    const ignored = lg.ignored.length ? `<p class="pm-muted">${esc(L('Non repris (règle trop large ou inconnue) : ', 'Not carried over (rule too broad or unknown): ', 'ما تنقلش (قاعدة واسعة بزاف ولا ما معروفاش): ') + lg.ignored.map((r) => r.text).join(' · '))}</p>` : '';
    return `<div class="pm-card"><h3>${esc(L('Anciens réglages de cet appareil', 'Old settings on this device', 'إعدادات قدام فهاد الجهاز'))}</h3>
      <p class="pm-sum">${esc(L('Ce navigateur gardait des droits à part. Cochez ceux à reprendre ; rien ne part sans vous.', 'This browser kept its own permissions. Tick the ones to carry over; nothing is sent without you.', 'هاد البراوزر كان حافظ شي حقوق بوحدو. علّم على اللي بغيتي تنقل؛ والو ما كيمشي بلا بيك.'))}</p>
      ${people ? `<div class="pm-list">${people}</div>` : ''}${ignored}
      <div class="pm-line">${people ? btn('pm-legacy-import', null, L('Reprendre la sélection', 'Carry over the selection', 'نقل اللي علّمتي')) : ''}${btn('pm-legacy-dismiss', null, L('Tout écarter', 'Drop all', 'خلّيهم كاملين'), true)}</div></div>`;
  }

  /* ── Équipe ──────────────────────────────────────────────────────────── */
  function teamTab() {
    const d = state.data, Cat = C();
    const q = fold(state.q);
    const rows = d.staff.filter((s) => !q || fold(s.name + ' ' + (s.role || '') + ' ' + presetLabel(s.preset)).includes(q));
    const head = Cat.GROUPS.map((g) => {
      const open = state.expanded === g.id;
      const b = `<button type="button" class="pm-colbtn" data-action="pm-expand" data-arg="${g.id}" aria-expanded="${open}">${esc(g[lang()])}</button>`;
      return open ? `<th colspan="${g.perms.length}">${b}</th>` : `<th>${b}</th>`;
    }).join('');
    const sub = state.expanded ? `<tr><th class="pm-who"></th><th></th>${Cat.GROUPS.map((g) => g.id === state.expanded
      ? g.perms.map((p) => `<th class="pm-sub">${esc(p[lang()])}</th>`).join('') : '<th></th>').join('')}<th></th></tr>` : '';
    const cols = 3 + Cat.GROUPS.reduce((n, g) => n + (state.expanded === g.id ? g.perms.length : 1), 0);
    const body = rows.map((s) => {
      const dr = draftOf(s);
      const cells = Cat.GROUPS.map((g) => {
        if (state.expanded === g.id) return g.perms.map((p) => `<td><button type="button" class="pm-tog" data-action="pm-toggle" data-arg="${esc(s.key)}|${p.id}" aria-pressed="${dr.perms.includes(p.id)}" aria-label="${esc(p[lang()])}" ${ro() || s.ownerAccess ? 'disabled' : ''}></button></td>`).join('');
        const n = g.perms.filter((p) => dr.perms.includes(p.id)).length;
        return `<td><button type="button" class="pm-cell ${n === g.perms.length ? 'full' : n ? 'part' : ''}" data-action="pm-expand" data-arg="${g.id}" title="${esc(g[lang()])}">${n}/${g.perms.length}</button></td>`;
      }).join('');
      return `<tr class="${dirty(s) ? 'pm-dirty' : ''}${state.open === s.key ? ' on' : ''}"><td class="pm-who"><button type="button" class="pm-name" data-action="pm-open" data-arg="${esc(s.key)}" aria-expanded="${state.open === s.key}">${esc(s.name)}</button><span class="pm-muted">${esc(s.role || '')}</span>${s.held ? `<span class="pm-chk">${esc(L('À revoir', 'To review', 'خاصو مراجعة'))}</span>` : ''}</td><td>${s.ownerAccess ? ownerBadge() : presetSelect(s, dr)}</td>${cells}<td>${saveActs(s)}</td></tr>`;
    }).join('');
    const none = esc(L('Personne ne correspond.', 'Nobody matches.', 'حتى واحد ما كيطابق.'));
    const table = `<div class="pm-scroll"><table class="pm-grid"><thead><tr><th class="pm-who">${esc(L('Personne', 'Person', 'الشخص'))}</th><th>${esc(L('Rôle', 'Role', 'الدور'))}</th>${head}<th></th></tr>${sub}</thead>
      <tbody>${body || `<tr><td colspan="${cols}">${none}</td></tr>`}</tbody></table></div>`;
    /* Téléphone : une carte par personne, la phrase en clair d'abord. */
    const cards = `<div class="pm-cards">${rows.map((s) => {
      const dr = draftOf(s);
      return `<div class="pm-card"><div class="pm-head"><div><strong>${esc(s.name)}</strong><span class="pm-muted">${esc(s.role || '')}</span></div></div>
        <p class="pm-sum">${esc(Cat.summary(dr.perms, s.name, lang()))}</p>${personNote(s)}<div class="pm-line">${s.ownerAccess ? ownerBadge() : presetSelect(s, dr)}</div>
        <div class="pm-line">${btn('pm-open', s.key, state.open === s.key ? L('Fermer le détail', 'Hide details', 'سدّ التفاصيل') : L('Droit par droit', 'Permission by permission', 'حق بحق'), true, ` aria-expanded="${state.open === s.key}"`)}${saveActs(s)}</div>
        ${state.open === s.key ? personDetail(s) : ''}</div>`;
    }).join('') || `<p class="pm-note">${none}</p>`}</div>`;
    const openOne = state.open && person(state.open);
    const panel = openOne ? `<section class="pm-card pm-desk" data-pm-panel><div class="pm-head"><h3>${esc(openOne.name)}</h3><span class="pm-acts">${saveActs(openOne)}${btn('pm-open', openOne.key, L('Fermer', 'Close', 'سدّ'), true)}</span></div>
      <p class="pm-sum">${esc(Cat.summary(draftOf(openOne).perms, openOne.name, lang()))}</p>${personDetail(openOne)}</section>` : '';
    return `${legacyView()}${reviewView()}<div class="pm-bar"><input class="pm-search" type="search" data-pm-search value="${esc(state.q)}" placeholder="${esc(L('Chercher une personne ou un rôle', 'Search a person or a role', 'قلّب على شي واحد ولا شي دور'))}" aria-label="${esc(L('Chercher', 'Search', 'قلّب'))}">
      <span class="pm-muted">${esc(L('Touchez un nom pour voir ses droits un par un.', 'Tap a name to see the permissions one by one.', 'ضغط على سمية باش تشوف الحقوق وحدة بوحدة.'))}</span></div>${table}${cards}${panel}`;
  }
  /* Les personnes retenues : un aperçu de ce que « Revoir » leur rend, puis une confirmation. */
  function reviewView() {
    const held = (state.data.staff || []).filter((s) => s.held);
    if (!held.length || ro()) return '';
    const head = `<div class="pm-head"><h3>${esc(L(`${held.length} personne(s) à revoir`, `${held.length} person(s) to review`, `${held.length} ديال الناس خاصهم مراجعة`))}<span class="pm-count">${held.length}</span></h3></div>`;
    if (!state.reviewOpen) {
      return `<div class="pm-card pm-alert">${head}<p class="pm-sum">${esc(L('Ajoutées, retitrées ou recodées par quelqu’un d’autre que vous : elles n’ont aucun droit en attendant.', 'Added, retitled or recoded by someone other than you: they have no permissions meanwhile.', 'زادهم، بدّل ليهم السمية ولا الكود شي واحد آخر من غيرك: ما عندهم حتى حق دابا.'))}</p>
        <div class="pm-line">${btn('pm-review-open', null, L('Revoir', 'Review', 'راجع'))}</div></div>`;
    }
    const rows = held.map((s) => `<div class="pm-row"><span><strong>${esc(s.name)}</strong><span class="pm-muted">${esc((s.role || '') + ' · ' + L('par', 'by', 'دارها') + ' ' + actorText(s.heldBy))}</span><span class="pm-muted">${esc(C().summary(s.heldPerms || [], s.name, lang()))}</span></span></div>`).join('');
    return `<div class="pm-card pm-alert">${head}<p class="pm-sum">${esc(L('Chacune retrouve les droits ci-dessous. Pour en changer, fermez et réglez la personne.', 'Each person gets the permissions below. To change them, close and set the person.', 'كل واحد كيرجع ليه الحقوق اللي لتحت. باش تبدّلها، سدّ وعدّل الشخص.'))}</p>
      <div class="pm-list">${rows}</div><div class="pm-line">${btn('pm-review', null, L('Confirmer la revue', 'Confirm the review', 'أكّد المراجعة'))}${btn('pm-review-open', 'close', L('Fermer', 'Close', 'سدّ'), true)}</div></div>`;
  }
  function personDetail(s) {
    const d = state.data, dr = draftOf(s);
    const others = d.staff.filter((o) => o.key !== s.key);
    const copy = ro() ? '' : `<div class="pm-line"><label>${esc(L('Copier les droits de', 'Copy permissions from', 'نسخ الحقوق ديال'))} <select class="pm-sel" data-pm-copyfrom="${esc(s.key)}"><option value="" selected>${esc(L('Choisir une personne', 'Pick a person', 'ختار شي واحد'))}</option>${others.map((o) => `<option value="${esc(o.key)}">${esc(o.name)}</option>`).join('')}</select></label>
      ${btn('pm-copy', s.key, L('Copier', 'Copy', 'نسخ'), true)}</div>`;
    return `${personNote(s)}${s.ownerAccess ? '' : copy}${groupsOf(dr.perms, 'pm-toggle', s.key, ro() || s.ownerAccess)}`;
  }

  /* ── Rôles ───────────────────────────────────────────────────────────── */
  function rolesTab() {
    const d = state.data, Cat = C(), presets = presetsOf();
    const limit = `<div class="pm-card"><h3>${esc(L('Remise libre', 'Free discount', 'التخفيض الحر'))}</h3>
      <p class="pm-sum">${esc(L('Jusqu’à ce pourcentage, toute l’équipe peut faire une remise. Au-delà, il faut le droit « Remise au-delà du seuil libre » ou le code d’un responsable ; sinon la remise est notée au journal.', 'Up to this percentage, anyone can give a discount. Above it, the person needs the “Discount above the free limit” permission or a manager code; otherwise the discount is logged.', 'حتى لهاد النسبة، أي واحد فالفريق يقدر يدير تخفيض. فوقها، خاصو الحق ديال «تخفيض فوق الحد» ولا الكود ديال المسؤول؛ ولا كتبان فالجورنال.'))}</p>
      <div class="pm-line"><input class="pm-sel pm-num" type="number" min="0" max="100" step="1" data-pm-limit value="${esc(d.freeDiscountPct)}" ${ro() ? 'disabled' : ''} aria-label="%"> %
      ${btn('pm-limit-save', null, L('Enregistrer', 'Save', 'سجّل'), true, ro() ? ' disabled' : '')}</div></div>`;
    const cards = Cat.PRESET_IDS.map((id) => {
      const list = state.presetDrafts[id] || presets[id] || [];
      const custom = (d.customPresets || []).includes(id);
      const acts = `<span class="pm-acts">${state.presetDrafts[id] ? btn('pm-preset-save', id, L('Enregistrer', 'Save', 'سجّل')) : ''}${custom ? btn('pm-preset-reset', id, L('Revenir au rôle d’origine', 'Back to the original role', 'رجّع الدور الأصلي'), true) : ''}</span>`;
      return `<section class="pm-card"><div class="pm-head"><h3>${esc(presetLabel(id))}</h3>${acts}</div><p class="pm-sum">${esc(Cat.summary(list, presetLabel(id), lang()))}</p>${groupsOf(list, 'pm-ptoggle', id, ro())}</section>`;
    }).join('');
    const off = ro() ? '' : `<div class="pm-card"><h3>${esc(L('Désactiver les droits', 'Switch permissions off', 'طفّي الحقوق'))}</h3>
      <p class="pm-sum">${esc(L('Chaque geste reprend sa règle d’avant. Les réglages restent enregistrés pour une prochaine activation.', 'Every action goes back to its previous rule. Settings stay saved for a later switch-on.', 'كل حركة كترجع للقاعدة القديمة. الإعدادات كيبقاو محفوظين للمرة الجاية.'))}</p>
      <div class="pm-line">${btn('pm-deactivate', null, state.confirmOff ? L('Confirmer : désactiver', 'Confirm: switch off', 'أكّد: طفّي') : L('Désactiver', 'Switch off', 'طفّي'), !state.confirmOff)}</div></div>`;
    return `<div class="pm-list">${limit}<p class="pm-note">${esc(L('Un rôle modifié s’applique à toutes les personnes qui l’ont, sauf leurs propres ajouts et retraits.', 'A changed role applies to everyone who has it, except their own additions and removals.', 'الدور اللي تبدّل كيمشي على كاع اللي عندهم، من غير الزيادات والنقصان ديال كل واحد.'))}</p>${cards}${off}</div>`;
  }

  /* ── Journal ─────────────────────────────────────────────────────────── */
  function journalTab() {
    const d = state.data;
    if (ro()) return `<p class="pm-note">${esc(L('Le journal des droits est réservé au propriétaire.', 'The permissions log is for the owner only.', 'الجورنال ديال الحقوق غير لمول المحل.'))}</p>`;
    const all = d.audit || [];
    const list = state.filter === 'unauthorized' ? all.filter((a) => a.change && a.change.kind === 'unauthorized') : all;
    const filt = (k, text) => `<button type="button" data-lens-item class="${state.filter === k ? 'on' : ''}" data-action="pm-filter" data-arg="${k}" aria-pressed="${state.filter === k}">${text}</button>`;
    const bar = `<div class="pm-bar"><div class="pm-tabs" data-lens-demo>${filt('all', esc(L('Tout', 'All', 'كلشي')))}${filt('unauthorized', esc(L('Fait sans le droit', 'Done without the right', 'تدار بلا الحق')) + (d.unauthorizedWeek ? `<span class="pm-count">${esc(d.unauthorizedWeek)} ${esc(L('cette semaine', 'this week', 'هاد السيمانة'))}</span>` : ''))}</div></div>`;
    if (!list.length) return bar + `<p class="pm-note">${esc(state.filter === 'unauthorized' ? L('Rien n’a été fait sans le droit.', 'Nothing was done without the right.', 'والو ما تدار بلا الحق.') : L('Aucun changement pour l’instant.', 'No change yet.', 'حتى تبديل مازال.'))}</p>`;
    const line = (a) => {
      const c = a.change || {}, who = esc(a.subjectLabel || a.subject);
      if (c.kind === 'unauthorized') {
        const actor = c.unproven ? esc(L('Auteur non prouvé', 'Author not proven', 'ما معروفش شكون')) + (c.claimed ? ` (${esc(L('la caisse dit', 'the till says', 'الصندوق كيقول'))} ${esc(c.claimed)})` : '') : who;
        const flag = c.noCode ? L('Fait sans code pour ce geste', 'Done without a code for this action', 'تدار بلا كود لهاد الحركة') : L('Fait sans le droit', 'Done without the right', 'تدار بلا الحق');
        return `<span class="pm-flag">${esc(flag)}</span> ${actor} · ${esc(permLabel(c.permission))}${c.percent ? ' · ' + esc(c.percent) + ' %' : ''}${c.amountCents ? ' · ' + esc((c.amountCents / 100).toFixed(2)) + ' MAD' : ''}`;
      }
      /* L'équipe elle-même (fiches et codes), à côté des droits. */
      const heldTail = c.held ? ` <span class="pm-flag">${esc(L('sans droit jusqu’à votre revue', 'no permissions until you review', 'بلا حق حتى تراجعو'))}</span>` : '';
      const title = esc(c.role || '');
      if (c.kind === 'team-added' || c.kind === 'code-added') return (c.kind === 'code-added' ? esc(L(`Nouveau code · ${a.subjectLabel || ''} · ${c.role || ''}`, `New code · ${a.subjectLabel || ''} · ${c.role || ''}`, `كود جديد · ${a.subjectLabel || ''} · ${c.role || ''}`))
        : esc(L(`Fiche ajoutée · ${a.subjectLabel || ''} · ${c.role || ''}`, `Staff card added · ${a.subjectLabel || ''} · ${c.role || ''}`, `تزادت بطاقة · ${a.subjectLabel || ''} · ${c.role || ''}`))) + heldTail;
      if (c.kind === 'team-retitled' || c.kind === 'code-retitled') return `${who} · ${esc(c.from || '')} → ${title}` + heldTail;
      if (c.kind === 'code-changed') return esc(L(`Code changé · ${a.subjectLabel || ''}`, `Code changed · ${a.subjectLabel || ''}`, `تبدّل الكود · ${a.subjectLabel || ''}`)) + heldTail;
      if (c.kind === 'review') return esc(L(`${a.subjectLabel || ''} · revu, droits rendus`, `${a.subjectLabel || ''} · reviewed, permissions given back`, `${a.subjectLabel || ''} · تراجع، الحقوق رجعات`));
      if (c.kind === 'team-removed') return esc(L(`Fiche retirée · ${a.subjectLabel || ''}`, `Staff card removed · ${a.subjectLabel || ''}`, `تحيّدات بطاقة · ${a.subjectLabel || ''}`));
      if (c.kind === 'activated') return esc(L(`Droits activés · remise libre ${c.freeDiscountPct} %`, `Permissions switched on · free discount ${c.freeDiscountPct} %`, `الحقوق تشعّلو · التخفيض الحر ${c.freeDiscountPct} %`));
      if (c.kind === 'deactivated') return esc(L('Droits désactivés : règles d’avant', 'Permissions switched off: previous rules', 'الحقوق تطفّاو: القواعد القديمة'));
      if (c.kind === 'legacy-dismissed') return esc(L('Anciens réglages de l’appareil écartés', 'Old device settings dropped', 'الإعدادات القديمة ديال الجهاز تخلّاو'));
      if (c.kind === 'settings' || (c.kind === 'undo' && c.freeDiscountPct != null && !c.added)) {
        return esc(L(`Remise libre : ${c.freeDiscountPct} %`, `Free discount: ${c.freeDiscountPct} %`, `التخفيض الحر: ${c.freeDiscountPct} %`));
      }
      const head = c.kind === 'copy' ? L(`${who} reçoit les droits de ${esc(c.from || '')}`, `${who} gets ${esc(c.from || '')}'s permissions`, `${who} خدا الحقوق ديال ${esc(c.from || '')}`)
        : c.kind === 'legacy-import' ? L(`${who} · repris de l’appareil`, `${who} · carried over from the device`, `${who} · تنقل من الجهاز`)
          : c.kind === 'activate' ? (c.choice === 'preset' ? L(`${who} · rôle proposé`, `${who} · proposed role`, `${who} · الدور المقترح`) : L(`${who} · garde ses droits`, `${who} · keeps the permissions`, `${who} · بقا بالحقوق ديالو`))
            : c.kind === 'undo' ? L(`${who} · changement défait`, `${who} · change undone`, `${who} · التبديل ترجع`)
              : c.kind === 'preset' || c.kind === 'preset-reset' ? L(`Rôle ${who}`, `Role ${who}`, `الدور ${who}`) : who;
      const preset = c.preset && c.presetBefore && c.preset !== c.presetBefore ? ` · ${esc(presetLabel(c.presetBefore))} → ${esc(presetLabel(c.preset))}` : '';
      const delta = changes(c.added, c.removed);
      return head + preset + (delta ? ' ' + delta : '');
    };
    const undo = (a) => a.undoable ? btn('pm-undo', a.id, L('Défaire', 'Undo', 'رجّع'), true) : a.undone ? `<span class="pm-muted">${esc(L('défait', 'undone', 'ترجع'))}</span>` : '';
    return bar + `<div class="pm-log">${list.map((a) => `<div class="pm-entry"><time>${esc(when(a.ts))}</time><div class="${a.undone ? 'pm-gone' : ''}">${line(a)}${a.change && a.change.kind === 'unauthorized' ? '' : `<span class="pm-muted">${esc(L('par', 'by', 'دارها'))} ${esc(actorText(a.actor))}</span>`}</div><div>${undo(a)}</div></div>`).join('')}</div>`;
  }

  function render() {
    css();
    let main;
    if (!state.loaded) main = `<p class="pm-note">${esc(L('Chargement des droits…', 'Loading permissions…', 'كنجيبو الحقوق…'))}</p>`;
    else if (state.error || !state.data || !C()) {
      main = `<p class="pm-note">${esc(state.error === 'forbidden-merchant' ? L('Cet écran est réservé au propriétaire de la boutique.', 'This screen is for the store owner.', 'هاد الصفحة غير لمول المحل.')
        : L('Les droits n’ont pas pu être chargés. Vérifiez la connexion puis réessayez.', 'Permissions could not be loaded. Check the connection and try again.', 'ما قدرناش نجيبو الحقوق. شوف الكونيكسيون وعاود.'))}</p>${btn('pm-refresh', null, L('Réessayer', 'Retry', 'عاود'), true)}`;
    } else if (state.data.missingTables) {
      main = `<p class="pm-note warn">${esc(L('Les droits ne sont pas encore installés sur le serveur. En attendant, rien ne change : chaque geste garde sa règle d’avant.', 'Permissions are not installed on the server yet. Meanwhile nothing changes: every action keeps its previous rule.', 'الحقوق مازال ما تزادو فالسيرفور. حتى لداك الساعة والو ما كيتبدّل: كل حركة باقة بالقاعدة القديمة.'))}</p>`;
    } else if (!state.data.configured) {
      main = activationView();
    } else {
      const d = state.data;
      const tab = (k, label) => `<button type="button" data-lens-item class="${state.tab === k ? 'on' : ''}" data-action="pm-tab" data-arg="${k}" aria-pressed="${state.tab === k}">${label}</button>`;
      const flagged = !ro() && d.unauthorizedWeek ? `<span class="pm-count">${esc(d.unauthorizedWeek)}</span>` : '';
      const note = ro() ? `<p class="pm-note">${esc(L('Lecture seule : seul le propriétaire change les droits.', 'Read only: only the owner changes permissions.', 'غير للقراءة: غير مول المحل اللي يبدّل الحقوق.'))}</p>` : '';
      const toReview = !ro() && d.heldCount ? `<span class="pm-count">${esc(d.heldCount)}</span>` : '';
      main = `<div class="pm-bar"><div class="pm-tabs" data-lens-demo>${tab('team', esc(L('Équipe', 'Team', 'الفريق')) + toReview)}${tab('roles', esc(L('Rôles par défaut', 'Default roles', 'الأدوار')))}${tab('journal', esc(L('Journal', 'Log', 'الجورنال')) + flagged)}</div></div>${note}${state.tab === 'roles' ? rolesTab() : state.tab === 'journal' ? journalTab() : teamTab()}`;
    }
    window.Kiwi.appPage('permissions', {
      title: L('Droits de l’équipe', 'Team permissions', 'الحقوق ديال الفريق'),
      subtitle: L('Qui peut rembourser, annuler, toucher au stock et à l’argent. Chaque droit dit où il est tenu.', 'Who can refund, cancel, touch stock and money. Each permission says where it is enforced.', 'شكون يقدر يرجّع، يلغي، يقيس السلعة والفلوس. كل حق كيقول فين كيتراقب.'),
      body: `<div class="pm-page" data-pm-page>${main}</div>`,
    });
    wire();
  }
  /* Champs : écoutés sur la page, sans data-action (pas des clics). */
  function wire() {
    const page = document.querySelector('[data-pm-page]');
    if (!page) return;
    const search = page.querySelector('[data-pm-search]');
    if (search) search.addEventListener('input', () => {
      state.q = search.value; const pos = search.selectionStart;
      render();
      const again = document.querySelector('[data-pm-search]');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
    });
    page.querySelectorAll('[data-pm-preset]').forEach((sel) => sel.addEventListener('change', () => {
      const s = person(sel.getAttribute('data-pm-preset'));
      if (!s) return;
      /* Changer de rôle repart des droits de ce rôle. */
      state.drafts[s.key] = { preset: sel.value, perms: C().presetPerms(sel.value, presetsOf()) };
      render();
    }));
    page.querySelectorAll('[data-pm-choice]').forEach((sel) => sel.addEventListener('change', () => {
      state.choices[sel.getAttribute('data-pm-choice')] = sel.value; render();
    }));
    const pct = page.querySelector('[data-pm-pct]');
    if (pct) pct.addEventListener('change', () => { state.pct = pct.value; });
    page.querySelectorAll('[data-pm-legacy]').forEach((box) => box.addEventListener('change', () => {
      state.legacyAccept[box.getAttribute('data-pm-legacy')] = box.checked;
    }));
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const arg = (el, a) => (typeof el === 'string' ? el : a) || '';
  async function act(body, okText) {
    if (state.busy) return null;
    state.busy = true;
    try {
      const out = await send(body);
      if (out) { if (okText) toast(okText, { type: 'success' }); await load(); }
      return out;
    } finally { state.busy = false; render(); }
  }
  handlers['nav-permissions'] = async () => { state.loaded = false; state.open = ''; render(); await load(); render(); };
  handlers['pm-refresh'] = async () => { state.loaded = false; render(); await load(); render(); };
  handlers['pm-tab'] = (el, a) => { const k = arg(el, a); state.tab = ['team', 'roles', 'journal'].includes(k) ? k : 'team'; state.confirmOff = false; render(); };
  handlers['pm-expand'] = (el, a) => { const g = arg(el, a); state.expanded = state.expanded === g ? '' : g; render(); };
  handlers['pm-open'] = (el, a) => {
    const k = arg(el, a); state.open = state.open === k ? '' : k; render();
    const panel = state.open && document.querySelector('[data-pm-panel]');
    if (panel && panel.offsetParent && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  handlers['pm-filter'] = (el, a) => { state.filter = arg(el, a) === 'unauthorized' ? 'unauthorized' : 'all'; render(); };
  handlers['pm-toggle'] = (el, a) => {
    const [key, perm] = arg(el, a).split('|');
    const s = person(key);
    if (!s || ro()) return;
    const dr = draftOf(s);
    state.drafts[key] = { preset: dr.preset, perms: dr.perms.includes(perm) ? dr.perms.filter((p) => p !== perm) : dr.perms.concat(perm) };
    render();
  };
  handlers['pm-revert'] = (el, a) => { delete state.drafts[arg(el, a)]; render(); };
  handlers['pm-save'] = (el, a) => {
    const key = arg(el, a), s = person(key), dr = s && state.drafts[key];
    if (!s || !dr) return null;
    return act({ action: 'save-staff', key, preset: dr.preset, perms: dr.perms }, L(`Droits de ${s.name} enregistrés`, `${s.name}'s permissions saved`, `الحقوق ديال ${s.name} تسجّلو`));
  };
  handlers['pm-copy'] = (el, a) => {
    const key = arg(el, a), s = person(key);
    const sel = document.querySelector(`[data-pm-copyfrom="${CSS.escape(key)}"]`);
    const from = sel && sel.value ? person(sel.value) : null;
    if (!s) return null;
    if (!from) { toast(L('Choisissez d’abord une personne.', 'Pick a person first.', 'ختار شي واحد قبل.'), { type: 'error' }); return null; }
    return act({ action: 'copy-from', key, from: from.key }, L(`${s.name} a maintenant les droits de ${from.name}`, `${s.name} now has ${from.name}'s permissions`, `${s.name} ولا عندو نفس الحقوق ديال ${from.name}`));
  };
  handlers['pm-ptoggle'] = (el, a) => {
    const [id, perm] = arg(el, a).split('|');
    if (ro()) return;
    const list = state.presetDrafts[id] || (presetsOf()[id] || []).slice();
    state.presetDrafts[id] = list.includes(perm) ? list.filter((p) => p !== perm) : list.concat(perm);
    render();
  };
  handlers['pm-preset-save'] = (el, a) => {
    const id = arg(el, a), list = state.presetDrafts[id];
    return list ? act({ action: 'save-preset', preset: id, perms: list }, L('Rôle enregistré', 'Role saved', 'الدور تسجّل')) : null;
  };
  handlers['pm-preset-reset'] = (el, a) => act({ action: 'reset-preset', preset: arg(el, a) }, L('Rôle remis à l’origine', 'Role reset', 'الدور رجع كيف كان'));
  handlers['pm-limit-save'] = () => {
    const input = document.querySelector('[data-pm-limit]');
    const pct = Math.round(Number(input && input.value));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast(L('Entre 0 et 100 %', 'Between 0 and 100 %', 'بين 0 و100 %'), { type: 'error' }); return null; }
    return act({ action: 'settings', freeDiscountPct: pct }, L('Seuil de remise enregistré', 'Discount limit saved', 'حد التخفيض تسجّل'));
  };
  handlers['pm-activate'] = () => {
    const d = state.data;
    if (!d) return null;
    const pct = Math.round(Number(state.pct == null ? d.freeDiscountPct : state.pct));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast(L('Entre 0 et 100 %', 'Between 0 and 100 %', 'بين 0 و100 %'), { type: 'error' }); return null; }
    const choices = {};
    d.staff.forEach((s) => { choices[s.key] = state.choices[s.key] || (s.custom ? 'keep' : 'today'); });
    return act({ action: 'activate', choices, freeDiscountPct: pct }, L('Droits activés', 'Permissions switched on', 'الحقوق تشعّلو'));
  };
  handlers['pm-deactivate'] = () => {
    if (!state.confirmOff) { state.confirmOff = true; render(); return null; }
    return act({ action: 'deactivate' }, L('Droits désactivés : règles d’avant', 'Permissions switched off', 'الحقوق تطفّاو'));
  };
  handlers['pm-legacy-import'] = () => {
    const lg = state.legacy;
    if (!lg) return null;
    const accept = lg.people.filter((p) => state.legacyAccept[p.key]).map((p) => p.key);
    if (!accept.length) { toast(L('Cochez au moins une personne, ou écartez tout.', 'Tick at least one person, or drop all.', 'علّم على شي واحد على الأقل، ولا خلّيهم كاملين.'), { type: 'error' }); return null; }
    return act({ action: 'import-legacy', legacy: lg.doc, accept }, L(`${accept.length} personne(s) reprise(s)`, `${accept.length} person(s) carried over`, `تنقلو ${accept.length} ديال الناس`));
  };
  handlers['pm-legacy-dismiss'] = () => act({ action: 'legacy-dismiss' }, L('Anciens réglages écartés', 'Old settings dropped', 'الإعدادات القديمة تخلّاو'));
  handlers['pm-review-open'] = (el, a) => { state.reviewOpen = arg(el, a) !== 'close'; render(); };
  handlers['pm-review'] = () => {
    const keys = (state.data.staff || []).filter((s) => s.held).map((s) => s.key);
    if (!keys.length) return null;
    state.reviewOpen = false;
    return act({ action: 'review-held', keys }, L('Revue faite : droits rendus', 'Reviewed: permissions given back', 'تراجعات: الحقوق رجعات'));
  };
  handlers['pm-undo'] = (el, a) => {
    const id = Number(arg(el, a));
    return id ? act({ action: 'undo', id }, L('Changement défait', 'Change undone', 'التبديل ترجع')) : null;
  };
  window.addEventListener('kiwi:langchange', () => { if (document.querySelector('[data-pm-page]')) render(); });
})();

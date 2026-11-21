/* Droits de l'équipe · l'écran du propriétaire (Équipe → Droits).
 *
 * Lit et écrit /api/permissions (functions/api/permissions.js). Trois onglets :
 *   · Équipe  : une ligne par personne, une colonne par groupe de droits ; un
 *               groupe se déplie en ses droits un par un ; chaque personne a
 *               son rôle par défaut, ses ajouts et retraits, « copier depuis »
 *               une autre, et une phrase en clair de ce qu'elle peut faire ;
 *   · Rôles   : les rôles par défaut (le propriétaire reste verrouillé) et le
 *               seuil de remise libre ;
 *   · Journal : qui a changé quoi, quand, et ce qui a été fait sans le droit.
 * Le catalogue (assets/permissions-catalog.js) est le même que celui du
 * serveur. Ce qui est masqué ici ne protège rien : le serveur relit tout.
 * Au premier enregistrement, les anciens réglages que le navigateur gardait
 * (KiwiPlatform.access) sont repris une fois par le serveur.
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
  /* Material Symbols, Outlined 400 (assets/icons/material/lock.svg, expand_more). */
  const LOCK = 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z';
  const lockIc = `<svg class="pm-i" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${LOCK}"/></svg>`;

  const state = { loaded: false, error: '', data: null, tab: 'team', q: '', expanded: '', open: '', drafts: {}, presetDrafts: {}, busy: false };

  function css() {
    if (document.getElementById('pm-css')) return;
    const sheetStyle = document.createElement('style');
    sheetStyle.id = 'pm-css';
    sheetStyle.textContent = `
.pm-page{display:grid;gap:14px}
.pm-i{width:14px;height:14px;flex:none;vertical-align:-2px}
.pm-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.pm-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--n-100,#F2F0EA)}
.pm-tabs button{border:0;background:transparent;padding:7px 14px;border-radius:9px;font:inherit;font-size:13px;color:var(--n-600,#4B4944);cursor:pointer}
.pm-tabs button.on{background:var(--surface,#FFFDFA);color:var(--ink,#0A0F0D)}
.pm-search{min-width:220px;flex:1;max-width:360px;padding:8px 12px;border-radius:10px;border:1px solid var(--n-200,#E8E6E0);background:var(--surface,#FFFDFA);font:inherit;font-size:13px;color:inherit}
.pm-note{margin:0;padding:10px 14px;border-radius:12px;background:var(--n-100,#F2F0EA);font-size:13px;line-height:1.5;color:var(--n-600,#4B4944)}
.pm-scroll{overflow-x:auto;border:1px solid var(--n-200,#E8E6E0);border-radius:16px;background:var(--surface,#FFFDFA)}
.pm-grid{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.pm-grid th,.pm-grid td{padding:9px 10px;border-bottom:1px solid var(--n-200,#E8E6E0);text-align:start;vertical-align:middle;white-space:nowrap}
.pm-grid thead th{font-weight:500;font-size:12px;color:var(--n-500,#6F6C65);background:var(--n-50,#FAFAF8)}
.pm-grid .pm-who{position:sticky;inset-inline-start:0;background:var(--surface,#FFFDFA);z-index:1;min-width:190px;white-space:normal}
.pm-grid thead .pm-who{background:var(--n-50,#FAFAF8)}
.pm-name{border:0;background:none;padding:0;font:inherit;font-weight:500;color:var(--ink,#0A0F0D);cursor:pointer;text-align:start}
.pm-role{display:block;font-size:11.5px;color:var(--n-500,#6F6C65);margin-top:2px}
.pm-colbtn{border:0;background:none;font:inherit;font-size:12px;color:inherit;cursor:pointer;padding:2px 4px;border-radius:6px}
.pm-colbtn[aria-expanded="true"]{color:var(--atlas,#0B6E4F)}
.pm-sub{font-size:11px;max-width:120px;white-space:normal;line-height:1.3}
.pm-cell{min-width:46px;border:1px solid var(--n-200,#E8E6E0);background:transparent;border-radius:999px;padding:3px 9px;font:inherit;font-size:12px;cursor:pointer;color:var(--n-500,#6F6C65)}
.pm-cell.full{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
.pm-cell.part{border-color:var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F)}
.pm-tog{width:30px;height:18px;border-radius:999px;border:1px solid var(--n-300,#D4D1C8);background:var(--n-100,#F2F0EA);position:relative;cursor:pointer;padding:0}
.pm-tog::after{content:"";position:absolute;top:2px;inset-inline-start:2px;width:12px;height:12px;border-radius:50%;background:var(--n-400,#A8A49A);transition:inset-inline-start .18s ease,background .18s ease}
.pm-tog[aria-pressed="true"]{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F)}
.pm-tog[aria-pressed="true"]::after{inset-inline-start:14px;background:var(--paper,#F7F5F0)}
.pm-tog:disabled{opacity:.45;cursor:not-allowed}
.pm-sel{padding:5px 8px;border-radius:8px;border:1px solid var(--n-200,#E8E6E0);background:var(--surface,#FFFDFA);font:inherit;font-size:12.5px;color:inherit}
.pm-dirty td{background:rgba(11,110,79,.05)}
.pm-acts{display:inline-flex;gap:6px}
.pm-panel td{white-space:normal;background:var(--n-50,#FAFAF8)}
.pm-sum{margin:0 0 12px;font-size:14px;line-height:1.55;color:var(--ink,#0A0F0D)}
.pm-groups{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pm-card{border:1px solid var(--n-200,#E8E6E0);border-radius:14px;padding:12px 14px;background:var(--surface,#FFFDFA)}
.pm-card h4{margin:0 0 8px;font-size:13px;font-weight:600}
.pm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;font-size:12.5px}
.pm-copy{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;font-size:12.5px}
.pm-roles{display:grid;gap:14px}
.pm-rolehead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.pm-rolehead h3{margin:0;font-size:15px;font-weight:600}
.pm-log{display:grid;gap:0;border:1px solid var(--n-200,#E8E6E0);border-radius:16px;background:var(--surface,#FFFDFA)}
.pm-entry{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:11px 16px;border-top:1px solid var(--n-200,#E8E6E0);font-size:13px;line-height:1.5}
.pm-entry:first-child{border-top:0}
.pm-entry time{font-family:var(--mono,'JetBrains Mono',monospace);font-size:11.5px;color:var(--n-500,#6F6C65)}
.pm-entry .pm-flag{color:#8B2A2A}
.pm-plus{color:var(--atlas,#0B6E4F)}
.pm-minus{color:var(--n-600,#4B4944)}
@media(max-width:640px){.pm-entry{grid-template-columns:1fr;gap:2px}.pm-search{max-width:none}}
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
      state.data = j; state.drafts = {}; state.presetDrafts = {};
    } catch (_) { state.error = 'offline'; }
    state.loaded = true;
  }
  async function send(body) {
    const r = await fetch('/api/permissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ merchant: slug() }, body)) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error === 'owner-required' ? L('Seul le propriétaire change les droits.', 'Only the owner changes permissions.', 'غير مول المحل اللي يقدر يبدّل الحقوق.')
          : L('Enregistrement impossible. Réessayez.', 'Could not save. Try again.', 'ما تسجّلش. عاود المحاولة.');
      toast(msg, { type: 'error' });
      return null;
    }
    return j;
  }
  /* Les anciens réglages du navigateur : repris une fois, avant la première écriture. */
  async function importLegacyOnce() {
    const d = state.data;
    if (!d || d.legacyImported) return;
    let doc = null;
    try { doc = window.KiwiPlatform?.access?.read?.() || null; } catch (_) { doc = null; }
    const has = doc && ((doc.grants || []).length || (doc.denies || []).length);
    if (!has) return;
    const out = await send({ action: 'import-legacy', legacy: { grants: doc.grants || [], denies: doc.denies || [] } });
    if (out && out.imported) toast(L(`${out.imported} réglage(s) repris de cet appareil`, `${out.imported} setting(s) carried over from this device`, `تنقلو ${out.imported} ديال الإعدادات من هاد الجهاز`), { type: 'success' });
    d.legacyImported = true;
  }

  /* ── Aides ───────────────────────────────────────────────────────────── */
  const person = (key) => (state.data?.staff || []).find((s) => s.key === key);
  const isOwner = (s) => s && s.preset === 'owner';
  function draftOf(s) {
    const d = state.drafts[s.key];
    return d || { preset: s.preset, perms: s.perms.slice() };
  }
  const dirty = (s) => {
    const d = state.drafts[s.key];
    if (!d) return false;
    return d.preset !== s.preset || d.perms.slice().sort().join() !== s.perms.slice().sort().join();
  };
  const presetLabel = (id) => (C().PRESET_LABEL[id] || {})[lang()] || id;
  const groupLabel = (g) => g[lang()];
  const permLabel = (id) => C().label(id, lang());
  const presetsOf = () => (state.data && state.data.presets) || C().DEFAULT_PRESETS;

  /* ── Rendu ───────────────────────────────────────────────────────────── */
  function teamTab() {
    const d = state.data, Cat = C();
    const q = fold(state.q);
    const rows = d.staff.filter((s) => !q || fold(s.name + ' ' + (s.role || '') + ' ' + presetLabel(s.preset)).includes(q));
    const head = Cat.GROUPS.map((g) => {
      const open = state.expanded === g.id;
      const btn = `<button type="button" class="pm-colbtn" data-action="pm-expand" data-arg="${g.id}" aria-expanded="${open}">${esc(groupLabel(g))}</button>`;
      if (!open) return `<th>${btn}</th>`;
      return `<th colspan="${g.perms.length}">${btn}</th>`;
    }).join('');
    const sub = state.expanded ? `<tr><th class="pm-who"></th><th></th>${Cat.GROUPS.map((g) => g.id === state.expanded
      ? g.perms.map((p) => `<th class="pm-sub">${esc(p[lang()])}</th>`).join('') : '<th></th>').join('')}<th></th></tr>` : '';
    const body = rows.map((s) => {
      const dr = draftOf(s), owner = isOwner(s), dd = dirty(s);
      const cells = Cat.GROUPS.map((g) => {
        if (state.expanded === g.id) {
          return g.perms.map((p) => `<td><button type="button" class="pm-tog" data-action="pm-toggle" data-arg="${esc(s.key)}|${p.id}" aria-pressed="${dr.perms.includes(p.id)}" aria-label="${esc(p[lang()])}" ${owner || d.readOnly ? 'disabled' : ''}></button></td>`).join('');
        }
        const n = g.perms.filter((p) => dr.perms.includes(p.id)).length;
        const cls = n === g.perms.length ? 'full' : n ? 'part' : '';
        return `<td><button type="button" class="pm-cell ${cls}" data-action="pm-expand" data-arg="${g.id}" title="${esc(groupLabel(g))}">${n}/${g.perms.length}</button></td>`;
      }).join('');
      const preset = owner ? `<span class="pm-role">${lockIc} ${esc(presetLabel('owner'))}</span>`
        : `<select class="pm-sel" data-pm-preset="${esc(s.key)}" ${d.readOnly ? 'disabled' : ''}>${Cat.PRESET_IDS.filter((id) => id !== 'owner').map((id) => `<option value="${id}" ${dr.preset === id ? 'selected' : ''}>${esc(presetLabel(id))}</option>`).join('')}</select>`;
      const acts = dd ? `<span class="pm-acts"><button type="button" class="kb" data-action="pm-save" data-arg="${esc(s.key)}">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button><button type="button" class="kb ghost" data-action="pm-revert" data-arg="${esc(s.key)}">${esc(L('Annuler', 'Cancel', 'إلغاء'))}</button></span>` : '';
      const row = `<tr class="${dd ? 'pm-dirty' : ''}"><td class="pm-who"><button type="button" class="pm-name" data-action="pm-open" data-arg="${esc(s.key)}" aria-expanded="${state.open === s.key}">${esc(s.name)}</button><span class="pm-role">${esc(s.role || '')}</span></td><td>${preset}</td>${cells}<td>${acts}</td></tr>`;
      return row + (state.open === s.key ? panelRow(s) : '');
    }).join('');
    const cols = 3 + Cat.GROUPS.reduce((n, g) => n + (state.expanded === g.id ? g.perms.length : 1), 0);
    return `<div class="pm-bar"><input class="pm-search" type="search" data-pm-search value="${esc(state.q)}" placeholder="${esc(L('Chercher une personne ou un rôle', 'Search a person or a role', 'قلّب على شخص ولا دور'))}" aria-label="${esc(L('Chercher', 'Search', 'بحث'))}">
      <span class="pm-role">${esc(L('Touchez un groupe pour voir ses droits un par un.', 'Tap a group to see its permissions one by one.', 'ضغط على مجموعة باش تشوف الحقوق ديالها وحدة بوحدة.'))}</span></div>
      <div class="pm-scroll"><table class="pm-grid"><thead><tr><th class="pm-who">${esc(L('Personne', 'Person', 'الشخص'))}</th><th>${esc(L('Rôle', 'Role', 'الدور'))}</th>${head}<th></th></tr>${sub}</thead>
      <tbody>${body || `<tr><td colspan="${cols}">${esc(L('Personne ne correspond.', 'Nobody matches.', 'حتى واحد ما كيطابق.'))}</td></tr>`}</tbody></table></div>`;
  }
  function panelRow(s) {
    const d = state.data, Cat = C(), dr = draftOf(s), owner = isOwner(s);
    const cols = 3 + Cat.GROUPS.reduce((n, g) => n + (state.expanded === g.id ? g.perms.length : 1), 0);
    const others = d.staff.filter((o) => o.key !== s.key);
    const copy = owner || d.readOnly ? '' : `<div class="pm-copy"><label>${esc(L('Copier les droits de', 'Copy permissions from', 'نسخ الحقوق ديال'))} <select class="pm-sel" data-pm-copyfrom="${esc(s.key)}">${others.map((o) => `<option value="${esc(o.key)}">${esc(o.name)}</option>`).join('')}</select></label>
      <button type="button" class="kb ghost" data-action="pm-copy" data-arg="${esc(s.key)}">${esc(L('Copier', 'Copy', 'نسخ'))}</button></div>`;
    const groups = Cat.GROUPS.map((g) => `<div class="pm-card"><h4>${esc(groupLabel(g))}</h4>${g.perms.map((p) => `<div class="pm-row"><span>${esc(p[lang()])}</span><button type="button" class="pm-tog" data-action="pm-toggle" data-arg="${esc(s.key)}|${p.id}" aria-pressed="${dr.perms.includes(p.id)}" aria-label="${esc(p[lang()])}" ${owner || d.readOnly ? 'disabled' : ''}></button></div>`).join('')}</div>`).join('');
    return `<tr class="pm-panel"><td colspan="${cols}"><p class="pm-sum">${esc(Cat.summary(dr.perms, s.name, lang()))}</p>${copy}<div class="pm-groups">${groups}</div></td></tr>`;
  }
  function rolesTab() {
    const d = state.data, Cat = C(), presets = presetsOf();
    const limit = `<div class="pm-card"><div class="pm-rolehead"><h3>${esc(L('Remise libre', 'Free discount', 'التخفيض الحر'))}</h3></div>
      <p class="pm-role">${esc(L('Jusqu’à ce pourcentage, toute l’équipe peut faire une remise. Au-delà, il faut le droit « Remise au-delà du seuil libre » ou le code d’un responsable.', 'Up to this percentage, anyone can give a discount. Above it, the person needs the “Discount above the free limit” permission or a manager code.', 'حتى لهاد النسبة، أي واحد فالفريق يقدر يدير تخفيض. فوقها، خاص الحق ديال «تخفيض فوق الحد الحر» ولا كود المسيّر.'))}</p>
      <div class="pm-copy"><input class="pm-sel" type="number" min="0" max="100" step="1" data-pm-limit value="${esc(d.freeDiscountPct)}" ${d.readOnly ? 'disabled' : ''} aria-label="%"> %
      <button type="button" class="kb ghost" data-action="pm-limit-save" ${d.readOnly ? 'disabled' : ''}>${esc(L('Enregistrer', 'Save', 'سجّل'))}</button></div></div>`;
    const cards = Cat.PRESET_IDS.map((id) => {
      const owner = id === 'owner';
      const list = state.presetDrafts[id] || presets[id] || [];
      const changed = !!state.presetDrafts[id];
      const custom = (d.customPresets || []).includes(id);
      const groups = Cat.GROUPS.map((g) => `<div class="pm-card"><h4>${esc(groupLabel(g))}</h4>${g.perms.map((p) => `<div class="pm-row"><span>${esc(p[lang()])}</span><button type="button" class="pm-tog" data-action="pm-ptoggle" data-arg="${id}|${p.id}" aria-pressed="${list.includes(p.id)}" aria-label="${esc(p[lang()])}" ${owner || d.readOnly ? 'disabled' : ''}></button></div>`).join('')}</div>`).join('');
      const acts = owner ? `<span class="pm-role">${lockIc} ${esc(L('Verrouillé : le propriétaire a tout.', 'Locked: the owner has everything.', 'مسدود: مول المحل عندو كلشي.'))}</span>`
        : `<span class="pm-acts">${changed ? `<button type="button" class="kb" data-action="pm-preset-save" data-arg="${id}">${esc(L('Enregistrer', 'Save', 'سجّل'))}</button>` : ''}${custom ? `<button type="button" class="kb ghost" data-action="pm-preset-reset" data-arg="${id}">${esc(L('Revenir au rôle d’origine', 'Back to the original role', 'رجّع الدور الأصلي'))}</button>` : ''}</span>`;
      return `<section class="pm-card"><div class="pm-rolehead"><h3>${esc(presetLabel(id))}</h3>${acts}</div><p class="pm-sum">${esc(Cat.summary(list, presetLabel(id), lang()))}</p><div class="pm-groups">${groups}</div></section>`;
    }).join('');
    return `<div class="pm-roles">${limit}<p class="pm-note">${esc(L('Un rôle modifié s’applique à toutes les personnes qui l’ont, sauf leurs propres ajouts et retraits.', 'A changed role applies to everyone who has it, except their own additions and removals.', 'الدور اللي تبدّل كيطبّق على كاع اللي عندهم، من غير الزيادات والنقصان ديال كل واحد.'))}</p>${cards}</div>`;
  }
  function journalTab() {
    const d = state.data;
    if (d.readOnly) return `<p class="pm-note">${esc(L('Le journal des droits est réservé au propriétaire.', 'The permissions log is for the owner only.', 'سجل الحقوق خاص بمول المحل.'))}</p>`;
    const list = d.audit || [];
    if (!list.length) return `<p class="pm-note">${esc(L('Aucun changement pour l’instant.', 'No change yet.', 'حتى تبديل مازال.'))}</p>`;
    const names = (ids) => (ids || []).map(permLabel).join(', ');
    const line = (a) => {
      const c = a.change || {}, who = esc(a.subjectLabel || a.subject);
      if (c.kind === 'unauthorized') {
        return `<span class="pm-flag">${esc(L('Fait sans le droit', 'Done without the permission', 'تدار بلا الحق'))} · ${who} · ${esc(permLabel(c.permission))}${c.percent ? ' · ' + esc(c.percent) + ' %' : ''}${c.amountCents ? ' · ' + esc((c.amountCents / 100).toFixed(2)) + ' MAD' : ''}</span>`;
      }
      if (c.kind === 'settings') return esc(L(`Remise libre : ${c.freeDiscountPctBefore} % → ${c.freeDiscountPct} %`, `Free discount: ${c.freeDiscountPctBefore} % → ${c.freeDiscountPct} %`, `التخفيض الحر: ${c.freeDiscountPctBefore} % ← ${c.freeDiscountPct} %`));
      const head = c.kind === 'copy' ? L(`${who} reçoit les droits de ${esc(c.from || '')}`, `${who} gets ${esc(c.from || '')}'s permissions`, `${who} خدا الحقوق ديال ${esc(c.from || '')}`)
        : c.kind === 'legacy-import' ? L(`${who} · repris de l’appareil`, `${who} · carried over from the device`, `${who} · منقول من الجهاز`)
          : c.kind === 'preset' || c.kind === 'preset-reset' ? L(`Rôle ${who}`, `Role ${who}`, `الدور ${who}`) : who;
      const plus = c.added && c.added.length ? ` <span class="pm-plus">+ ${esc(names(c.added))}</span>` : '';
      const minus = c.removed && c.removed.length ? ` <span class="pm-minus">− ${esc(names(c.removed))}</span>` : '';
      const preset = c.preset && c.presetBefore && c.preset !== c.presetBefore ? ` · ${esc(presetLabel(c.presetBefore))} → ${esc(presetLabel(c.preset))}` : '';
      return head + preset + plus + minus;
    };
    return `<div class="pm-log">${list.map((a) => `<div class="pm-entry"><time>${esc(when(a.ts))}</time><div>${line(a)}<span class="pm-role">${esc(L('par', 'by', 'من طرف'))} ${esc(a.actor)}</span></div></div>`).join('')}</div>`;
  }

  function render() {
    css();
    let main;
    if (!state.loaded) main = `<p class="pm-note">${esc(L('Chargement des droits…', 'Loading permissions…', 'كنحمّلو الحقوق…'))}</p>`;
    else if (state.error || !state.data || !C()) {
      main = `<p class="pm-note">${esc(state.error === 'forbidden-merchant' ? L('Cet écran est réservé au propriétaire de la boutique.', 'This screen is for the store owner.', 'هاد الصفحة خاصة بمول المحل.')
        : L('Les droits n’ont pas pu être chargés. Vérifiez la connexion puis réessayez.', 'Permissions could not be loaded. Check the connection and try again.', 'ما قدرناش نحمّلو الحقوق. شوف الكونيكسيون وعاود.'))}</p><button type="button" class="kb ghost" data-action="pm-refresh">${esc(L('Réessayer', 'Retry', 'عاود'))}</button>`;
    } else {
      const d = state.data;
      const tab = (k, label) => `<button type="button" data-lens-item class="${state.tab === k ? 'on' : ''}" data-action="pm-tab" data-arg="${k}" aria-pressed="${state.tab === k}">${esc(label)}</button>`;
      const notes = [
        d.readOnly ? L('Lecture seule : seul le propriétaire change les droits.', 'Read only: only the owner changes permissions.', 'غير للقراءة: غير مول المحل اللي يبدّل الحقوق.') : '',
        d.configured === false && !d.readOnly ? L('Rien n’a encore été enregistré : chaque route garde sa règle d’avant (le code d’un responsable pour rembourser, annuler, corriger le stock). Votre premier enregistrement active ces droits.', 'Nothing saved yet: every action keeps its previous rule (a manager code to refund, cancel or adjust stock). Your first save switches these permissions on.', 'مازال ما تسجّل والو: كل عملية باقة بالقاعدة القديمة (كود المسيّر للترجيع، الإلغاء وتصحيح المخزون). أول تسجيل كيشعّل هاد الحقوق.') : '',
      ].filter(Boolean).map((t) => `<p class="pm-note">${esc(t)}</p>`).join('');
      main = `<div class="pm-bar"><div class="pm-tabs" data-lens-demo>${tab('team', L('Équipe', 'Team', 'الفريق'))}${tab('roles', L('Rôles par défaut', 'Default roles', 'الأدوار الأصلية'))}${tab('journal', L('Journal', 'Log', 'السجل'))}</div></div>${notes}${state.tab === 'roles' ? rolesTab() : state.tab === 'journal' ? journalTab() : teamTab()}`;
    }
    window.Kiwi.appPage('permissions', {
      title: L('Droits de l’équipe', 'Team permissions', 'حقوق الفريق'),
      subtitle: L('Qui peut rembourser, annuler, toucher au stock et à l’argent · vérifié par le serveur', 'Who can refund, cancel, touch stock and money · checked by the server', 'شكون يقدر يرجّع، يلغي، يقيس السلعة والفلوس · السيرفر كيتحقق'),
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
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */
  const arg = (el, a) => (typeof el === 'string' ? el : a) || '';
  handlers['nav-permissions'] = async () => {
    state.loaded = false; state.open = ''; render();
    await load(); render();
  };
  handlers['pm-refresh'] = async () => { state.loaded = false; render(); await load(); render(); };
  handlers['pm-tab'] = (el, a) => { const k = arg(el, a); state.tab = ['team', 'roles', 'journal'].includes(k) ? k : 'team'; render(); };
  handlers['pm-expand'] = (el, a) => { const g = arg(el, a); state.expanded = state.expanded === g ? '' : g; render(); };
  handlers['pm-open'] = (el, a) => { const k = arg(el, a); state.open = state.open === k ? '' : k; render(); };
  handlers['pm-toggle'] = (el, a) => {
    const [key, perm] = arg(el, a).split('|');
    const s = person(key);
    if (!s || isOwner(s) || state.data.readOnly) return;
    const dr = draftOf(s);
    const perms = dr.perms.includes(perm) ? dr.perms.filter((p) => p !== perm) : dr.perms.concat(perm);
    state.drafts[key] = { preset: dr.preset, perms };
    render();
  };
  handlers['pm-revert'] = (el, a) => { delete state.drafts[arg(el, a)]; render(); };
  handlers['pm-save'] = async (el, a) => {
    const key = arg(el, a), s = person(key), dr = s && state.drafts[key];
    if (!s || !dr || state.busy) return;
    state.busy = true;
    try {
      await importLegacyOnce();
      const out = await send({ action: 'save-staff', key, preset: dr.preset, perms: dr.perms });
      if (out) { toast(L(`Droits de ${s.name} enregistrés`, `${s.name}'s permissions saved`, `تسجّلو الحقوق ديال ${s.name}`), { type: 'success' }); await load(); }
    } finally { state.busy = false; render(); }
  };
  handlers['pm-copy'] = async (el, a) => {
    const key = arg(el, a), s = person(key);
    const sel = document.querySelector(`[data-pm-copyfrom="${CSS.escape(key)}"]`);
    const from = sel && person(sel.value);
    if (!s || !from || state.busy) return;
    state.busy = true;
    try {
      await importLegacyOnce();
      const out = await send({ action: 'copy-from', key, from: from.key });
      if (out) { toast(L(`${s.name} a maintenant les droits de ${from.name}`, `${s.name} now has ${from.name}'s permissions`, `${s.name} ولا عندو نفس الحقوق ديال ${from.name}`), { type: 'success' }); await load(); }
    } finally { state.busy = false; render(); }
  };
  handlers['pm-ptoggle'] = (el, a) => {
    const [id, perm] = arg(el, a).split('|');
    if (id === 'owner' || state.data.readOnly) return;
    const list = state.presetDrafts[id] || (presetsOf()[id] || []).slice();
    state.presetDrafts[id] = list.includes(perm) ? list.filter((p) => p !== perm) : list.concat(perm);
    render();
  };
  handlers['pm-preset-save'] = async (el, a) => {
    const id = arg(el, a), list = state.presetDrafts[id];
    if (!list || state.busy) return;
    state.busy = true;
    try {
      await importLegacyOnce();
      const out = await send({ action: 'save-preset', preset: id, perms: list });
      if (out) { toast(L('Rôle enregistré', 'Role saved', 'الدور تسجّل'), { type: 'success' }); await load(); }
    } finally { state.busy = false; render(); }
  };
  handlers['pm-preset-reset'] = async (el, a) => {
    const id = arg(el, a);
    if (state.busy) return;
    state.busy = true;
    try {
      const out = await send({ action: 'reset-preset', preset: id });
      if (out) { toast(L('Rôle remis à l’origine', 'Role reset', 'الدور رجع للأصل'), { type: 'success' }); await load(); }
    } finally { state.busy = false; render(); }
  };
  handlers['pm-limit-save'] = async () => {
    const input = document.querySelector('[data-pm-limit]');
    const pct = Math.round(Number(input && input.value));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast(L('Entre 0 et 100 %', 'Between 0 and 100 %', 'بين 0 و100 %'), { type: 'error' }); return; }
    if (state.busy) return;
    state.busy = true;
    try {
      await importLegacyOnce();
      const out = await send({ action: 'settings', freeDiscountPct: pct });
      if (out) { toast(L('Seuil de remise enregistré', 'Discount limit saved', 'حد التخفيض تسجّل'), { type: 'success' }); await load(); }
    } finally { state.busy = false; render(); }
  };
  window.addEventListener('kiwi:langchange', () => { if (document.querySelector('[data-pm-page]')) render(); });
})();

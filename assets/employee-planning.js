(function () {
  'use strict';
  const api = () => window.KiwiEmployeeLive;
  let lastData = null;
  let busy = false;

  const css = `
    .kep-card{border:1px solid rgba(10,15,13,.12);border-radius:22px;padding:20px;background:var(--paper,#f7f5f0);color:var(--ink,#0a0f0d);margin-top:16px}.kep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.kep-title{font-size:19px;font-weight:800}.kep-sub{font-size:13px;color:#68716d;margin-top:4px}.kep-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.kep-btn{min-height:42px;border:1px solid rgba(10,15,13,.15);border-radius:12px;padding:0 14px;background:transparent;color:inherit;font-weight:750}.kep-btn.primary{background:#0b6e4f;border-color:#0b6e4f;color:#fff}.kep-requests{display:grid;gap:8px;margin-top:16px}.kep-request{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid rgba(10,15,13,.1);padding-top:12px}.kep-request b{font-size:13px}.kep-request span{display:block;font-size:12px;color:#68716d;margin-top:3px}.kep-status{border-radius:999px;padding:6px 9px;background:rgba(10,15,13,.07);font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.kep-status.approved{background:rgba(11,110,79,.12);color:#0b6e4f}.kep-status.rejected,.kep-status.cancelled{background:rgba(10,15,13,.07);color:#68716d}.kep-overlay{position:fixed;inset:0;z-index:10050;background:rgba(5,12,9,.6);display:grid;place-items:center;padding:18px}.kep-sheet{width:min(540px,100%);max-height:min(760px,92dvh);overflow:auto;background:#f7f5f0;color:#0a0f0d;border-radius:24px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.kep-sheet-head{display:flex;justify-content:space-between;gap:16px}.kep-sheet h2{margin:0;font-size:25px}.kep-close{width:42px;height:42px;border:1px solid #cdd3cf;border-radius:12px;background:transparent;font-size:24px}.kep-field{display:grid;gap:7px;margin-top:17px}.kep-field label,.kep-label{font-size:12px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.kep-field input,.kep-field textarea{width:100%;box-sizing:border-box;border:1px solid #cdd3cf;border-radius:13px;background:#fff;color:#0a0f0d;min-height:48px;padding:11px 13px;font:inherit}.kep-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px}.kep-day{aspect-ratio:1;border:1px solid #cdd3cf;border-radius:11px;background:#fff;font-weight:800}.kep-day.on{background:#053b2c;color:#fff;border-color:#053b2c}.kep-check{display:flex;align-items:center;gap:10px;margin-top:17px}.kep-sheet-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}.kep-error{margin-top:12px;color:#0b6e4f;font-size:13px}.kep-empty{font-size:12px;color:#68716d;margin-top:14px}
    [data-theme="dark"] .kep-card,.dark .kep-card{background:#111713;color:#f7f5f0;border-color:#2b3731}[data-theme="dark"] .kep-sub,[data-theme="dark"] .kep-request span,.dark .kep-sub,.dark .kep-request span{color:#aeb8b2}
    @media(max-width:600px){.kep-card{padding:17px;border-radius:18px}.kep-head{display:block}.kep-actions{display:grid;grid-template-columns:1fr 1fr}.kep-btn{padding:0 9px}.kep-overlay{align-items:end;padding:0}.kep-sheet{width:100%;border-radius:24px 24px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));max-height:90dvh}.kep-days{gap:4px}.kep-day{border-radius:9px}}
  `;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
  function mount() {
    if (document.getElementById('kep-card')) return document.getElementById('kep-card');
    const anchor = document.getElementById('kg-sched-card');
    if (!anchor) return null;
    if (!document.getElementById('kep-css')) { const style=document.createElement('style'); style.id='kep-css'; style.textContent=css; document.head.appendChild(style); }
    const card = document.createElement('section');
    card.id = 'kep-card'; card.className = 'kep-card';
    anchor.insertAdjacentElement('afterend', card);
    card.addEventListener('click', onCardClick);
    render();
    return card;
  }
  function requestLabel(request) {
    const lang = document.documentElement.lang;
    const leave = lang === 'ar' ? 'إجازة' : lang === 'en' ? 'Leave' : 'Congé';
    const available = lang === 'ar' ? 'أوقات التوفر' : lang === 'en' ? 'Availability' : 'Disponibilités';
    const unavailable = lang === 'ar' ? 'غير متاح' : lang === 'en' ? 'Unavailable' : 'Indisponible';
    if (request.type === 'leave') return `${leave} · ${request.startDate} → ${request.endDate}`;
    const days = (request.weekdays || []).map((day) => ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][day]).join(', ');
    return request.available === false ? `${unavailable} · ${days}` : `${available} · ${days} · ${request.start}–${request.end}`;
  }
  function render() {
    const card = document.getElementById('kep-card'); if (!card) return;
    const requests = lastData && lastData.planning && Array.isArray(lastData.planning.requests) ? lastData.planning.requests.slice().reverse() : [];
    const visible = requests.slice(0, 4);
    card.innerHTML = `<div class="kep-head"><div><div class="kg-eyebrow">Mon planning</div><div class="kep-title">Disponibilités & congés</div><div class="kep-sub">Envoyez une demande au responsable sans message séparé.</div></div></div><div class="kep-actions"><button class="kep-btn" type="button" data-kep="availability">Mes disponibilités</button><button class="kep-btn primary" type="button" data-kep="leave">Demander un congé</button></div>${visible.length ? `<div class="kep-requests">${visible.map((request)=>`<div class="kep-request"><div><b>${esc(requestLabel(request))}</b>${request.reason ? `<span>${esc(request.reason)}</span>` : ''}</div><div><em class="kep-status ${esc(request.status)}">${esc(({pending:'En attente',approved:'Approuvée',rejected:'Refusée',cancelled:'Annulée'})[request.status] || request.status)}</em>${request.status === 'pending' ? `<button class="kep-btn" style="min-height:30px;margin-inline-start:6px;padding:0 8px" type="button" data-kep-cancel="${esc(request.id)}">Annuler</button>` : ''}</div></div>`).join('')}</div>` : '<div class="kep-empty">Aucune demande envoyée.</div>'}`;
  }
  function closeSheet() { document.querySelector('.kep-overlay')?.remove(); }
  function sheet(type) {
    closeSheet();
    const overlay = document.createElement('div'); overlay.className='kep-overlay';
    const days = ['D','L','M','M','J','V','S'];
    overlay.innerHTML = `<form class="kep-sheet" data-kep-form="${type}"><div class="kep-sheet-head"><div><div class="kg-eyebrow">Mon planning</div><h2>${type === 'leave' ? 'Demander un congé' : 'Indiquer mes disponibilités'}</h2></div><button class="kep-close" type="button" data-kep-close aria-label="Fermer">×</button></div>${type === 'leave' ? `<div class="kep-field"><label>Date de début</label><input type="date" name="startDate" required></div><div class="kep-field"><label>Date de fin</label><input type="date" name="endDate" required></div>` : `<div class="kep-field"><span class="kep-label">Jours concernés</span><div class="kep-days">${days.map((day,index)=>`<button class="kep-day${index>=1&&index<=5?' on':''}" type="button" data-kep-day="${index}" aria-pressed="${index>=1&&index<=5?'true':'false'}">${day}</button>`).join('')}</div></div><label class="kep-check"><input type="checkbox" name="available" checked><span>Je suis disponible ces jours</span></label><div data-kep-times><div class="kep-field"><label>À partir de</label><input type="time" name="start" value="09:00"></div><div class="kep-field"><label>Jusqu’à</label><input type="time" name="end" value="18:00"></div></div>`}<div class="kep-field"><label>Note au responsable (facultatif)</label><textarea name="reason" maxlength="240" rows="3"></textarea></div><div class="kep-error" data-kep-error hidden></div><div class="kep-sheet-foot"><button class="kep-btn" type="button" data-kep-close>Annuler</button><button class="kep-btn primary" type="submit">Envoyer la demande</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-kep-close]')) closeSheet();
      const day = event.target.closest('[data-kep-day]');
      if (day) { day.classList.toggle('on'); day.setAttribute('aria-pressed', day.classList.contains('on') ? 'true' : 'false'); }
    });
    overlay.querySelector('[name="available"]')?.addEventListener('change', (event) => { overlay.querySelector('[data-kep-times]').hidden = !event.target.checked; });
    overlay.querySelector('form').addEventListener('submit', submit);
  }
  async function onCardClick(event) {
    const cancel=event.target.closest('[data-kep-cancel]');
    if (cancel && !busy) { busy=true; cancel.disabled=true; try { await api().cancelPlanningRequest(cancel.dataset.kepCancel); await refresh(); } catch (_) { cancel.disabled=false; } finally { busy=false; } return; }
    const action=event.target.closest('[data-kep]')?.dataset.kep; if (action) sheet(action);
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const form=event.currentTarget, type=form.dataset.kepForm, error=form.querySelector('[data-kep-error]');
    const body={ type, reason:form.elements.reason.value.trim() };
    if (type === 'leave') { body.startDate=form.elements.startDate.value; body.endDate=form.elements.endDate.value; }
    else { body.weekdays=Array.from(form.querySelectorAll('[data-kep-day].on')).map((button)=>Number(button.dataset.kepDay)); body.available=form.elements.available.checked; body.start=form.elements.start.value; body.end=form.elements.end.value; }
    busy=true; form.querySelector('[type="submit"]').disabled=true;
    try { await api().requestPlanning(body); closeSheet(); await refresh(); }
    catch (failure) { error.hidden=false; error.textContent=failure.code === 'planning-date-invalid' ? 'Vérifiez les dates.' : failure.code === 'planning-availability-invalid' ? 'Choisissez au moins un jour et des heures valides.' : 'La demande n’a pas pu être envoyée. Réessayez.'; }
    finally { busy=false; if (form.isConnected) form.querySelector('[type="submit"]').disabled=false; }
  }
  async function refresh() {
    if (!api()) return;
    try { lastData=await api().refresh(); mount(); render(); } catch (_) {}
  }
  document.addEventListener('kiwi-employee-authenticated', refresh);
  window.addEventListener('load', () => { mount(); refresh(); });
})();

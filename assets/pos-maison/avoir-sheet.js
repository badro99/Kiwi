/* Avoir en paiement, caisse maison.
 *
 * L'ancienne feuille était un champ « AV-… » et une liste vide : sans le bon
 * papier sous la douchette, la caissière ne pouvait rien faire, et rien ne
 * disait ce que l'avoir allait laisser à payer. Celle-ci :
 *  - un seul champ prend le code (douchette ou clavier), le nom ou le
 *    téléphone de la cliente, et la liste se filtre pendant la frappe ;
 *  - les avoirs de la cliente du ticket sont posés d'office, et s'il n'y en a
 *    qu'un il est déjà choisi : un geste suffit ;
 *  - le calcul est écrit avant de valider : à régler, avoir, reste à payer,
 *    et ce qui restera sur le bon quand il n'est pas consommé en entier ;
 *  - la raison d'un refus reste écrite sous le champ (code inconnu, expiré à
 *    telle date, déjà utilisé), au lieu d'un toast de deux secondes.
 *
 * Le registre, le calcul du règlement et l'écriture restent dans checkout.js
 * (ctx.lookup, ctx.apply) : ce module ne fait que montrer et choisir. */

const tr = (x) => (globalThis.window?.KiwiCaisseLang || { tr: (y) => y }).tr(x);
const bidi = (s) => { const L = globalThis.window?.KiwiCaisseLang; return L && L.bidi ? L.bidi(String(s)) : String(s); };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = (name) => `<i data-icon="${name}"></i>`;
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const SOON = 14 * 864e5;

/* En arabe le code s'affiche isolé (U+2066…U+2069) : un copier-coller du bon
   emporte ces marques. Le pliage est celui du registre (O→0, I/L→1), pour
   qu'un code recopié à la main depuis le ticket imprimé se retrouve aussi. */
export const cleanCode = (x) => String(x || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, '').toUpperCase();
export const foldCode = (x) => cleanCode(x).replace(/O/g, '0').replace(/[IL]/g, '1');
/* La clé de comparaison : pliée et sans tiret (« av7kq2 » retrouve AV-7KQ2…). */
export const codeKey = (x) => foldCode(x).replace(/-/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/* Ce que la feuille montre pour une saisie. Pur, testé tel quel
   (tools/maison-avoir-sheet-test.mjs). */
export function avoirView({ query = '', mine = [], all = [], picked = '', portion = 0, due = 0 }) {
  const q = String(query || '').trim();
  const key = codeKey(q);
  /* Un avoir appartient à sa cliente. La liste ne montre que ceux de la
     cliente du ticket ; l'avoir de quelqu'un d'autre ne s'ouvre qu'avec son
     code complet, comme un bon au porteur (tools/avoir-customer-scope-browser-test.mjs).
     Ni un nom, ni un bout de code ne listent les avoirs des autres. */
  const exact = key.length >= 4 ? all.find((a) => codeKey(a.code) === key) || null : null;
  let mode, list;
  if (exact) { mode = 'code'; list = [exact]; }
  else if (!mine.length) { mode = 'walkin'; list = []; }
  else if (!q) { mode = 'mine'; list = mine; }
  else {
    const n = norm(q);
    mode = 'search';
    list = mine.filter((a) => norm(a.holderName).includes(n) || norm(a.motif).includes(n) || (key.length >= 2 && codeKey(a.code).includes(key)));
  }
  list = list.slice().sort((a, b) => +a.until - +b.until).slice(0, 6);
  const chosen = list.find((a) => a.code === picked) || exact || (mode === 'mine' && list.length === 1 ? list[0] : null);
  const take = chosen ? r2(Math.min(chosen.balance, portion)) : 0;
  return { mode, list, chosen, take, rest: r2(due - take), left: chosen ? r2(chosen.balance - take) : 0 };
}

/* Pourquoi un bon est refusé, dit en clair. */
export function refusal(av, { expired, active, untilOf }) {
  if (!av) return tr('Aucun avoir avec ce code, vérifiez-le sur le bon.');
  if (expired(av)) return av.until && +av.until ? `${tr('Cet avoir a expiré le')} ${untilOf(av)}.` : tr('Cet avoir a expiré.');
  if (!active(av)) return tr('Cet avoir est déjà entièrement utilisé.');
  return '';
}

const STYLE = `
.mzav-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 36px 16px 0}
[dir="rtl"] .mzav-head{margin:0 0 16px 36px}
.mzav-head .modal-title{margin:0}
.mzav-due{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.mzav-due span{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.mzav-due b{font:600 22px/1 var(--mono);color:var(--ink);font-variant-numeric:tabular-nums}
.mzav-scan{position:relative;display:flex;align-items:center;gap:10px;height:62px;padding-inline:14px 8px;border:1.5px dashed var(--mint-edge);border-radius:15px;background:var(--mint-tint);overflow:hidden;transition:border-color 160ms,background-color 160ms}
.mzav-scan:focus-within{border-style:solid;border-color:var(--forest);background:var(--paper-elev)}
.mzav-scan-ic{display:flex;color:var(--forest);flex-shrink:0}
.mzav-scan-ic svg{width:26px;height:26px;fill:currentColor}
.mzav-in{flex:1;min-width:0;height:100%;border:0;background:transparent;outline:none;color:var(--ink);font:500 18px/1 var(--mono);letter-spacing:.03em}
.mzav-in::placeholder{font:400 14.5px/1 var(--sans,inherit);letter-spacing:0;color:var(--ink-3)}
.mzav-go{width:46px;height:46px;border-radius:12px;background:var(--forest);color:var(--paper);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform 130ms}
.mzav-go:active{transform:scale(.94)}
.mzav-go svg{width:21px;height:21px;fill:currentColor}
[dir="rtl"] .mzav-go svg{transform:scaleX(-1)}
.mzav-beam{position:absolute;inset-inline:12px;top:50%;height:2px;border-radius:2px;background:var(--mint);box-shadow:0 0 12px var(--mint);opacity:0;pointer-events:none}
.mzav-scan.is-busy .mzav-beam{opacity:.95;animation:mzav-beam 760ms ease-in-out infinite alternate}
@keyframes mzav-beam{from{transform:translateY(-22px)}to{transform:translateY(22px)}}
.mzav-hint{margin:7px 3px 0;font-size:11.5px;color:var(--ink-3)}
.mzav-err{margin:8px 3px 0;font-size:12.5px;font-weight:500;color:var(--danger-mute)}
.mzav-sec{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:18px 3px 9px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.mzav-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;max-height:min(38vh,300px);overflow:auto;padding:2px;margin:-2px}
.mzav-card{--cut:112px;position:relative;display:flex;align-items:stretch;min-height:84px;padding:0;text-align:start;border:1px solid var(--line);border-radius:14px;background:var(--paper-elev);color:var(--ink);overflow:hidden;
  -webkit-mask:radial-gradient(circle 7px at var(--cut) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 7px at var(--cut) 100%,#0000 97%,#000) bottom/100% 51% no-repeat;
  mask:radial-gradient(circle 7px at var(--cut) 0,#0000 97%,#000) top/100% 51% no-repeat,radial-gradient(circle 7px at var(--cut) 100%,#0000 97%,#000) bottom/100% 51% no-repeat;
  transition:border-color 160ms,background-color 160ms,transform 310ms cubic-bezier(.34,1.45,.5,1);animation:mzav-in 310ms cubic-bezier(.34,1.45,.5,1) both}
[dir="rtl"] .mzav-card{--cut:calc(100% - 112px)}
.mzav-card:hover{border-color:var(--mint-edge)}
.mzav-card:active{transform:scale(.985)}
.mzav-card.is-picked{border-color:var(--forest);background:var(--mint-tint);box-shadow:inset 0 0 0 1px var(--forest)}
.mzav-stub{flex:0 0 112px;display:flex;flex-direction:column;justify-content:center;gap:3px;padding:10px 12px;background:var(--mz-ok-bg);border-inline-end:1.5px dashed var(--mint-edge)}
.mzav-stub b{font:600 17px/1.1 var(--mono);color:var(--forest);font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-.02em}
.mzav-stub small{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.mzav-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;padding:10px 30px 10px 13px}
[dir="rtl"] .mzav-body{padding:10px 13px 10px 30px}
.mzav-code{font:600 12.5px/1.2 var(--mono);letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mzav-who{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mzav-until{font-size:11px;color:var(--ink-3)}
.mzav-card.is-soon .mzav-until{color:var(--mz-warn);font-weight:600}
.mzav-tick{position:absolute;top:9px;inset-inline-end:9px;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--paper);transition:background-color 160ms,border-color 160ms}
.mzav-tick svg{width:13px;height:13px;fill:currentColor;transform:scale(0);transition:transform 310ms cubic-bezier(.34,1.45,.5,1)}
.mzav-card.is-picked .mzav-tick{background:var(--forest);border-color:var(--forest)}
.mzav-card.is-picked .mzav-tick svg{transform:scale(1)}
.mzav-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 16px;text-align:center;font-size:13px;color:var(--ink-3);border:1px dashed var(--line);border-radius:14px}
.mzav-empty svg{width:22px;height:22px;fill:currentColor;opacity:.7}
.mzav-math{display:grid;gap:7px;margin-top:14px;padding:13px 15px;border-radius:14px;background:var(--paper-soft);animation:mzav-in 310ms cubic-bezier(.34,1.45,.5,1) both}
.mzav-math[hidden]{display:none}
.mzav-row[hidden]{display:none}
.mzav-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:13px;color:var(--ink-2)}
.mzav-row .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.mzav-row.is-off .mono{color:var(--forest);font-weight:600}
.mzav-row.is-rest{margin-top:3px;padding-top:9px;border-top:1px dashed var(--line);font-size:14.5px;font-weight:600;color:var(--ink)}
.mzav-row.is-rest .mono{font-size:21px}
.mzav-row.is-rest.is-zero .mono{color:var(--forest)}
.mzav-row.is-left{font-size:11.5px;color:var(--ink-3)}
.mzav-foot{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:16px}
.mzav-foot .mz-btn{width:100%;min-height:52px}
.mzav-foot .mzav-ok{flex:2;display:flex;align-items:center;justify-content:center;gap:8px}
.mzav-foot .mzav-ok[disabled]{opacity:.45;box-shadow:none;cursor:default}
.mzav-ok .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.mzav-stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.mzav-stamp span{padding:4px 12px;border:2px solid var(--forest);border-radius:8px;background:var(--paper-elev);color:var(--forest);font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;transform:rotate(-7deg);animation:mzav-stamp 360ms cubic-bezier(.34,1.45,.5,1) both}
@keyframes mzav-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes mzav-stamp{from{opacity:0;transform:rotate(-7deg) scale(1.7)}to{opacity:1;transform:rotate(-7deg) scale(1)}}
@media (prefers-reduced-motion:reduce){.mzav-card,.mzav-math,.mzav-stamp span,.mzav-tick svg{animation:none;transition:none}.mzav-scan.is-busy .mzav-beam{animation:none;transform:none}}
@media (max-width:560px){.mzav-head{flex-direction:column;align-items:flex-start}.mzav-due{align-items:flex-start}.mzav-list{grid-template-columns:1fr}}
`;

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('mzav-css')) return;
  const style = document.createElement('style'); style.id = 'mzav-css'; style.textContent = STYLE; document.head.appendChild(style);
}

const reduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

/* Un montant qui change se déroule (360 ms) au lieu de sauter : l'œil suit
   « 1 250 → 950 » et comprend que l'avoir vient d'être retiré. */
function rollTo(node, from, to, fmt) {
  if (!node) return;
  if (reduced() || from === to || typeof requestAnimationFrame !== 'function') { node.textContent = bidi(fmt(to)); return; }
  const t0 = performance.now(), D = 360;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
    node.textContent = bidi(fmt(k < 1 ? Math.round(from + (to - from) * e) : to));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ctx : { due(), portion(), mine(), all(), fmt, untilOf(av),
   expired(av), active(av), lookup(code) → Promise<av|null>, apply(av),
   back(), icons(), closeBtns() } */
export function mzAvoirSheet(el, ctx) {
  ensureCss();
  let query = '', picked = '', busy = false, done = false, shownRest = ctx.due();
  const view = () => avoirView({ query, mine: ctx.mine(), all: ctx.all(), picked, portion: ctx.portion(), due: ctx.due() });
  el.innerHTML = `
    <button class="mz-modal-x" data-mz-close aria-label="${esc(tr('Fermer'))}"><i data-icon="close"></i></button>
    <div class="mzav-head">
      <h3 class="modal-title">${esc(tr('Avoir en paiement'))}</h3>
      <div class="mzav-due"><span>${esc(tr('À régler'))}</span><b>${esc(bidi(ctx.fmt(ctx.due())))}</b></div>
    </div>
    <form id="mz-av-code-form" class="mzav-scan" autocomplete="off">
      <span class="mzav-scan-ic" aria-hidden="true"><i data-icon="barcode_scanner"></i></span>
      <input class="mzav-in" id="mz-av-code" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"
        placeholder="${esc(tr('Scannez ou tapez le code du bon'))}" aria-label="${esc(tr('Code de l’avoir'))}" aria-describedby="mz-av-err" />
      <button class="mzav-go" type="submit" aria-label="${esc(tr('Chercher'))}"><i data-icon="arrow_forward"></i></button>
      <span class="mzav-beam" aria-hidden="true"></span>
    </form>
    <p class="mzav-hint">${esc(tr('La douchette remplit le champ toute seule.'))}</p>
    <p class="mzav-err" id="mz-av-err" role="alert" hidden></p>
    <div class="mzav-sec"><span data-av-label></span><span data-av-count></span></div>
    <div class="mzav-list" data-av-list role="listbox" aria-label="${esc(tr('Avoirs'))}"></div>
    <div class="mzav-math" data-av-math hidden>
      <div class="mzav-row"><span>${esc(tr('À régler'))}</span><span class="mono">${esc(bidi(ctx.fmt(ctx.due())))}</span></div>
      <div class="mzav-row is-off"><span data-av-codeline></span><span class="mono" data-av-take></span></div>
      <div class="mzav-row is-rest" data-av-restrow><span data-av-restlabel></span><span class="mono" data-av-rest></span></div>
      <div class="mzav-row is-left" data-av-leftrow hidden><span>${esc(tr('Restera sur le bon'))}</span><span class="mono" data-av-left></span></div>
    </div>
    <div class="mzav-foot">
      <button class="mz-btn secondary" id="mz-av-back" type="button">${esc(tr('Retour'))}</button>
      <button class="mz-btn primary mzav-ok" id="mz-av-ok" type="button" disabled><span data-av-oklabel></span><span class="mono" data-av-okamt></span></button>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const input = $('#mz-av-code'), err = $('#mz-av-err'), form = $('#mz-av-code-form'), ok = $('#mz-av-ok');
  const say = (msg) => { err.textContent = msg || ''; err.hidden = !msg; };

  const paint = () => {
    const v = view();
    picked = v.chosen ? v.chosen.code : '';
    const label = { mine: 'Avoirs de la cliente', walkin: 'Code du bon', code: 'Code du bon', search: 'Avoirs de la cliente' }[v.mode];
    $('[data-av-label]').textContent = tr(label);
    $('[data-av-count]').textContent = v.list.length ? String(v.list.length) : '';
    const soon = Date.now() + SOON;
    $('[data-av-list]').innerHTML = v.list.length ? v.list.map((a, i) => `
      <button type="button" class="mzav-card${a.code === picked ? ' is-picked' : ''}${+a.until && +a.until < soon ? ' is-soon' : ''}" data-mz-av-use="${esc(a.code)}" role="option" aria-selected="${a.code === picked}" style="animation-delay:${i * 40}ms">
        <span class="mzav-stub"><b>${esc(bidi(ctx.fmt(a.balance)))}</b><small>${esc(tr('Solde'))}</small></span>
        <span class="mzav-body">
          <span class="mzav-code">${esc(bidi(a.code))}</span>
          <span class="mzav-who" dir="auto"><bdi>${esc(a.holderName)}</bdi>${a.motif ? ` · <bdi>${esc(tr(a.motif))}</bdi>` : ''}</span>
          <span class="mzav-until">${+a.until && +a.until < soon ? `<span>${esc(tr('Expire bientôt'))}</span> · ` : `<span>${esc(tr("Valable jusqu'au"))}</span> `}${esc(ctx.untilOf(a))}</span>
        </span>
        <span class="mzav-tick" aria-hidden="true"><i data-icon="check"></i></span>
      </button>`).join('')
      : `<div class="mzav-empty">${icon(query ? 'search' : 'confirmation_number')}<span>${esc(tr(v.mode === 'walkin' ? 'Sans cliente sur le ticket, seul le code du bon ouvre un avoir.' : 'Aucun avoir trouvé'))}</span></div>`;
    const math = $('[data-av-math]');
    math.hidden = !v.chosen;
    if (v.chosen) {
      $('[data-av-codeline]').textContent = `${tr('Avoir')} ${bidi(v.chosen.code)}`;
      $('[data-av-take]').textContent = bidi('− ' + ctx.fmt(v.take));
      const zero = v.rest <= 0.009;
      $('[data-av-restrow]').classList.toggle('is-zero', zero);
      $('[data-av-restlabel]').textContent = tr(zero ? 'Payé en entier' : 'Reste à payer');
      rollTo($('[data-av-rest]'), shownRest, Math.max(0, v.rest), ctx.fmt);
      shownRest = Math.max(0, v.rest);
      $('[data-av-leftrow]').hidden = !(v.left > 0.009);
      $('[data-av-left]').textContent = bidi(ctx.fmt(v.left));
    } else shownRest = ctx.due();
    ok.disabled = !v.chosen || busy;
    $('[data-av-oklabel]').textContent = tr(v.chosen ? 'Déduire' : 'Choisissez un avoir');
    $('[data-av-okamt]').textContent = v.chosen ? bidi(ctx.fmt(v.take)) : '';
    ctx.icons();
    return v;
  };

  const confirm = () => {
    if (done || busy) return;
    const v = view();
    if (!v.chosen) { say(tr('Choisissez un avoir dans la liste.')); return; }
    done = true; ok.disabled = true;
    const card = el.querySelector(`[data-mz-av-use="${CSS_ESCAPE(v.chosen.code)}"]`);
    if (card && !reduced()) {
      const s = document.createElement('span'); s.className = 'mzav-stamp'; s.innerHTML = `<span>${esc(tr('Déduit'))}</span>`; card.appendChild(s);
      setTimeout(() => ctx.apply(v.chosen), 420);
    } else ctx.apply(v.chosen);
  };

  /* Entrée (ou la douchette, qui tape le code puis Entrée) : un bon déjà
     reconnu se déduit tout de suite, comme avant ; un code inconnu ici est
     demandé au registre (il a pu être émis par l'autre caisse). */
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || done) return;
    const raw = cleanCode(input.value);
    const v = view();
    if (v.chosen && (!raw || v.mode !== 'code' || codeKey(v.chosen.code) === codeKey(raw))) { confirm(); return; }
    if (!raw) { input.focus(); return; }
    if (v.mode === 'search' && !/\d/.test(raw)) { if (v.list.length) say(tr('Choisissez un avoir dans la liste.')); return; }
    busy = true; form.classList.add('is-busy'); say('');
    let av = null;
    try { av = await ctx.lookup(raw.replace(/^AV(?!-)/, 'AV-')); } catch (_) { av = null; }
    busy = false; form.classList.remove('is-busy');
    const why = refusal(av, { expired: ctx.expired, active: ctx.active, untilOf: ctx.untilOf });
    if (why) { say(why); paint(); input.focus(); input.select(); return; }
    picked = av.code; query = av.code; input.value = av.code;
    paint();
    ok.focus();
  };
  input.oninput = () => { query = input.value; picked = ''; say(''); paint(); };
  el.querySelector('[data-av-list]').onclick = (event) => {
    const b = event.target.closest('[data-mz-av-use]');
    if (!b || done) return;
    picked = picked === b.dataset.mzAvUse && view().mode !== 'mine' ? '' : b.dataset.mzAvUse;
    say(''); paint();
  };
  el.querySelector('[data-av-list]').ondblclick = (event) => { if (event.target.closest('[data-mz-av-use]')) confirm(); };
  ok.onclick = confirm;
  $('#mz-av-back').onclick = () => { if (!done) ctx.back(); };
  ctx.icons(); ctx.closeBtns();
  paint();
  setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); } }, 40);
}

const CSS_ESCAPE = (s) => (globalThis.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));

/* « Sans étiquette » · la pièce trouvée sans étiquette se vend quand même.
 *
 * Une cliente apporte au comptoir une pièce dont l'étiquette est tombée, ou
 * que personne ne retrouve dans l'inventaire. Au lieu de la refuser, la
 * vendeuse touche « Sans étiquette », tape le prix convenu (et, si elle veut,
 * un nom et un rayon), et la pièce passe sur le ticket.
 *
 * Comment elle vit sur le ticket : chaque pièce devient un article VIRTUEL
 * (`odd-…`) posé dans la projection de vente P, jamais dans le catalogue
 * partagé. Les totaux, la remise, le reçu, le Z et la vente envoyée la lisent
 * donc comme n'importe quel article, sans un seul chemin d'argent neuf. La
 * ligne porte sa propre description (`ln.odd`), si bien qu'une resynchro du
 * catalogue, qui reconstruit P, la retrouve (oddInject). Le stock ne bouge pas :
 * on ne sait pas quelle variante est partie (pos-boutique.js › persistStock,
 * variantStock). Le nom reçu dit « sans étiquette » : la patronne les voit dans
 * ses ventes. Aucun code gérante (pas de blocage au comptoir). */
const PREFIX = 'odd-';
export const isOddPid = (pid) => String(pid || '').startsWith(PREFIX);

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
/* Le montant tapé, en chiffres de caisse (espace fine des milliers). */
const WHOLE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* L'article virtuel, tiré de la description que la ligne garde. */
function oddProduct(pid, d) {
  return { id: pid, name: d.name, price: money(d.price), rayon: d.rayon || '', odd: true,
    sizes: {}, _variants: [], photo: '', barcode: '', ean: '', supplierId: '' };
}

/* Remet les articles du ticket ouvert dans P après une reconstruction. */
export function oddInject(P, ticket) {
  ((ticket && ticket.lines) || []).forEach((ln) => {
    if (ln && isOddPid(ln.pid) && ln.odd && !P[ln.pid]) P[ln.pid] = oddProduct(ln.pid, ln.odd);
  });
}

/* Le bouton dans la barre de vente, et la feuille qu'il ouvre.
   d : { root, $, esc, fmtMAD, icons, toast, openVeil, closeVeil, rayons(), add(line, product) } */
export function mountOddBox(bar, d) {
  if (!bar || bar.querySelector('#bq-sell-odd')) return;
  const tr = (s) => (window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'bq-sell-odd'; btn.className = 'bq-sell-odd';
  btn.innerHTML = '<i data-icon="sell"></i><span></span>';
  btn.querySelector('span').textContent = tr('Sans étiquette');
  btn.title = tr('Vendre une pièce sans étiquette à un prix choisi');
  btn.setAttribute('aria-label', tr('Sans étiquette'));   // le libellé se cache sur un téléphone étroit
  bar.appendChild(btn);
  injectCss();
  btn.addEventListener('click', () => open(d, tr));
}

function open(d, tr) {
  const { $, esc, fmtMAD } = d;
  /* The unit every boutique amount prints (fmtMAD: « 120,00 MAD » in every language). */
  const unit = fmtMAD(0).split(' ').pop();
  const el = $('#bq-approvem', d.root);
  if (!el) return;
  let cents = 0, rayon = '';
  const rayons = (d.rayons() || []).map((r) => r && r.label).filter(Boolean);
  el.innerHTML = `
    <button class="bq-modal-x" data-bq-close aria-label="${esc(tr('Fermer'))}"><i data-icon="close"></i></button>
    <div class="odd-box">
      <div class="odd-head"><span class="odd-ic"><i data-icon="sell"></i></span>
        <div><h3 class="modal-title">${esc(tr('Article sans étiquette'))}</h3>
        <p class="odd-sub">${esc(tr('Tapez le prix convenu. La pièce passe sur le ticket, le stock ne bouge pas.'))}</p></div></div>
      <div class="odd-amount" aria-live="polite"><b id="odd-val">0</b><span>${esc(unit)}</span></div>
      <div class="odd-pad" role="group" aria-label="${esc(tr('Prix'))}">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].map((k) => `<button type="button" data-odd-key="${k}"${k === 'del' ? ` aria-label="${esc(tr('Effacer'))}"` : ''}>${k === 'del' ? '<i data-icon="backspace"></i>' : k}</button>`).join('')}
      </div>
      <input class="odd-name" id="odd-name" maxlength="40" autocomplete="off" placeholder="${esc(tr('Nom (facultatif), ex. pull noir'))}">
      ${rayons.length ? `<div class="odd-rayons" role="group" aria-label="${esc(tr('Rayon'))}">${rayons.map((r) => `<button type="button" class="odd-chip" data-odd-rayon="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
      <button type="button" class="bq-btn primary odd-add" id="odd-add" data-tap-once disabled></button>
    </div>`;
  const val = $('#odd-val', el), add = $('#odd-add', el);
  const paint = () => {
    val.textContent = (cents % 100 ? CENTS : WHOLE).format(cents / 100);
    add.disabled = !(cents > 0);
    add.textContent = cents > 0 ? `${tr('Ajouter au ticket')} · ${fmtMAD(cents / 100)}` : tr('Tapez un prix');
  };
  /* Le prix se tape en dirhams entiers (« 00 » pour les centaines rapides) ;
     un clavier physique peut aussi taper la virgule pour les centimes. */
  let typed = '';
  const setTyped = (s) => {
    typed = s.replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
    const [whole, frac = ''] = typed.split(',');
    cents = Math.min(99999999, (Number(whole) || 0) * 100 + Number((frac + '00').slice(0, 2)));
    paint();
  };
  el.querySelector('.odd-pad').addEventListener('click', (e) => {
    const k = e.target.closest('[data-odd-key]');
    if (!k) return;
    const key = k.dataset.oddKey;
    setTyped(key === 'del' ? typed.slice(0, -1) : typed + key);
  });
  const rbox = el.querySelector('.odd-rayons');
  if (rbox) rbox.addEventListener('click', (e) => {
    const c = e.target.closest('[data-odd-rayon]');
    if (!c) return;
    rayon = rayon === c.dataset.oddRayon ? '' : c.dataset.oddRayon;
    rbox.querySelectorAll('[data-odd-rayon]').forEach((b) => b.classList.toggle('on', b.dataset.oddRayon === rayon));
  });
  const onKey = (e) => {
    if (e.target && e.target.id === 'odd-name') { if (e.key === 'Enter' && cents > 0) add.click(); return; }
    if (/^\d$/.test(e.key) || e.key === ',' || e.key === '.') { setTyped(typed + (e.key === '.' ? ',' : e.key)); e.preventDefault(); }
    else if (e.key === 'Backspace') { setTyped(typed.slice(0, -1)); e.preventDefault(); }
    else if (e.key === 'Enter' && cents > 0) { add.click(); e.preventDefault(); }
  };
  el.addEventListener('keydown', onKey);
  const close = () => { el.removeEventListener('keydown', onKey); d.closeVeil('#bq-approve-veil'); };
  el.querySelectorAll('[data-bq-close]').forEach((b) => { b.onclick = close; });
  add.onclick = () => {
    if (!(cents > 0)) return;
    const typedName = $('#odd-name', el).value.trim();
    const name = typedName ? `${typedName} · ${tr('sans étiquette')}` : tr('Article sans étiquette');
    const pid = PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const desc = { name, price: cents / 100, rayon };
    close();
    d.add({ pid, size: '', color: 'unique', qty: 1, remise: 0, odd: desc }, oddProduct(pid, desc));
    d.toast(tr('Ajouté au ticket'), 3500, undefined, `${name} · ${fmtMAD(cents / 100)}`);
  };
  paint();
  d.openVeil('#bq-approve-veil');
  d.icons();
  try { el.querySelector('.odd-pad button').focus({ preventScroll: true }); } catch (_) {}
}

function injectCss() {
  if (document.getElementById('odd-box-css')) return;
  const s = document.createElement('style');
  s.id = 'odd-box-css';
  s.textContent = `
  .bq-sell-odd{display:inline-flex;align-items:center;gap:6px;flex:none;height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(11,110,79,.28);background:rgba(11,110,79,.08);color:var(--atlas,#0B6E4F);font:600 13px/1 var(--sans,inherit);cursor:pointer;white-space:nowrap}
  .bq-sell-odd i,.bq-sell-odd svg{width:18px;height:18px}
  .bq-sell-odd:active{transform:scale(.97)}
  .odd-box{display:flex;flex-direction:column;gap:14px;min-width:min(380px,86vw)}
  .odd-head{display:flex;gap:12px;align-items:flex-start;padding-right:36px}
  .odd-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(11,110,79,.10);color:var(--atlas,#0B6E4F)}
  .odd-ic i,.odd-ic svg{width:22px;height:22px}
  .odd-head .modal-title{margin:0 0 4px}
  .odd-sub{margin:0;font-size:12.5px;line-height:1.45;color:var(--n-500,#6b716e)}
  .odd-amount{display:flex;align-items:baseline;justify-content:center;gap:8px;padding:14px 12px;border-radius:14px;background:var(--surface,rgba(10,15,13,.04))}
  .odd-amount b{font-size:40px;font-weight:600;letter-spacing:-.02em;font-feature-settings:"tnum" 1;color:var(--ink,#0A0F0D)}
  .odd-amount span{font-size:15px;font-weight:600;color:var(--n-500,#6b716e)}
  .odd-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .odd-pad button{height:52px;border-radius:12px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:var(--card,transparent);color:var(--ink,#0A0F0D);font:600 20px/1 var(--sans,inherit);font-feature-settings:"tnum" 1;cursor:pointer;display:grid;place-items:center;touch-action:manipulation}
  .odd-pad button:active{background:rgba(11,110,79,.10)}
  .odd-pad button i,.odd-pad button svg{width:22px;height:22px}
  .odd-name{height:44px;border-radius:12px;border:1px solid var(--n-200,rgba(10,15,13,.12));padding:0 14px;font:500 15px/1 var(--sans,inherit);background:var(--card,transparent);color:var(--ink,#0A0F0D)}
  .odd-rayons{display:flex;flex-wrap:wrap;gap:6px}
  .odd-chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--n-200,rgba(10,15,13,.12));background:transparent;color:var(--ink,#0A0F0D);font:500 13px/1 var(--sans,inherit);cursor:pointer}
  .odd-chip.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
  .odd-add{height:50px;font-size:15px}
  .odd-add[disabled]{opacity:.5}
  @media (max-width:430px){.bq-sell-odd{padding:0 10px}.bq-sell-odd span{display:none}}`;
  document.head.appendChild(s);
}

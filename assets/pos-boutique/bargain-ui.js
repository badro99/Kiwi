/* Le sélecteur « % | Prix convenu | −MAD » de la remise boutique, pour la
 * fiche article (sales.js) et la remise de ticket (ticket-remise.js).
 * Il ne touche ni au ticket ni à l'argent : il lit la saisie, demande à
 * l'appelant ce qu'elle vaut (evaluate) et lui rend l'état (onChange).
 * Les pastilles de pourcentage restent celles de l'appelant, avec leurs
 * propres gestionnaires : chipsHTML est posé tel quel. */
import { parseMad } from './bargain.js?v=2';

const MODES = ['pct', 'price', 'amount'];

export function mountBargain(host, o) {
  const tr = o.tr || ((s) => s);
  const st = { mode: MODES.includes(o.mode) ? o.mode : 'pct', text: o.text || '' };
  host.innerHTML = '<div class="bq-seg bq-bargain-modes" data-lens-demo></div>'
    + '<div class="bq-bargain-pct"></div>'
    + '<div class="bq-bargain-mad"><input class="bq-input mono" type="text" inputmode="decimal" autocomplete="off" data-bq-bval>'
    + '<span class="bq-bargain-pv" aria-live="polite"></span></div>';
  const seg = host.querySelector('.bq-bargain-modes');
  const labels = { pct: '%', price: tr('Prix convenu'), amount: '−MAD' }; // « MAD » se lit tel quel dans les trois langues
  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bq-seg-it';
    b.dataset.lensItem = '';
    b.dataset.bqBmode = m;
    b.textContent = labels[m];
    seg.appendChild(b);
  });
  host.querySelector('.bq-bargain-pct').innerHTML = o.chipsHTML || '';
  const input = host.querySelector('[data-bq-bval]');
  const pv = host.querySelector('.bq-bargain-pv');

  function result() {
    if (st.mode === 'pct') return { mode: 'pct', ok: false, empty: true, text: '' };
    const empty = !st.text.trim();
    const value = parseMad(st.text);
    if (empty || value == null) return { mode: st.mode, ok: false, empty, value: null, text: st.text, error: empty ? null : 'invalid' };
    const res = o.evaluate(st.mode, value);
    return { mode: st.mode, ok: !res.error, empty: false, value, text: st.text, res, error: res.error || null };
  }

  function paint() {
    seg.querySelectorAll('[data-bq-bmode]').forEach((b) => b.classList.toggle('on', b.dataset.bqBmode === st.mode));
    host.querySelector('.bq-bargain-pct').hidden = st.mode !== 'pct';
    host.querySelector('.bq-bargain-mad').hidden = st.mode === 'pct';
    input.setAttribute('aria-label', st.mode === 'price' ? tr('Prix convenu en dirhams') : tr('Dirhams retirés'));
    input.placeholder = st.mode === 'price' ? tr('Prix convenu') : tr('Montant retiré');
    const r = result();
    pv.classList.toggle('is-err', !!r.error);
    if (st.mode === 'pct') pv.textContent = '';
    else if (r.empty) pv.textContent = st.mode === 'price' ? tr('Tapez le prix convenu') : tr('Tapez les dirhams retirés');
    else if (r.error === 'floor') pv.textContent = tr('Prix minimum') + ' ' + o.fmt(r.res.floor);
    else if (r.error === 'above') pv.textContent = tr('Doit rester sous le prix affiché');
    else if (r.error) pv.textContent = tr('Montant non valide');
    else pv.textContent = o.fmt(o.base) + ' → ' + o.fmt(r.res.after) + ' · −' + o.fmt(r.res.cut);
    return r;
  }

  seg.onclick = (e) => {
    const b = e.target.closest('[data-bq-bmode]');
    if (!b || b.dataset.bqBmode === st.mode) return;
    st.mode = b.dataset.bqBmode;
    st.text = '';
    input.value = '';
    o.onChange(paint(), true);
    if (st.mode !== 'pct') input.focus();
  };
  input.value = st.text;
  input.oninput = () => { st.text = input.value; o.onChange(paint(), false); };
  paint();
  return { result };
}

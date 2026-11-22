/* Le rapprochement carte à la clôture boutique et maison (propriétaire,
 * 22 nov. 2026). La caisse restaurant demande le total carte du Z du terminal
 * (TPE) et le compare à Kiwi ; les deux caisses de détail ne comptaient que le
 * tiroir. Même bloc, mêmes mots, mêmes classes que #clo-card-box
 * (kiwi-caisse.html, caisse-accounting/closing.js).
 *
 * Le champ reste FACULTATIF : une clôture ne bloque jamais (22 nov.). Vide ou
 * illisible, le total part à null, le rapport dit « non vérifié »
 * (day-report.js cardReconciliation) et le Z l'imprime ainsi. */
const tr = (s) => (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s);
const cents = (n) => Math.round(Number(n) * 100);

/* null : rien saisi · NaN : illisible · sinon le montant au centime. */
export function cardCheckParse(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return NaN;
  return cents(n) / 100;
}

export function cardCheckResult(kiwi, terminal, fmtMAD) {
  if (terminal === null) return { text: tr('À saisir'), cls: '' };
  if (Number.isNaN(terminal)) return { text: tr('Montant invalide'), cls: 'is-off' };
  const gap = cents(terminal) - cents(kiwi);
  if (gap === 0) return { text: tr('Rapproché') + ' · ' + fmtMAD(0), cls: 'is-ok' };
  return { text: (gap > 0 ? 'Terminal + ' : 'Kiwi + ') + fmtMAD(Math.abs(gap) / 100), cls: 'is-off' };
}

export function cardCheckHtml(kiwi, fmtMAD) {
  return `<div class="clo-drawer-box clo-card-box">
          <div class="clo-drawer-title">${tr('Rapprochement carte')}</div>
          <div class="clo-drawer-line is-total"><span>${tr('Total carte Kiwi')}</span><span class="mono">${fmtMAD(kiwi)}</span></div>
          <div class="clo-count-row">
            <label for="bqclo-card">${tr('Total carte du Z terminal')}</label>
            <input class="clo-count-input" id="bqclo-card" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00" aria-describedby="bqclo-card-help" />
          </div>
          <p class="clo-card-help" id="bqclo-card-help">${tr('Recopiez le total carte imprimé par le terminal, même s\'il est à zéro.')}</p>
          <div class="clo-ecart-line" id="bqclo-card-line" aria-live="polite"><span>${tr('Résultat')}</span><span class="mono" id="bqclo-card-out">${tr('À saisir')}</span></div>
        </div>`;
}

export function cardCheckWire(root, kiwi, fmtMAD) {
  const inp = root && root.querySelector('#bqclo-card');
  const line = root && root.querySelector('#bqclo-card-line');
  const out = root && root.querySelector('#bqclo-card-out');
  if (!inp || !line || !out) return;
  inp.addEventListener('input', () => {
    const r = cardCheckResult(kiwi, cardCheckParse(inp.value), fmtMAD);
    line.classList.remove('is-ok', 'is-off');
    if (r.cls) line.classList.add(r.cls);
    out.textContent = r.text;
  });
}

/* Le total recopié, ou null (non vérifié) : la clôture passe toujours. */
export function cardCheckValue(root) {
  const inp = root && root.querySelector('#bqclo-card');
  const v = cardCheckParse(inp ? inp.value : '');
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

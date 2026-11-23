/* Dépenses · la fiche : ajouter, corriger, compléter un retrait de caisse,
 * supprimer. Elle s'ouvre dans Kiwi.modal et rend la ligne à enregistrer à la
 * page (onSave) ; la page écrit le document et envoie la photo.
 *
 * Le ticket scanné : la photo est réduite ici (bord long 1 600 px, JPEG), la
 * page l'envoie à /api/ai/expense-ocr et rappelle applyScan() ou scanFailed().
 * Ce que la lecture remplit est marqué « à vérifier » ; elle ne réécrit jamais
 * un champ que le patron a déjà tapé. Un ticket illisible ou un quota épuisé
 * laisse la fiche vide avec une phrase simple, et la photo reste jointe. */
import { CATEGORIES, METHODS, classifyReason, parseAmount, completionId, nextStamp } from './engine.js?v=7';
import { tr, lang } from './strings.js?v=4';
import { CAT_ICON, esc, catLabel, dayLabel } from './view.js?v=4';

/* Les catégories de la lecture de tickets (functions/api/ai/expense-ocr.js). */
export const OCR_CATEGORY = {
  marche: 'produce', alimentation: 'grocery', fournitures: 'supplier', entretien: 'repairs',
  transport: 'transport', loyer: 'rent', salaires: 'staff', divers: 'other',
};

const icon = (name) => `<i data-icon="${name}" aria-hidden="true"></i>`;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const newId = () => 'xp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function centsToInput(cents) {
  const c = Math.round(Number(cents) || 0);
  if (!c) return '';
  const s = c % 100 ? (c / 100).toFixed(2).replace(/0$/, '') : String(c / 100);
  return lang() === 'en' ? s : s.replace('.', ',');
}
export async function shrinkPhoto(file, max = 1600) {
  const url = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('read'));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image'));
    i.src = url;
  });
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';            // un PNG transparent ne devient pas un JPEG noir
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

/* openSheet({ mode: 'add' | 'edit' | 'complete', row, today, suppliers, photo, reading, receiptUrl },
 *           { onSave(row, { photo }), onDelete(row) })
 * → { applyScan(data), scanFailed(kind), close() } */
export function openSheet(opts, cb) {
  const o = opts || {};
  const mode = o.mode || 'add';
  const row = o.row || {};
  const today = isDay(o.today) ? o.today : new Date().toISOString().slice(0, 10);
  let cat = mode === 'add' ? '' : (CATEGORIES.includes(row.category) ? row.category : '');
  let method = METHODS.includes(row.method) ? row.method : 'cash';
  let photo = o.photo || '';
  let scanned = false;
  const ro = mode === 'complete';
  /* Un retrait de caisse, complété ou non : le montant et le jour sont ceux
     du tiroir, la fiche ne les change pas (sinon « Dépensé » ne colle plus
     au comptage de la caisse). */
  const till = ro || !!row.cashEventId;
  const title = mode === 'complete' ? tr('sheetComplete') : mode === 'edit' ? tr('sheetEdit') : tr('sheetAdd');
  const sups = (o.suppliers || []).slice(0, 40);

  const body = `<form class="xp-sheet" novalidate>
    ${till ? `<div class="xp-note">${icon('point_of_sale')}<span>${esc(tr('tillHint', { date: dayLabel(row.date, { day: 'numeric', month: 'long' }) }))}</span></div>` : ''}
    <div class="xp-note" data-xp-scan-note${o.reading ? '' : ' hidden'}>${icon('document_scanner')}<span>${esc(tr('reading'))}</span></div>
    <div>
      <label for="xp-amount">${esc(tr('amount'))}</label>
      <div class="xp-amount${till ? ' ro' : ''}"><input id="xp-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" value="${esc(centsToInput(row.amountCents))}"${till ? ' readonly' : ''}><span>${esc(tr('cur'))}</span></div>
    </div>
    <div>
      <span class="xp-lbl">${esc(tr('category'))}</span>
      <div class="xp-picks" role="group" aria-label="${esc(tr('category'))}">${CATEGORIES.map((c) => `<button type="button" class="xp-pick" data-cat="${c}" aria-pressed="${c === cat}">${icon(CAT_ICON[c])}<span>${esc(catLabel(c))}</span></button>`).join('')}</div>
    </div>
    <div class="xp-two">
      <div><label for="xp-supplier">${esc(tr('supplier'))}</label><input id="xp-supplier" name="supplier" type="text" list="xp-sups" autocomplete="off" maxlength="80" value="${esc(row.supplier || '')}" placeholder="${esc(tr('supplierPh'))}"></div>
      <div><label for="xp-date">${esc(tr('date'))}</label><input id="xp-date" name="date" type="date" value="${esc(isDay(row.date) ? row.date : today)}" max="${esc(today)}"${till ? ' readonly' : ''}></div>
    </div>
    <datalist id="xp-sups">${sups.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
    ${till ? '' : `<div>
      <span class="xp-lbl">${esc(tr('paidWith'))}</span>
      <div class="xp-seg" data-lens-demo role="group" aria-label="${esc(tr('paidWith'))}">${METHODS.map((m) => `<button type="button" data-lens-item data-method="${m}" class="${m === method ? 'on' : ''}" aria-pressed="${m === method}">${esc(tr('m.' + m))}</button>`).join('')}</div>
    </div>`}
    <div><label for="xp-note">${esc(tr('note'))}</label><input id="xp-note" name="note" type="text" maxlength="200" autocomplete="off" value="${esc(row.note || '')}" placeholder="${esc(tr('notePh'))}"></div>
    ${o.receiptUrl ? `<p class="xp-soft-note">${icon('receipt')} <a href="${esc(o.receiptUrl)}" target="_blank" rel="noopener">${esc(tr('seeTicket'))}</a></p>` : ''}
    <p class="xp-note ok" data-xp-photo${photo ? '' : ' hidden'}>${icon('photo_camera')}<span>${esc(tr('photoAttached'))}</span></p>
    <p class="xp-err" role="alert" hidden></p>
    <div class="xp-sheet-foot">
      ${mode === 'edit' ? `<button type="button" class="xp-btn danger" data-xp-act="delete">${icon('delete')}<span>${esc(tr('delete'))}</span></button>
        <span class="xp-confirm" hidden><span>${esc(tr('deleteAsk'))}</span><button type="button" class="xp-btn danger-fill" data-xp-act="delete-confirm">${esc(tr('deleteYes'))}</button></span>` : ''}
      <div class="xp-right">
        <button type="button" class="xp-btn" data-dismiss>${esc(tr('cancel'))}</button>
        <button type="submit" class="xp-btn primary" data-xp-act="save">${esc(tr('save'))}</button>
      </div>
    </div>
  </form>`;

  const K = window.Kiwi;
  const dlg = K.modal({ title, body, width: 560 });
  const root = dlg.el;
  const form = root.querySelector('.xp-sheet');
  const $ = (sel) => form.querySelector(sel);
  const field = (n) => form.elements.namedItem(n);
  const touched = new Set();
  form.addEventListener('input', (e) => { if (e.target && e.target.name) { touched.add(e.target.name); e.target.classList.remove('xp-verify'); } });

  const pressCat = (c) => {
    cat = c;
    form.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
  };
  const pressMethod = (m) => {
    method = m;
    form.querySelectorAll('[data-method]').forEach((b) => { const on = b.dataset.method === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  };
  /* Un retrait de caisse arrive avec la catégorie devinée de son motif. */
  if (ro && CATEGORIES.includes(row.category)) pressCat(row.category);

  const err = (msg) => { const p = $('.xp-err'); p.textContent = msg || ''; p.hidden = !msg; };

  form.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { pressCat(c.dataset.cat); touched.add('category'); return; }
    const m = e.target.closest('[data-method]');
    if (m) { pressMethod(m.dataset.method); return; }
    const a = e.target.closest('[data-xp-act]');
    if (!a) return;
    if (a.dataset.xpAct === 'delete') {
      e.preventDefault();
      a.hidden = true;
      $('.xp-confirm').hidden = false;
      $('[data-xp-act="delete-confirm"]').focus();
    } else if (a.dataset.xpAct === 'delete-confirm') {
      e.preventDefault();
      dlg.close();
      cb.onDelete && cb.onDelete({ ...row, deleted: true, updatedAt: nextStamp(row.updatedAt) });
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cents = till ? Math.round(Number(row.amountCents) || 0) : parseAmount(field('amount').value);
    if (!(cents > 0)) { err(tr('amountRequired')); field('amount').focus(); return; }
    const supplier = field('supplier').value.trim().slice(0, 80);
    const note = field('note').value.trim().slice(0, 200);
    const date = till ? row.date : (isDay(field('date').value) ? field('date').value : today);
    const now = Date.now();
    const out = {
      id: mode === 'edit' ? row.id : (ro ? completionId(row.cashEventId) : newId()),
      date, amountCents: cents,
      category: cat || classifyReason(supplier + ' ' + note),
      method: till ? 'cash' : method,
      supplier, note,
      vatCents: Math.round(Number(row.vatCents) || 0),
      source: ro ? 'till' : (mode === 'edit' ? (row.source || 'manual') : (scanned ? 'scan' : 'manual')),
      createdAt: mode === 'edit' && row.createdAt ? row.createdAt : now,
      updatedAt: mode === 'edit' ? nextStamp(row.updatedAt, now) : now,
    };
    if (ro) out.cashEventId = row.cashEventId;
    else if (row.cashEventId) out.cashEventId = row.cashEventId;
    if (row.receiptKey) out.receiptKey = row.receiptKey;
    dlg.close();
    cb.onSave && cb.onSave(out, { photo });
  });

  setTimeout(() => { try { (till ? $('[data-cat]') : field('amount')).focus(); } catch (_) {} }, 60);

  const note = $('[data-xp-scan-note]');
  return {
    close: () => dlg.close(),
    el: root,
    /* Ce que la lecture a trouvé, posé là où le patron n'a encore rien écrit. */
    applyScan(data) {
      const d = data || {};
      const mark = (name, value) => {
        if (touched.has(name) || value == null || value === '') return;
        const el = field(name); if (!el) return;
        el.value = value; el.classList.add('xp-verify');
      };
      const cents = Math.round(Number(d.amount) * 100);
      if (cents > 0) mark('amount', centsToInput(cents));
      if (d.supplier) mark('supplier', String(d.supplier).slice(0, 80));
      if (isDay(d.date) && d.date <= today) mark('date', d.date);
      const c = OCR_CATEGORY[d.category];
      if (c && !touched.has('category')) pressCat(c);
      scanned = true;
      note.hidden = false;
      note.className = 'xp-note ok';
      note.querySelector('span').textContent = tr('verify');
    },
    scanFailed(kind) {
      note.hidden = false;
      note.className = 'xp-note warn';
      note.querySelector('span').textContent = kind === 'quota' ? tr('quota') : tr('readFailed');
    },
    setPhoto(dataUrl) {
      photo = dataUrl || '';
      const p = $('[data-xp-photo]'); if (p) p.hidden = !photo;
    },
  };
}

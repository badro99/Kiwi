  /* ── export ──────────────────────────────────────────────────────────── */
  /* Une cellule qui commence par = + - @ serait une formule dans un tableur. */
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n2 = (v) => (v == null || !Number.isFinite(+v) ? '' : (+v).toFixed(2).replace('.', ','));
  function download(name, rows) {
    const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {}
    return text;
  }
  function sheetRows(data) {
    const c = calc(data);
    const rows = [[tr('csvSheet'), data.name], [tr('lName'), tr('lType'), tr('lPackPrice'), tr('lPackQty'), tr('lPackUnit'), tr('lUseQty'), tr('lUseUnit'), tr('lYield'), tr('lDate'), tr('lCost')]];
    (data.lines || []).forEach((l, i) => rows.push([l.name, l.type === 'packaging' ? tr('packaging') : tr('food'), n2(l.packPrice), l.packQty ?? '', l.packUnit, l.useQty ?? '', l.useUnit || l.packUnit, l.yieldPct ?? 100, l.priceDate, c.lines[i].cost == null ? tr('unknown') : n2(c.lines[i].cost)]));
    rows.push([tr('csvTotal'), c.total == null ? tr('unknown') : n2(c.total)], [tr('csvPortion'), c.perPortion == null ? tr('unknown') : n2(c.perPortion)], [tr('sumPct'), c.pct == null ? '' : n2(c.pct)]);
    return rows;
  }
  function exportSheet() { if (S.draft) return download(slugFile(S.draft.name) + '.csv', sheetRows(S.draft)); return ''; }
  function exportAll() {
    const rows = [[tr('colName'), tr('kindTemplate'), tr('colPortion'), tr('colPct'), tr('colStatus'), tr('colUpdated')]];
    visibleSheets().forEach((s) => { const c = calc(s.data); rows.push([s.name, s.kind === 'template' ? tr('kindTemplate') : '', c.perPortion == null ? tr('unknown') : n2(c.perPortion), c.pct == null ? '' : n2(c.pct), statusLabel(c.status), new Date(s.updatedTs).toISOString().slice(0, 10)]); });
    return download('kiwi-couts.csv', rows);
  }
  const slugFile = (s) => String(s || 'fiche').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'fiche';


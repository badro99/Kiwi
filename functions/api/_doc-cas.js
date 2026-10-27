// Read and compare-and-swap a `store_docs` document: the one copy of the loop
// that /api/employee and /api/team/live each carried. `change(data)` returns
// the next document, or a falsy value when there is nothing to write (the CAS is
// then not attempted and null is returned). Up to four tries against a
// concurrent writer; null when it gives up or the table is unreachable.

function parse(raw, fallback) {
  try { const v = JSON.parse(raw || ''); return v && typeof v === 'object' ? v : fallback; }
  catch (_) { return fallback; }
}

export async function readDoc(env, merchant, feature, fallback) {
  try {
    const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, feature).first();
    return { data: row ? parse(row.data, fallback) : fallback, rev: Number(row && row.rev) || 0 };
  } catch (_) { return { data: fallback, rev: 0 }; }
}

export async function mutateDoc(env, merchant, feature, fallback, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant, feature, fallback);
    const next = change(row.data);
    if (!next) return null;
    const text = JSON.stringify(next), now = Date.now();
    try {
      if (row.rev) {
        const result = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, now, merchant, feature, row.rev).run();
        if (Number(result && result.meta && result.meta.changes) > 0) return next;
      } else {
        const result = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, feature, text, now).run();
        if (Number(result && result.meta && result.meta.changes) > 0) return next;
      }
    } catch (_) { return null; }
  }
  return null;
}

import { json } from '../../auth/_lib.js';
import { ensureSupport, seedArticles, cleanText, featureHash } from '../_support.js';

function expose(row, lang) {
  lang = lang === 'en' || lang === 'ar' ? lang : 'fr';
  let types = ['all']; try { types = JSON.parse(row.store_types || '["all"]'); } catch (_) {}
  return {
    id: row.id, slug: row.slug, category: row.category, store_types: types,
    feature_key: row.feature_key || '', feature_hash: row.feature_hash || '',
    stale: !!row.feature_key && row.feature_hash !== featureHash(row.feature_key),
    updated_ts: Number(row.updated_ts) || 0,
    title: row['title_' + lang] || row.title_fr,
    body: row['body_' + lang] || row.body_fr,
  };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  try { await seedArticles(env); } catch (e) { return json({ error: 'support-unavailable' }, 503); }
  const url = new URL(request.url);
  const lang = cleanText(url.searchParams.get('lang') || 'fr', 2);
  const type = cleanText(url.searchParams.get('type') || '', 40).toLowerCase();
  const rows = await env.DB.prepare(`SELECT * FROM support_articles WHERE status = 'published' ORDER BY category, updated_ts DESC`).all();
  const articles = (rows.results || []).filter((row) => {
    let types = ['all']; try { types = JSON.parse(row.store_types || '["all"]'); } catch (_) {}
    const current = !row.feature_key || row.feature_hash === featureHash(row.feature_key);
    return current && (!type || types.includes('all') || types.includes(type));
  }).map((row) => expose(row, lang));
  return json({ articles, lang, type });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  await ensureSupport(env);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const kind = cleanText(body && body.kind, 16);
  if (kind === 'search') {
    let phrase = cleanText(body.phrase, 160)
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/(?:\+?\d[\s().-]*){8,}/g, '[number]');
    if (phrase.length < 2) return json({ ok: true });
    const recent = await env.DB.prepare(`SELECT id FROM support_searches WHERE phrase=? AND lang=? AND store_type=? AND ts>? LIMIT 1`)
      .bind(phrase, cleanText(body.lang || 'fr', 2), cleanText(body.store_type || '', 40), Date.now() - 3600000).first();
    if (recent) return json({ ok: true, deduplicated: true });
    await env.DB.prepare(`INSERT INTO support_searches (id,phrase,lang,store_type,ts) VALUES (?,?,?,?,?)`)
      .bind('search-' + crypto.randomUUID(), phrase, cleanText(body.lang || 'fr', 2), cleanText(body.store_type || '', 40), Date.now()).run();
    return json({ ok: true });
  }
  if (kind === 'feedback') {
    const articleId = cleanText(body.article_id, 96);
    if (!articleId) return json({ error: 'article-required' }, 400);
    const exists = await env.DB.prepare(`SELECT id FROM support_articles WHERE id = ? AND status = 'published'`).bind(articleId).first();
    if (!exists) return json({ error: 'not-found' }, 404);
    const recent = await env.DB.prepare(`SELECT id FROM support_feedback WHERE article_id=? AND store_type=? AND ts>? LIMIT 1`)
      .bind(articleId, cleanText(body.store_type || '', 40), Date.now() - 3600000).first();
    if (recent) return json({ ok: true, deduplicated: true });
    await env.DB.prepare(`INSERT INTO support_feedback (id,article_id,helpful,store_type,ts) VALUES (?,?,?,?,?)`)
      .bind('feedback-' + crypto.randomUUID(), articleId, body.helpful ? 1 : 0, cleanText(body.store_type || '', 40), Date.now()).run();
    return json({ ok: true });
  }
  return json({ error: 'bad-kind' }, 400);
}

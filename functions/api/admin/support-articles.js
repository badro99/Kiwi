import { json, isOperator, isSeniorOperator } from '../../auth/_lib.js';
import { ensureSupport, seedArticles, cleanText, parseJson, supportActor, featureHash } from '../_support.js';

async function guard(request,env,write){
  const ok=write?await isSeniorOperator(request,env):await isOperator(request,env);
  if(!ok)return json({error:'forbidden'},403);
  if(!env||!env.DB)return json({error:'no-db'},503);
  await seedArticles(env); return null;
}
const expose=(r)=>({...r,store_types:parseJson(r.store_types,['all']),stale:!!r.feature_key&&r.feature_hash!==featureHash(r.feature_key)});
export async function onRequestGet({request,env}){
  const bad=await guard(request,env,false);if(bad)return bad;
  const id=cleanText(new URL(request.url).searchParams.get('id'),96);
  if(id){
    const article=await env.DB.prepare(`SELECT * FROM support_articles WHERE id=?`).bind(id).first();
    if(!article)return json({error:'not-found'},404);
    const versions=await env.DB.prepare(`SELECT revision,actor,ts FROM support_article_versions WHERE article_id=? ORDER BY revision DESC LIMIT 30`).bind(id).all();
    return json({article:expose(article),versions:versions.results||[]});
  }
  const rows=await env.DB.prepare(`SELECT * FROM support_articles ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'review' THEN 1 ELSE 2 END, updated_ts DESC`).all();
  return json({articles:(rows.results||[]).map(expose)});
}
function validated(b,publish){
  const a={slug:cleanText(b.slug,90).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),category:cleanText(b.category||'autre',40),feature_key:cleanText(b.feature_key,80),feature_hash:cleanText(b.feature_hash,120),title_fr:cleanText(b.title_fr,200),title_en:cleanText(b.title_en,200),title_ar:cleanText(b.title_ar,200),body_fr:cleanText(b.body_fr,20000),body_en:cleanText(b.body_en,20000),body_ar:cleanText(b.body_ar,20000),store_types:Array.isArray(b.store_types)?b.store_types.map(x=>cleanText(x,40)).filter(Boolean).slice(0,30):['all']};
  if(!a.slug)return {error:'slug-required'};
  if(publish&&(!a.title_fr||!a.title_en||!a.title_ar||!a.body_fr||!a.body_en||!a.body_ar))return {error:'three-languages-required'};
  return {article:a};
}
async function snapshot(env,row,actor){
  await env.DB.prepare(`INSERT INTO support_article_versions (id,article_id,revision,snapshot,actor,ts) VALUES (?,?,?,?,?,?)`).bind('ver-'+crypto.randomUUID(),row.id,row.revision,JSON.stringify(expose(row)),actor,Date.now()).run();
}
export async function onRequestPost({request,env}){
  const bad=await guard(request,env,true);if(bad)return bad;
  let b;try{b=await request.json();}catch(_){return json({error:'bad-json'},400);}
  const v=validated(b,false);if(v.error)return json({error:v.error},400);const a=v.article,now=Date.now(),actor=await supportActor(request,env),id='art-'+crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO support_articles (id,slug,category,store_types,feature_key,feature_hash,status,revision,title_fr,title_en,title_ar,body_fr,body_en,body_ar,created_ts,updated_ts,published_ts,actor) VALUES (?,?,?,?,?,?,'draft',1,?,?,?,?,?,?,?, ?,NULL,?)`).bind(id,a.slug,a.category,JSON.stringify(a.store_types),a.feature_key,a.feature_hash,a.title_fr,a.title_en,a.title_ar,a.body_fr,a.body_en,a.body_ar,now,now,actor).run();
  return json({ok:true,id});
}
export async function onRequestPatch({request,env}){
  const bad=await guard(request,env,true);if(bad)return bad;
  let b;try{b=await request.json();}catch(_){return json({error:'bad-json'},400);}
  const id=cleanText(b.id,96), action=cleanText(b.action||'save',24), row=await env.DB.prepare(`SELECT * FROM support_articles WHERE id=?`).bind(id).first();if(!row)return json({error:'not-found'},404);
  const actor=await supportActor(request,env),now=Date.now();
  if(action==='rollback'){
    const rev=Number(b.revision)||0,ver=await env.DB.prepare(`SELECT snapshot FROM support_article_versions WHERE article_id=? AND revision=?`).bind(id,rev).first();if(!ver)return json({error:'version-not-found'},404);
    const a=parseJson(ver.snapshot,null);if(!a)return json({error:'bad-version'},500);await snapshot(env,row,actor);
    await env.DB.prepare(`UPDATE support_articles SET category=?,store_types=?,feature_key=?,feature_hash=?,status='draft',revision=?,title_fr=?,title_en=?,title_ar=?,body_fr=?,body_en=?,body_ar=?,updated_ts=?,published_ts=NULL,actor=? WHERE id=?`).bind(a.category,JSON.stringify(a.store_types||['all']),a.feature_key||'',a.feature_hash||'',Number(row.revision)+1,a.title_fr,a.title_en,a.title_ar,a.body_fr,a.body_en,a.body_ar,now,actor,id).run();
    return json({ok:true});
  }
  const merged={...row,...b},publish=action==='publish',v=validated(merged,publish);if(v.error)return json({error:v.error},400);const a=v.article;
  await snapshot(env,row,actor);
  const status=publish?'published':action==='review'?'review':'draft';
  if(publish&&a.feature_key)a.feature_hash=featureHash(a.feature_key);
  await env.DB.prepare(`UPDATE support_articles SET slug=?,category=?,store_types=?,feature_key=?,feature_hash=?,status=?,revision=?,title_fr=?,title_en=?,title_ar=?,body_fr=?,body_en=?,body_ar=?,updated_ts=?,published_ts=?,actor=? WHERE id=?`).bind(a.slug,a.category,JSON.stringify(a.store_types),a.feature_key,a.feature_hash,status,Number(row.revision)+1,a.title_fr,a.title_en,a.title_ar,a.body_fr,a.body_en,a.body_ar,now,publish?now:row.published_ts,actor,id).run();
  return json({ok:true,status,revision:Number(row.revision)+1});
}

// Owner-only hotel channel connections. Full iCal URLs never leave the server.
import { json, readSession, readCookie, SESS_COOKIE } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { encryptFeed, normalizeFeedUrl, syncHotelChannels } from './_channels.js';

const PROVIDERS = new Set(['booking', 'airbnb']);
const str = (v, n=200) => String(v == null ? '' : v).trim().slice(0,n);
async function merchantFor(request, env, asked) {
  const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET).catch(() => null);
  if (!session?.aid) return '';
  return tenantFor(request, env, asked, { strict:true });
}
async function roomExists(env, merchant, roomId) {
  const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first();
  let doc; try { doc = JSON.parse(row?.data || '{}'); } catch (_) { doc = {}; }
  return (Array.isArray(doc.rooms) ? doc.rooms : []).some((x) => x && !x.deletedAt && String(x.id) === roomId);
}
async function rows(env, merchant) {
  const result = await env.DB.prepare("SELECT id,channel,label,status,config,created_ts,last_ts,last_err FROM channel_links WHERE merchant=? AND channel IN ('booking','airbnb') ORDER BY created_ts DESC").bind(merchant).all();
  return (result.results || []).map((x) => {
    let cfg; try { cfg = JSON.parse(x.config || '{}'); } catch (_) { cfg = {}; }
    return { id:x.id, channel:x.channel, label:x.label || '', status:x.status, roomId:str(cfg.roomId,64), createdAt:+x.created_ts||0, lastSyncAt:+x.last_ts||0, lastError:str(x.last_err,180), hasFeed:!!cfg.feedEnc };
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error:'not-configured' },503);
  const merchant = await merchantFor(request,env,new URL(request.url).searchParams.get('merchant'));
  if (!merchant) return json({ error:'unauthorized' },401);
  return json({ ok:true, merchant, channels:await rows(env,merchant) });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error:'not-configured' },503);
  let body; try { body=await request.json(); } catch (_) { return json({ error:'bad-json' },400); }
  const merchant=await merchantFor(request,env,body?.merchant); if(!merchant)return json({error:'unauthorized'},401);
  const action=str(body?.action||'save',20);
  if(action==='sync') {
    const result=await syncHotelChannels(env,{merchant,limit:50});
    return json({ ...result, channels:await rows(env,merchant) },result.failed===result.processed&&result.processed?502:200);
  }
  if(action==='status') {
    const id=str(body?.id,64), status=body?.status==='paused'?'paused':'active';
    await env.DB.prepare("UPDATE channel_links SET status=? WHERE id=? AND merchant=? AND channel IN ('booking','airbnb')").bind(status,id,merchant).run();
    return json({ok:true,channels:await rows(env,merchant)});
  }
  if(action!=='save')return json({error:'bad-action'},400);
  const channel=str(body?.channel,20), roomId=str(body?.roomId,64), label=str(body?.label,80);
  if(!PROVIDERS.has(channel)||!roomId||!label||!(await roomExists(env,merchant,roomId)))return json({error:'invalid'},400);
  const feed=normalizeFeedUrl(body?.feedUrl,channel); if(!feed)return json({error:'invalid-feed-url'},400);
  const id='chl-'+crypto.randomUUID(), secret=crypto.randomUUID()+crypto.randomUUID();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))].map((b)=>b.toString(16).padStart(2,'0')).join('');
  const config=JSON.stringify({v:1,roomId,feedEnc:await encryptFeed(feed,env.AUTH_SECRET)}), now=Date.now();
  await env.DB.prepare("INSERT INTO channel_links (id,merchant,channel,label,hash,config,status,created_ts,last_err) VALUES (?,?,?,?,?,?,'active',?,'')").bind(id,merchant,channel,label,hash,config,now).run();
  const result=await syncHotelChannels(env,{merchant,limit:50});
  return json({ok:true,id,sync:result,channels:await rows(env,merchant)},201);
}
export async function onRequestDelete({ request, env }) {
  if(!env.DB||!env.AUTH_SECRET)return json({error:'not-configured'},503);
  let body;try{body=await request.json();}catch(_){return json({error:'bad-json'},400);}
  const merchant=await merchantFor(request,env,body?.merchant);if(!merchant)return json({error:'unauthorized'},401);
  const id=str(body?.id,64);await env.DB.prepare("DELETE FROM channel_links WHERE id=? AND merchant=? AND channel IN ('booking','airbnb')").bind(id,merchant).run();
  return json({ok:true,channels:await rows(env,merchant)});
}

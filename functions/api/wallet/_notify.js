// After a client's balance moves (a purchase, a refund, a reward, a receipt
// claim), every card of that client whose shown balance changed is told:
// Apple devices get an empty APNs push on the Pass Type ID topic and come back
// for the new pass; Google objects are patched in place. A replayed sync that
// leaves the balance where it was touches no card and sends nothing.
import { apnsConfigured, apnsJwt } from '../push/_dispatch.js';

/* Wallet has no sandbox: a pass listens to production APNs only, whatever
   APNS_SANDBOX says for the app's own pushes. */
const PASS_APNS_HOST = 'https://api.push.apple.com';
import { loadMerchant } from './_merchant.js';
import { cardView } from './_card.js';
import { balanceKey, stripPath } from './_offers.js';
import { touchCards, devicesForSerial, dropPushToken, markCardUnsent } from './_store.js';
import { googleConfigured, patchGoogleObject, objectId, loyaltyObject } from './_google.js';

export async function sendPassPush(env, pushToken) {
  if (!apnsConfigured(env) || !env.WALLET_APPLE_PASS_TYPE_ID) return 'skipped';
  const type = env.WALLET_APNS_PUSH_TYPE || 'background';
  const res = await fetch(`${PASS_APNS_HOST}/3/device/${pushToken}`, {
    method: 'POST',
    headers: { authorization: 'bearer ' + await apnsJwt(env), 'apns-topic': env.WALLET_APPLE_PASS_TYPE_ID, 'apns-push-type': type, 'apns-priority': type === 'background' ? '5' : '10' },
    body: '{}',
  });
  if (res.ok) return 'sent';
  /* Only Apple saying the device is gone forgets it: 410, or a 400 whose reason
     is the token itself. Any other 400 (wrong topic, bad push type) is our own
     setup, and dropping on it would disconnect every iPhone for good. */
  let reason = '';
  try { reason = String((await res.json()).reason || ''); } catch (_) {}
  if (res.status === 410 || (res.status === 400 && reason === 'BadDeviceToken')) return 'removed';
  return 'failed';
}

export async function notifyClientChanged(env, merchant, clientId, { baseUrl = 'https://kiwi-os.com', now = Date.now() } = {}) {
  if (!env || !env.DB || !clientId) return { cards: 0 };
  const m = await loadMerchant(env.DB, merchant);
  if (!m || !m.on) return { cards: 0 };
  const c = await env.DB.prepare('SELECT id, name, points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(m.slug, clientId).first();
  const view = c && cardView({ fidelity: m.fidelity, client: c });
  if (!view) return { cards: 0 };
  const cards = await touchCards(env.DB, m.slug, clientId, balanceKey(view), now);
  const out = { cards: cards.length, apple: 0, google: 0 };
  for (const card of cards) {
    try {
      if (card.platform === 'apple') {
        let missed = false;
        for (const d of await devicesForSerial(env.DB, card.serial)) {
          const r = await sendPassPush(env, d.push_token).catch(() => 'failed');
          if (r === 'removed') await dropPushToken(env.DB, d.push_token);
          if (r === 'sent') out.apple++;
          if (r === 'failed') missed = true;
        }
        /* The balance was recorded before the send; a device we could not reach
           is told again on the next call instead of waiting for the next change. */
        if (missed) await markCardUnsent(env.DB, card.serial);
      } else if (card.platform === 'google' && googleConfigured(env)) {
        const obj = loyaltyObject(env, { serial: card.serial, clientId, view, stripUrl: baseUrl + stripPath(view, m, 3) });
        /* NOTIFY_ON_UPDATE: the new balance shows as a notification too (Google
           caps these at a few a day per pass on its side). */
        const patch = { loyaltyPoints: obj.loyaltyPoints, heroImage: obj.heroImage, textModulesData: obj.textModulesData, notifyPreference: 'NOTIFY_ON_UPDATE' };
        if (view.ready) patch.messages = [{ id: 'ready-' + now, header: m.name, body: `Votre récompense vous attend : ${view.rewardLabel || 'offerte'}`, messageType: 'TEXT_AND_NOTIFY' }];
        const st = await patchGoogleObject(env, objectId(env, card.serial), patch);
        if (st >= 200 && st < 300) out.google++; else await markCardUnsent(env.DB, card.serial);
      }
    } catch (_) { /* one unreachable device never stops the others */ }
  }
  return out;
}

/* Wraps a loyalty helper that collects the client ids it moved (voidSaleLoyalty,
   restoreSaleLoyalty in clients/_events.js): those clients' cards are told, after
   the answer when the route hands its waitUntil, else inline and fail-soft. */
export const cardsTold = (fn) => async (env, merchant, sale, waitUntil) => {
  const touched = [], n = await fn(env, merchant, sale, touched);
  for (const id of new Set(touched)) {
    const job = notifyClientChanged(env, merchant, id).catch(() => {});
    if (typeof waitUntil === 'function') waitUntil(job); else await job;
  }
  return n;
};

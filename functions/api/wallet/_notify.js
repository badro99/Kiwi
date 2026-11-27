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
import { touchCards, devicesForSerial, dropPushToken } from './_store.js';
import { googleConfigured, patchGoogleObject, objectId, loyaltyObject } from './_google.js';

export async function sendPassPush(env, pushToken) {
  if (!apnsConfigured(env) || !env.WALLET_APPLE_PASS_TYPE_ID) return 'skipped';
  const type = env.WALLET_APNS_PUSH_TYPE || 'background';
  const res = await fetch(`${PASS_APNS_HOST}/3/device/${pushToken}`, {
    method: 'POST',
    headers: { authorization: 'bearer ' + await apnsJwt(env), 'apns-topic': env.WALLET_APPLE_PASS_TYPE_ID, 'apns-push-type': type, 'apns-priority': type === 'background' ? '5' : '10' },
    body: '{}',
  });
  if (res.status === 410 || res.status === 400) return 'removed';
  return res.ok ? 'sent' : 'failed';
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
        for (const d of await devicesForSerial(env.DB, card.serial)) {
          const r = await sendPassPush(env, d.push_token);
          if (r === 'removed') await dropPushToken(env.DB, d.push_token);
          if (r === 'sent') out.apple++;
        }
      } else if (card.platform === 'google' && googleConfigured(env)) {
        const obj = loyaltyObject(env, { serial: card.serial, clientId, view, stripUrl: baseUrl + stripPath(view, m, 3) });
        const patch = { loyaltyPoints: obj.loyaltyPoints, heroImage: obj.heroImage, textModulesData: obj.textModulesData };
        if (view.ready) patch.messages = [{ id: 'ready-' + now, header: m.name, body: `Votre récompense vous attend : ${view.rewardLabel || 'offerte'}`, messageType: 'TEXT_AND_NOTIFY' }];
        const st = await patchGoogleObject(env, objectId(env, card.serial), patch);
        if (st >= 200 && st < 300) out.google++;
      }
    } catch (_) { /* one unreachable device never stops the others */ }
  }
  return out;
}

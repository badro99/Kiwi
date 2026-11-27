// The ways a customer can take their card: always the web card, plus Apple and
// Google when their secrets exist. Cards are issued (or reused) here, and their
// shown balance is recorded so the next push only fires on a real change.
import { issueCard, touchCards } from './_store.js';
import { appleConfigured } from './_pkpass.js';
import { googleConfigured, ensureGoogleCard, googleSaveUrl, loyaltyObject, objectId } from './_google.js';
import { stripColors } from './_images.js';

export const balanceKey = (view) => `${view.model}:${view.balance}/${view.target}:${view.ready ? 1 : 0}`;
export const stripPath = (view, merchant, scale = 2) =>
  `/api/wallet/strip/${view.model === 'amount' ? 'b' + Math.min(view.balance, view.target) : Math.min(view.balance, view.target)}-${view.target}-${stripColors(merchant).key}@${scale}.png`;

export async function offersFor(env, { merchant, clientId, view, baseUrl }) {
  const db = env.DB, slug = merchant.slug, out = {};
  const web = await issueCard(db, { merchant: slug, clientId, platform: 'web' });
  out.web = `${baseUrl}/carte/${slug}/${web.serial}?t=${web.authToken}`;
  if (appleConfigured(env)) {
    const a = await issueCard(db, { merchant: slug, clientId, platform: 'apple' });
    out.apple = `${baseUrl}/api/wallet/v1/download/${a.serial}.pkpass?t=${a.authToken}`;
  }
  if (googleConfigured(env)) {
    try {
      const g = await issueCard(db, { merchant: slug, clientId, platform: 'google' });
      await ensureGoogleCard(env, { merchant, baseUrl, object: loyaltyObject(env, { serial: g.serial, clientId, view, stripUrl: baseUrl + stripPath(view, merchant, 3) }) });
      out.google = await googleSaveUrl(env, { id: objectId(env, g.serial), origin: baseUrl });
    } catch (_) { /* Google unreachable: the web and Apple cards still go out */ }
  }
  await touchCards(db, slug, clientId, balanceKey(view));
  return out;
}

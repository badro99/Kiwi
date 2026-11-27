// What the Wallet card says. One view, computed from the merchant's `fidelity`
// doc and the client's balance, feeds Apple's pass.json, Google's loyalty object
// and the web card, so the three never disagree. The rule mirrors
// KiwiClients.progress (assets/clients-store.js) and _rules-loyalty.js.
import { loyaltyOn } from '../_rules-loyalty.js';

const int = (v) => Math.max(0, Math.round(Number(v) || 0));

export function cardView({ fidelity, client }) {
  const cfg = fidelity || null;
  if (!loyaltyOn(cfg)) return null;
  const c = client || {};
  const firstName = String(c.name || '').trim().split(/\s+/)[0] || '';
  if (cfg.model === 'amount') {
    const target = int(cfg.amount && cfg.amount.threshold) || 100, balance = int(c.points);
    return { model: 'amount', balance, target, remaining: Math.max(0, target - balance), ready: balance >= target,
      perMad: Math.max(0, Number(cfg.amount && cfg.amount.perMad) || 1),
      rewardLabel: String((cfg.amount && cfg.amount.reward) || '').slice(0, 60), text: `${balance} pts`, firstName };
  }
  const rule = cfg.model === 'product' ? cfg.product : cfg.visit;
  const target = Math.min(24, int(rule && rule.target) || 10), balance = int(c.stamps);
  return { model: cfg.model === 'product' ? 'product' : 'visit', balance, target,
    remaining: Math.max(0, target - balance), ready: balance >= target,
    rewardLabel: String((rule && rule.reward) || '').slice(0, 60),
    item: cfg.model === 'product' ? String((cfg.product && cfg.product.item) || '').slice(0, 40) : '',
    text: `${Math.min(balance, target)} / ${target}`, firstName };
}

function rgbOf(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* Wallet surfaces always use the Kiwi product palette. */
export function palette() {
  const bg = [3, 26, 19],   /* « Nuit », the flat middle of the web card's gradient */ brand = [125, 242, 176], fg = [247, 245, 240], label = brand;
  return { bg, brand, fg, label, css: { bg: css(bg), fg: css(fg), label: css(label) } };
}

export function passJson({ view, card, merchant, env, baseUrl }) {
  const pal = palette(merchant);
  const shop = String(merchant.name || 'Kiwi').slice(0, 60);
  const unit = view.model === 'amount' ? 'points' : 'tampons';
  const balance = {
    key: 'balance', label: view.model === 'amount' ? 'POINTS' : 'TAMPONS', value: view.text,
    /* Apple shows a change message only when it carries %@ (the new value), and
       only for a field whose value moved: the balance is the one that always
       moves, so it carries the "reward ready" news too. A literal % in the
       shop's name would be read as a format, so it is doubled. */
    changeMessage: view.ready ? 'Récompense prête chez ' + shop.replace(/%/g, '%%') + ' · %@' : (view.model === 'amount' ? 'Vous avez maintenant %@' : 'Carte à %@'),
  };
  const next = { key: 'reward', label: 'RÉCOMPENSE', value: view.rewardLabel || 'Offerte' };
  const left = { key: 'left', label: 'IL RESTE', value: view.ready ? 'Prête' : `${view.remaining} ${unit}` };
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: env.WALLET_APPLE_PASS_TYPE_ID,
    teamIdentifier: env.APNS_TEAM_ID,
    serialNumber: card.serial,
    authenticationToken: card.authToken,
    webServiceURL: `${baseUrl}/api/wallet`,
    organizationName: shop,
    description: `Carte fidélité ${shop}`,
    logoText: '× ' + shop, // beside the Kiwi wordmark: « kiwi × Santos Store »
    backgroundColor: pal.css.bg, foregroundColor: pal.css.fg, labelColor: pal.css.label,
    sharingProhibited: true,
    barcodes: [{ format: 'PKBarcodeFormatQR', message: 'KIWI-C:' + card.clientId, messageEncoding: 'iso-8859-1', altText: 'Carte fidélité' }],
    storeCard: {
      headerFields: view.firstName ? [{ key: 'name', label: 'CLIENT', value: view.firstName }] : [],
      primaryFields: [balance],
      secondaryFields: [next, left],
      backFields: [
        { key: 'how', label: 'Comment ça marche', value: view.model === 'amount'
          ? `Chaque dirham dépensé chez ${shop} vous donne des points. À ${view.target} points : ${view.rewardLabel || 'une récompense'}.`
          : `Un tampon à chaque ${view.model === 'product' && view.item ? view.item.toLowerCase() : 'passage'} chez ${shop}. À ${view.target} tampons : ${view.rewardLabel || 'une récompense'}. Montrez cette carte en caisse.` },
        merchant.address ? { key: 'address', label: 'Adresse', value: String(merchant.address).slice(0, 200) } : null,
        merchant.phone ? { key: 'phone', label: 'Téléphone', value: String(merchant.phone).slice(0, 30) } : null,
        { key: 'kiwi', label: 'Carte gérée par', value: 'Kiwi · kiwi-os.com' },
      ].filter(Boolean),
    },
  };
  const lat = Number(merchant.lat), lng = Number(merchant.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
    pass.locations = [{ latitude: lat, longitude: lng, relevantText: view.ready ? `Votre récompense vous attend chez ${shop}` : `${shop} · ${view.text}` }];
  }
  return pass;
}

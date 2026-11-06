/* Pressing till · manager approval for a discount decision.
 * A clerk may remove a business discount, never grant or change one alone: the
 * till asks for a manager code, the server compares it (POST /api/pin/verify,
 * verifyStaffPin) and answers with an identity, never with a code. Only an
 * owner or manager identity approves. The demo has no server: it approves as
 * "Démo" so the flow stays visible, and nothing it records is real. */

const MANAGER_ROLES = new Set([
  'proprietaire', 'owner', 'patron', 'direction',
  'manager', 'management', 'gerant', 'gerante', 'admin',
]);

/* Same folding as functions/auth/_lib.js normEmployeeRole: lower case, no accents. */
export function isManagerRole(role) {
  const r = String(role || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return MANAGER_ROLES.has(r);
}

function askCode({ heading, sub, tr, focus }) {
  return new Promise((resolve) => {
    const sheet = document.createElement('k-sheet');
    const pad = document.createElement('k-pin-pad');
    sheet.setAttribute('heading', tr('Autorisation manager'));
    pad.setAttribute('heading', heading || tr('Code manager'));
    pad.setAttribute('sub', sub || tr('Entrez le code manager à 4 chiffres.'));
    pad.setAttribute('size', 'ipad');
    sheet.setAttribute('data-px-approval', '');
    const done = (value) => {
      pad.onsubmit = null; sheet.removeAttribute('open'); sheet.remove();
      try { focus && focus.focus(); } catch (_) {}
      resolve(value);
    };
    pad.onsubmit = (code) => done(code);
    sheet.addEventListener('kiwi:action', (e) => { if (e.detail?.action === 'k.sheet.close') done(null); });
    sheet.appendChild(pad); document.body.appendChild(sheet); sheet.setAttribute('open', '');
    pad.shadowRoot?.querySelector('[data-key="1"]')?.focus();
  });
}

/* Resolves to { id, name, role } for an approving manager, or null (cancelled,
 * refused, not a manager, server unreachable). `reason` tells the caller which,
 * so the till can say it: 'cancelled' | 'refused' | 'not-manager' | 'unavailable'. */
export async function approveByManager({ merchant, isReal, tr = (s) => s, focus, sub } = {}) {
  if (!isReal) return { ok: true, actor: { id: 'demo', name: 'Démo', role: 'demo' } };
  if (!merchant) return { ok: false, reason: 'unavailable' };
  const pin = await askCode({ sub, tr, focus });
  if (pin === null || pin === undefined) return { ok: false, reason: 'cancelled' };
  let res = null, body = null;
  try {
    const { deadlineFetch } = await import('../request-deadline.mjs');
    res = await deadlineFetch('/api/pin/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant, pin: String(pin) }),
    });
    body = res && res.ok ? await res.json() : null;
  } catch (_) { return { ok: false, reason: 'unavailable' }; }
  if (!res) return { ok: false, reason: 'unavailable' };
  if (!res.ok) return { ok: false, reason: res.status >= 500 ? 'unavailable' : 'refused' };
  const staff = body && body.ok && body.staff;
  if (!staff || !(staff.id || staff.name)) return { ok: false, reason: 'refused' };
  if (!isManagerRole(staff.role)) return { ok: false, reason: 'not-manager' };
  return {
    ok: true,
    actor: { id: String(staff.id || '').slice(0, 80), name: String(staff.name || '').slice(0, 100), role: String(staff.role || '').slice(0, 40) },
  };
}

/* The till's own context: real once signed in or paired (fail closed), the
 * store from the pressing scope, phrases through the till's language layer. */
export function approveAtTill({ focus, sub } = {}) {
  const tr = (s) => (window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s);
  let isReal = true;
  try { isReal = !!(window.KiwiEnv?.isReal?.()) || !!window.KiwiPlatform?.isPaired?.() || !!localStorage.getItem('kiwiPairedVenue'); } catch (_) {}
  let merchant = '';
  try { merchant = window.KiwiPressingOps?.scope?.() || ''; } catch (_) {}
  return approveByManager({ merchant, isReal, tr, focus, sub: sub && tr(sub) });
}

export const APPROVAL_MESSAGES = {
  cancelled: 'Remise non enregistrée',
  refused: 'Code manager refusé',
  'not-manager': 'Seul un responsable peut accorder une remise',
  unavailable: 'Vérification du code indisponible, remise non enregistrée',
};

/* Kiwi · till-inventory-access · qui peut modifier l'inventaire depuis la caisse.
 *
 * L'interrupteur opérateur « Gestion complète de l'inventaire sur la caisse »
 * (features.caisseInventoryAdmin) ouvre la porte. Derrière lui (propriétaire,
 * 29 octobre 2026) : le propriétaire et les managers toujours ; un autre
 * membre seulement si le propriétaire l'a coché dans Équipe
 * (team.members[].tillInventory, assets/team/access-rules.js). God Mode, une
 * vue opérateur prouvée par caisse-pairing › bootForOperator, passe aussi.
 *
 * Le rôle vient de l'identité prouvée au pavé (verifyStaffPin) ; la liste des
 * membres cochés vient du document team, lisible par la caisse appairée sans
 * ses codes (functions/api/store.js › REDACT), gardée par établissement pour
 * le hors-ligne. Garde d'interface, comme l'interrupteur lui-même :
 * /api/catalog accepte toujours la caisse appairée.
 *
 * Utilisé par pos-boutique/inventory.js et pos-maison/inventory.js. */

const LIST_KEY = 'kiwi:tillInvStaff:';
const OPERATOR_KEY = 'kiwi:tillOperator:v1';
let ticked = null;
let readFor = '';

function config() { try { return window.KiwiConfig || null; } catch (_) { return null; } }
function merchant() {
  try {
    const v = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    return String((v && v.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
  } catch (_) { return ''; }
}
export function staffNameKey(v) {
  let s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  return s;
}
function memberKey(m) { return staffNameKey(m.name || ((m.firstName || '') + ' ' + (m.lastName || ''))); }
function stored(slug) {
  try { const list = JSON.parse(localStorage.getItem(LIST_KEY + slug) || 'null'); return Array.isArray(list) ? list : null; }
  catch (_) { return null; }
}

/** The names the owner ticked, read from the team document. */
export function tickedFromTeam(doc, slug) {
  const members = doc && Array.isArray(doc.members) ? doc.members : [];
  return members
    .filter((m) => m && m.tillInventory === true && !m.deleted && (!m.venueSlug || !slug || m.venueSlug === slug))
    .map(memberKey)
    .filter(Boolean);
}

export function refreshTillInventoryStaff() {
  const slug = merchant();
  if (!slug || typeof fetch !== 'function') return Promise.resolve(null);
  return fetch('/api/store?feature=team&merchant=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } })
    .then((r) => (r && r.ok ? r.json() : null))
    .then((res) => {
      if (!res || !res.data || slug !== merchant()) return ticked;
      ticked = tickedFromTeam(res.data, slug);
      readFor = slug;
      try { localStorage.setItem(LIST_KEY + slug, JSON.stringify(ticked)); } catch (_) {}
      return ticked;
    })
    .catch(() => ticked);
}

/** May the person signed in on this till create, edit or delete articles? */
export function tillInventoryAllowed() {
  const c = config();
  if (!(c && c.features && c.features.caisseInventoryAdmin === true)) return false;
  const slug = merchant();
  try { if (slug && sessionStorage.getItem(OPERATOR_KEY) === slug) return true; } catch (_) {}
  const me = window.KiwiStaff;
  // No staff codes at all: the till opens without a pad, it is the owner's own.
  if (!me) return !(Array.isArray(c.pins) && c.pins.length);
  const roles = window.KiwiRoles;
  const id = roles && typeof roles.idOf === 'function' ? roles.idOf(me.role) : '';
  if (id === 'manager' || id === 'proprietaire') return true;
  const list = (readFor === slug && ticked) || stored(slug) || [];
  return list.indexOf(staffNameKey(me.name)) !== -1;
}

/** Why the till refuses, in the cashier's words. */
export function tillInventoryRefusal() {
  const c = config();
  return c && c.features && c.features.caisseInventoryAdmin === true
    ? "Votre profil ne permet pas de modifier l'inventaire. Le propriétaire peut l'autoriser dans Équipe."
    : 'Articles et prix se gèrent dans le tableau de bord.';
}

try {
  refreshTillInventoryStaff();
  document.addEventListener('kiwi-staff', () => { refreshTillInventoryStaff(); });
} catch (_) {}

/* La porte du TABLEAU DE BORD tient aussi au DÉPARTEMENT (owner, 23 nov. 2026).
 *
 * La page Équipe range chaque personne sous une fonction ET un département. Les
 * commerçants mettent leur responsable de caisse en « Manager · Caisse » pour
 * qu'il puisse rembourser, annuler une table ou valider une remise à la caisse :
 * c'est voulu, et ça reste. Mais staff_pins ne garde que la fonction
 * (« Manager »), et un code de gérant ouvrait aussi le tableau de bord : le
 * chiffre, l'équipe, les réglages.
 *
 * La règle : un code de gérant n'ouvre le tableau de bord que si sa fiche Équipe
 * est au département Management. Une fiche sans département (les fiches d'avant)
 * et un code sans fiche (posé par l'onboarding ou la console) gardent la règle
 * d'avant. À la caisse rien ne change : ses accords de responsable passent par
 * employeeRoleOpensDashboard et verifyStaffPin, jamais par ici. Les intitulés de
 * propriétaire ne sont pas concernés : seul le patron les pose.
 *
 * La personne est retrouvée par SON code dans le document team de la boutique où
 * le code a été trouvé (deux personnes d'une boutique n'ont jamais le même
 * code) ; par son nom seulement si aucun code lisible ne lui correspond. Un
 * document illisible ferme la porte au gérant, pas au patron. */
import Catalog from '../../assets/permissions-catalog.js';
import { codeDocument } from './_staff-codes.js';
import { canonicalCode } from '../api/_rules-staff-credential.js';

const DASHBOARD_DEPARTMENTS = new Set(['management', 'direction']);

function norm(value) {
  let s = String(value == null ? '' : value).trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
const fullName = (m) => norm(m && (m.name || [m.firstName, m.lastName].filter(Boolean).join(' ')));

/* true : ce département laisse entrer un gérant. Vide = fiche d'avant. */
export function departmentOpensDashboard(department) {
  const d = norm(department);
  return !d || DASHBOARD_DEPARTMENTS.has(d);
}

async function teamOf(env, merchant, cache) {
  if (cache.has(merchant)) return cache.get(merchant);
  let doc = null;
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first();
    doc = row && row.data ? await codeDocument(env, merchant, 'team', JSON.parse(row.data)) : { members: [] };
  } catch (_) { doc = null; }
  cache.set(merchant, doc);
  return doc;
}

/* Les lignes de staff_pins (verifyAccountPin › accountStaffCodes) privées des
 * gérants dont la fiche est hors Management. Ne jette jamais : l'appelant garde
 * son propre traitement d'erreur. */
export async function keepDashboardDepartments(env, rows, pin) {
  const list = Array.isArray(rows) ? rows : [];
  const code = String(pin || '').trim();
  const cache = new Map();
  const out = [];
  for (const row of list) {
    const role = row && row.role;
    /* Seuls les gérants passent ce contrôle : le patron et la réception (vue
       réduite, _reception.js) gardent leur règle. */
    if (!row || Catalog.ownerTitle(role) || Catalog.presetForRole(role) !== 'manager') { out.push(row); continue; }
    const merchant = String(row.merchant || '');
    const doc = merchant ? await teamOf(env, merchant, cache) : { members: [] };
    if (!doc) continue;                                    // illisible : fermé au gérant
    const removed = new Set((Array.isArray(doc.removed) ? doc.removed : []).map((r) => String((r && r.id) || '')));
    const members = (Array.isArray(doc.members) ? doc.members : [])
      .filter((m) => m && typeof m === 'object' && !m.deleted && !removed.has(String(m.id || '')));
    let holders = code ? members.filter((m) => canonicalCode(m) === code) : [];
    if (!holders.length) holders = members.filter((m) => fullName(m) && fullName(m) === norm(row.name));
    if (holders.every((m) => departmentOpensDashboard(m.department))) out.push(row);
  }
  return out;
}

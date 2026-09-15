export const TICKET_TAXONOMY = Object.freeze({
  version: 1,
  kinds: Object.freeze([
    { id: 'bug', label: { fr: 'Anomalie', en: 'Bug' }, description: { fr: 'Quelque chose ne fonctionne pas correctement.', en: 'Something does not work correctly.' } },
    { id: 'improvement', label: { fr: 'Amélioration', en: 'Improvement' }, description: { fr: 'Une fonction existe mais devrait être meilleure.', en: 'An existing capability should work better.' } },
    { id: 'feature', label: { fr: 'Nouvelle fonction', en: 'Feature' }, description: { fr: 'Une nouvelle capacité à construire.', en: 'A new capability to build.' } },
    { id: 'question', label: { fr: 'Question', en: 'Question' }, description: { fr: 'Aide ou vérification demandée.', en: 'Support or a requested check.' } },
    { id: 'unsorted', label: { fr: 'À classer', en: 'Unsorted' }, description: { fr: 'Pas encore classé.', en: 'Not classified yet.' } },
  ]),
  areas: Object.freeze([
    { id: 'caisse', label: { fr: 'Caisse', en: 'Register' } },
    { id: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
    { id: 'serveur', label: { fr: 'Serveur', en: 'Waiter app' } },
    { id: 'cuisine', label: { fr: 'Cuisine', en: 'Kitchen' } },
    { id: 'printing', label: { fr: 'Impression', en: 'Printing' } },
    { id: 'sync', label: { fr: 'Synchronisation', en: 'Sync' } },
    { id: 'reports-money', label: { fr: 'Rapports et argent', en: 'Reports and money' } },
    { id: 'menu-stock', label: { fr: 'Menu et stock', en: 'Menu and stock' } },
    { id: 'verticals', label: { fr: 'Métiers', en: 'Verticals' } },
    { id: 'accounts-access', label: { fr: 'Comptes et accès', en: 'Accounts and access' } },
    { id: 'site', label: { fr: 'Site public', en: 'Public site' } },
    { id: 'tooling', label: { fr: 'Outils internes', en: 'Internal tools' } },
    { id: 'cross-product', label: { fr: 'Transverse', en: 'Cross-product' } },
  ]),
  subkinds: Object.freeze({
    bug: Object.freeze([
      { id: 'wrong-figures', label: { fr: 'Chiffres incorrects', en: 'Wrong figures' } },
      { id: 'not-syncing', label: { fr: 'Ne se synchronise pas', en: 'Not syncing' } },
      { id: 'crash-blank', label: { fr: 'Blocage ou écran vide', en: 'Crash or blank screen' } },
      { id: 'wrong-behavior', label: { fr: 'Mauvais comportement', en: 'Wrong behavior' } },
      { id: 'display-layout', label: { fr: 'Affichage et mise en page', en: 'Display and layout' } },
      { id: 'printing-output', label: { fr: 'Sortie imprimée', en: 'Printing output' } },
      { id: 'performance', label: { fr: 'Performance', en: 'Performance' } },
      { id: 'security-access', label: { fr: 'Sécurité et accès', en: 'Security and access' } },
    ]),
    improvement: Object.freeze([
      { id: 'ux-flow', label: { fr: 'Parcours utilisateur', en: 'User flow' } },
      { id: 'copy-translation', label: { fr: 'Texte et traduction', en: 'Copy and translation' } },
      { id: 'performance', label: { fr: 'Performance', en: 'Performance' } },
      { id: 'visual-design', label: { fr: 'Design visuel', en: 'Visual design' } },
      { id: 'adapt-to-vertical', label: { fr: 'Adapter au métier', en: 'Adapt to vertical' } },
    ]),
    feature: Object.freeze([
      { id: 'new-module', label: { fr: 'Nouveau module', en: 'New module' } },
      { id: 'integration', label: { fr: 'Intégration', en: 'Integration' } },
      { id: 'reporting', label: { fr: 'Rapports', en: 'Reporting' } },
      { id: 'hardware', label: { fr: 'Matériel', en: 'Hardware' } },
    ]),
    question: Object.freeze([]),
    unsorted: Object.freeze([]),
  }),
});

const KIND_IDS = new Set(TICKET_TAXONOMY.kinds.map((item) => item.id));
const AREA_IDS = new Set(TICKET_TAXONOMY.areas.map((item) => item.id));

function optionalId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim();
}

function booleanValue(value) {
  if (value === undefined || value === null || value === '') return false;
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') return true;
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') return false;
  return null;
}

export function validateTicketClassification(input = {}) {
  const kind = optionalId(input.kind) || 'unsorted';
  const area = optionalId(input.area);
  const subkind = optionalId(input.subkind);
  const moneyAtRisk = booleanValue(input.money_at_risk);

  if (!KIND_IDS.has(kind)) return { ok: false, error: 'invalid-kind', field: 'kind' };
  if (area && !AREA_IDS.has(area)) return { ok: false, error: 'invalid-area', field: 'area' };
  if (moneyAtRisk === null) return { ok: false, error: 'invalid-money-at-risk', field: 'money_at_risk' };

  const allowedSubkinds = TICKET_TAXONOMY.subkinds[kind] || [];
  if (subkind && !allowedSubkinds.some((item) => item.id === subkind)) {
    const knownElsewhere = Object.values(TICKET_TAXONOMY.subkinds)
      .some((items) => items.some((item) => item.id === subkind));
    return { ok: false, error: knownElsewhere ? 'subkind-kind-mismatch' : 'invalid-subkind', field: 'subkind' };
  }

  return {
    ok: true,
    value: { kind, area, subkind, money_at_risk: moneyAtRisk },
  };
}

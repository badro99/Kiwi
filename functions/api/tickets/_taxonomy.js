export const TICKET_TAXONOMY = Object.freeze({
  version: 1,
  kinds: Object.freeze([
    { id: 'bug', label: { fr: 'Anomalie', en: 'Bug', ar: "خلل" }, description: { fr: 'Quelque chose ne fonctionne pas correctement.', en: 'Something does not work correctly.', ar: 'شيء ما لا يعمل بشكل صحيح.' } },
    { id: 'improvement', label: { fr: 'Amélioration', en: 'Improvement', ar: "تحسين" }, description: { fr: 'Une fonction existe mais devrait être meilleure.', en: 'An existing capability should work better.', ar: 'وظيفة موجودة تحتاج إلى تحسين.' } },
    { id: 'feature', label: { fr: 'Nouvelle fonction', en: 'Feature', ar: "ميزة جديدة" }, description: { fr: 'Une nouvelle capacité à construire.', en: 'A new capability to build.', ar: 'قدرة جديدة مطلوب تطويرها.' } },
    { id: 'question', label: { fr: 'Question', en: 'Question', ar: "سؤال" }, description: { fr: 'Aide ou vérification demandée.', en: 'Support or a requested check.', ar: 'مساعدة أو تحقق مطلوب.' } },
    { id: 'unsorted', label: { fr: 'À classer', en: 'Unsorted', ar: "غير مصنفة" }, description: { fr: 'Pas encore classé.', en: 'Not classified yet.', ar: 'لم يتم التصنيف بعد.' } },
  ]),
  areas: Object.freeze([
    { id: 'caisse', label: { fr: 'Caisse', en: 'Register', ar: "الصندوق" } },
    { id: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard', ar: "لوحة التحكم" } },
    { id: 'serveur', label: { fr: 'Serveur', en: 'Waiter app', ar: "تطبيق النادل" } },
    { id: 'cuisine', label: { fr: 'Cuisine', en: 'Kitchen', ar: "المطبخ" } },
    { id: 'printing', label: { fr: 'Impression', en: 'Printing', ar: "الطباعة" } },
    { id: 'sync', label: { fr: 'Synchronisation', en: 'Sync', ar: "المزامنة" } },
    { id: 'reports-money', label: { fr: 'Rapports et argent', en: 'Reports and money', ar: "التقارير والمال" } },
    { id: 'menu-stock', label: { fr: 'Menu et stock', en: 'Menu and stock', ar: "القائمة والمخزون" } },
    { id: 'verticals', label: { fr: 'Métiers', en: 'Verticals', ar: "المهن" } },
    { id: 'accounts-access', label: { fr: 'Comptes et accès', en: 'Accounts and access', ar: "الحسابات والصلاحيات" } },
    { id: 'site', label: { fr: 'Site public', en: 'Public site', ar: "الموقع العام" } },
    { id: 'tooling', label: { fr: 'Outils internes', en: 'Internal tools', ar: "أدوات داخلية" } },
    { id: 'cross-product', label: { fr: 'Transverse', en: 'Cross-product', ar: "مشترك بين الأقسام" } },
  ]),
  subkinds: Object.freeze({
    bug: Object.freeze([
      { id: 'wrong-figures', label: { fr: 'Chiffres incorrects', en: 'Wrong figures', ar: "أرقام خاطئة" } },
      { id: 'not-syncing', label: { fr: 'Ne se synchronise pas', en: 'Not syncing', ar: "لا تتم المزامنة" } },
      { id: 'crash-blank', label: { fr: 'Blocage ou écran vide', en: 'Crash or blank screen', ar: "توقف أو شاشة فارغة" } },
      { id: 'wrong-behavior', label: { fr: 'Mauvais comportement', en: 'Wrong behavior', ar: "سلوك غير صحيح" } },
      { id: 'display-layout', label: { fr: 'Affichage et mise en page', en: 'Display and layout', ar: "العرض والتنسيق" } },
      { id: 'printing-output', label: { fr: 'Sortie imprimée', en: 'Printing output', ar: "ناتج الطباعة" } },
      { id: 'performance', label: { fr: 'Performance', en: 'Performance', ar: "الأداء" } },
      { id: 'security-access', label: { fr: 'Sécurité et accès', en: 'Security and access', ar: "الأمان والصلاحيات" } },
    ]),
    improvement: Object.freeze([
      { id: 'ux-flow', label: { fr: 'Parcours utilisateur', en: 'User flow', ar: "مسار الاستخدام" } },
      { id: 'copy-translation', label: { fr: 'Texte et traduction', en: 'Copy and translation', ar: "النصوص والترجمة" } },
      { id: 'performance', label: { fr: 'Performance', en: 'Performance', ar: "الأداء" } },
      { id: 'visual-design', label: { fr: 'Design visuel', en: 'Visual design', ar: "التصميم المرئي" } },
      { id: 'adapt-to-vertical', label: { fr: 'Adapter au métier', en: 'Adapt to vertical', ar: "تكييف حسب المهنة" } },
    ]),
    feature: Object.freeze([
      { id: 'new-module', label: { fr: 'Nouveau module', en: 'New module', ar: "وحدة جديدة" } },
      { id: 'integration', label: { fr: 'Intégration', en: 'Integration', ar: "تكامل" } },
      { id: 'reporting', label: { fr: 'Rapports', en: 'Reporting', ar: "التقارير" } },
      { id: 'hardware', label: { fr: 'Matériel', en: 'Hardware', ar: "الأجهزة" } },
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

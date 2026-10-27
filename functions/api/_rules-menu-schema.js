const str = (v, n) => String(v == null ? '' : v).slice(0, n);
export const OPTION_EMOJIS = new Set([
  '🍏', '🍎', '🍐', '🍊', '🍋', '🍋‍🟩', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
  '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🫒', '🥑', '🍆', '🥔', '🍠', '🥕',
  '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🥜', '🫘', '🌰', '🫛',
  '🫚', '🍄', '🌿', '🍀', '🌱', '🌾', '🍚', '🧂', '🧈', '🍯', '🥛', '🧀',
  '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🥚', '🍳', '🍖', '🍗',
  '🥩', '🥓', '🐟', '🦐', '🦞', '🦀', '🦑', '🐙', '🦪', '🍤', '🍔', '🍟',
  '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥘', '🍲', '🫕', '🥣',
  '🥗', '🍿', '🥫', '🍝', '🍜', '🍛', '🍣', '🍱', '🥟', '🍙', '🍘', '🍥',
  '🥠', '🥮', '🍢', '🍡', '🥡',
  '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍩',
  '🍪', '🍼', '🥤', '🧋', '🧃', '🧉', '🫖', '🍵', '☕', '🍶', '🍺', '🍻',
  '🥂', '🍷', '🥃', '🍸', '🍹', '🍾', '🧊',
  '✅', '❌', '🚫', '⛔', '⚠️', '➕', '➖', '🔥', '♨️', '❄️', '💧', '⏱️',
  '🔪', '🥄', '🍴', '🥢', '🍽️', '📦', '🛍️', '🔔', '⭐', '❤️',
  '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪',
]);
export const optionEmoji = (v) => {
  const value = str(v, 16).trim();
  return OPTION_EMOJIS.has(value) ? value : '';
};

export const modifierAmount = (value) => {
  return Math.round(Math.max(0, Math.min(1e6, Number(value) || 0)) * 100) / 100;
}
export const normalizeModifier = (raw) => {
  return { id: str(raw && raw.id, 40), name: str(raw && raw.name, 60),
    emoji: optionEmoji(raw && raw.emoji), price: modifierAmount(raw && raw.price) };
}
export const validModifier = (choice) => { return !!(choice && choice.id && choice.name); }

/* A choice count: a whole number between `lo` and 40, or null for none. */
const optionCount = (value, lo) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(lo, Math.min(40, n)) : null;
};
/* « Up to 2 sauces »: the order screens and order/_guest-pricing.js enforce
 * min and max, so publishing keeps them. A group without limits stays as it
 * was; a single-choice group never asks for more than one; a positive minimum
 * is a required group. */
export const normalizeOptionGroup = (raw) => {
  const group = {
    id: str(raw && raw.id, 40), name: str(raw && raw.name, 60),
    kind: raw && raw.kind === 'many' ? 'many' : 'one', required: !!(raw && raw.required),
  };
  const max = group.kind === 'many' ? optionCount(raw && raw.max, 1) : null;
  const min = optionCount(raw && raw.min, 0);
  if (min !== null) {
    group.min = Math.min(min, max !== null ? max : (group.kind === 'many' ? 40 : 1));
    if (group.min > 0) group.required = true;
  }
  if (max !== null) group.max = max;
  return group;
};

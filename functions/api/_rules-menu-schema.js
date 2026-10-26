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

export const normalizeOptionGroup = (raw) => ({
  id: str(raw && raw.id, 40), name: str(raw && raw.name, 60),
  kind: raw && raw.kind === 'many' ? 'many' : 'one', required: !!(raw && raw.required),
});

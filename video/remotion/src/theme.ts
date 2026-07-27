/* Kiwi brand tokens — mirrored from assets/tokens.css.
 * These are locked. Don't introduce accents that aren't here. */
export const C = {
  atlas: '#0B6E4F',
  riad: '#053B2C',
  mint: '#7DF2B0',
  paper: '#F7F5F0',
  ink: '#0A0F0D',

  /* working tints, all derived from the five above */
  paperDeep: '#EFEBE3',
  line: 'rgba(10,15,13,.10)',
  lineSoft: 'rgba(10,15,13,.06)',
  inkMute: 'rgba(10,15,13,.52)',
  inkFaint: 'rgba(10,15,13,.34)',
  onAtlas: 'rgba(247,245,240,.72)',
  onAtlasFaint: 'rgba(247,245,240,.46)',
};

export const F = {
  sans: '"Inter Tight", system-ui, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

/* The signature Kiwi spring — la lentille liquide, from assets/liquid-lens.js.
 * Used for anything that settles into place. */
export const SPRING = { damping: 200, mass: 0.6, stiffness: 110 };

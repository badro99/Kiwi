/* Inventaire Maison · les finitions de l'écran (propriétaire, 2026-11-24 :
 * « fix them all the best way possible »).
 *
 *   · une erreur de saisie se dit SOUS le champ, en rouge, le curseur y est
 *     posé ; avant, « Le nom est requis » passait en toast et le toast couvrait
 *     les boutons du bas ;
 *   · les boutons d'une variante portent leur mot (Étiquette, Code existant,
 *     Mouvement, Supprimer), plus seulement une icône ;
 *   · la barre de recherche garde sa largeur quand les boutons d'outils
 *     l'entourent sur iPad ;
 *   · « Sans couleur » dans le formulaire d'article (new-sizes.js).
 *
 * pos-maison.css et inventory.js sont à leur plafond de taille
 * (tools/file-size-ratchet-test.mjs) : les règles vivent ici et sont posées
 * une fois au chargement du module, sous #pos-maison. */

export const UNCAT = 'Sans catégorie';

const CSS = ''
  /* boutons d'une variante : icône + mot */
  + '#pos-maison .mzi-vact{flex-wrap:nowrap;gap:4px}'
  + '#pos-maison .mzi-vact .mzi-mini{width:auto;min-width:54px;height:auto;min-height:44px;padding:4px 6px;flex-direction:column;gap:2px;font:inherit;font-size:10px;font-weight:600;line-height:1.1;white-space:nowrap}'
  + '#pos-maison .mzi-vact .mzi-mini svg{width:16px;height:16px}'
  + '#pos-maison .mzi-cbtn,#pos-maison tr:has(.mzi-cbtn)>td:first-child{white-space:nowrap}'
  /* recherche : jamais écrasée par les boutons d'outils */
  + '#pos-maison .mz-page .mzi-tools{flex-wrap:wrap}'
  + '#pos-maison .mz-page .mzi-scan{flex:1 1 300px;min-width:min(300px,100%)}'
  + '#pos-maison .mz-page .mzi-scan input{min-width:0;text-overflow:ellipsis}'
  /* « Sans couleur » */
  + '#pos-maison .mzs-col-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
  + '#pos-maison .mzs-nocol{display:inline-flex;align-items:center;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink-2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}'
  + '#pos-maison .mzs-nocol.on{border-color:var(--atlas);background:rgba(11,110,79,.1);color:var(--atlas)}'
  + '#pos-maison .mzs-col-hint{font-size:12px;color:var(--ink-3);margin-top:6px}';

export function ensureInvCss() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('mz-inv-ux-css')) return;
  const s = document.createElement('style');
  s.id = 'mz-inv-ux-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
ensureInvCss();

/* L'erreur sous le champ : le helper partagé avec la caisse boutique. */
export { fieldErr } from '../field-error.js?v=2';

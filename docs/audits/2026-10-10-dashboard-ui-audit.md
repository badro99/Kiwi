# Dashboard UI audit · 2026-10-10

Prompted by the promotion composer opening on a discount its own settings
reject, with the preview's prices painted dark green on dark green.

## Method

An in-page auditor (`tools/ui-audit/audit.js`) walks every
visible text node. For each one it computes the WCAG contrast ratio against
the composited background, and flags italic text, em dashes, `undefined` /
`NaN` / `null` in copy, clipped text and buttons with no accessible name. It
skips text whose effective opacity is under 0.35, so hidden tooltips don't
raise false alarms.

`tools/ui-audit/sweep.js` opens every sidebar page. `tools/ui-audit/modals.js` opens each page's
create, configure and edit dialogs, but never clicks anything that saves or
deletes. The auditor runs on each result.

Coverage:

| Venue | Light | Dark | Dialogs |
| --- | --- | --- | --- |
| Boutique (Maison Mansour) | yes | yes | yes |
| Café (Café Atlas) | yes | yes | yes |

Plus a 390 px phone pass for horizontal overflow. Code was searched for the
same patterns wherever the browser found one.

## Root causes (systemic)

1. **The skin's modal-ink rule.** `design-vexel.css` paints every
   `h1–h6 / b / strong` inside a modal or drawer `--ink`. That puts black text
   on any dark panel inside a modal, and on filled buttons.
   - Fixed: the rule now skips `[data-surface="inverse"] *`, `button *` and
     `[role="button"] *`.
   - Dark panels inside modals must carry `data-surface="inverse"`.
2. **`--mint` is remapped to `--atlas` in the light skin.** Any "accent on a
   dark tile" that used `var(--mint)` became dark green on `--riad`.
   - On fixed dark surfaces, use the literal `#7DF2B0` (or inherit the
     surface's ink).
3. **Cards written for an inverse surface that the skin repaints white.**
   - Text set to `--inverse-ink` or `--n-300` (14 % ink) disappears.
   - Content inside such cards should inherit `currentColor` and use opacity
     for secondary lines.
4. **Defaults that fail their own validation.**
   - The promotion composer seeded −20 % whatever the owner had allowed.

## Fixed

| Where | Problem | Fix |
| --- | --- | --- |
| Promotion composer, dashboard | Opened at −20 % → "Pourcentage non autorisé", Lancer disabled | Draft snaps to the nearest allowed %. Kind switch and templates do too. Message lists the allowed values. |
| Promotion composer, boutique and maison tills | Same default bug (`pos-boutique.js`, `pos-maison.js`) | Same fix |
| Promotion preview | Prices ink on `--riad` (1.5:1) | `data-surface="inverse"` plus the skin exemption. Struck prices raised to 62 %. |
| Réservations › Paramètres | "Accepter les réservations en ligne" ink on `--riad` (1.53:1) | `data-surface="inverse"` on `.kr-setting-hero` |
| Accueil › Service du soir (restaurants), **real stores** | Guest names and "Réservations non configurées" in `--inverse-ink` on a white card (invisible). Notes and status in `--n-300`. Icon inverted to white. | Inherit card ink; secondary lines at 0.7 opacity; inline Material icon in `currentColor` |
| Accueil › Service du soir, demo | Notes `#A8B0C8` on white (1.7:1); "NOUVEAU" badge 1.06:1 | Same treatment |
| Rapport journalier lead tile | Skin repainted the `--riad` tile white, leaving white text on white | `.kdr-kpi:not(.is-lead)` in both skins |
| Rapport journalier lead tile | "Up" delta used `--mint` (atlas in light skin) on `--riad`; caption at 50 % | Literal mint; caption at 76 % |
| Rapport journalier, dark | Down delta 3.57:1 | Lighter terracotta in dark |
| Inventaire, selected filter pill | Count in `--mint`, i.e. atlas, on the dark pill | Count inherits pill ink |
| Inventaire, dark | "N en stock" tag at 38 % white | 72 % |
| Catégories | Rename and delete icon buttons had no accessible name | `aria-label` and `title` |
| Topbar | Search placeholder and "Propriétaire · admin" at 46 % (≈4.1:1) | 60 % |
| Accueil revenue delta | "vs hier" label at 62 % opacity on tinted red (2.6:1) | 86 % |

## Checked and left alone

- **Planning: 7 buttons flagged "no name".** They sit in a closed menu, so
  they have no rendered text. False positive.
- **Inventaire "Plus" menu.** Same false positive (closed `<details>`).
- **Decorative "·" separators in Commandes (2.2:1).** Ornament, not content.
- **Pill rows wider than the phone (date range, inventory filters).** These
  are deliberate horizontal scrollers (`overflow-x: auto`).
- **Gemini code pass.** It could not run (daily quota). The fake-action class
  is covered by `tools/action-honesty-test.js`, which passes.

## Still open (style drift, not broken)

- **~90 labels at 9–10.5 px.** Uppercase eyebrows on Terminaux, Planning,
  Promotions, Retours and Vendus. Readable but under the 11 px floor most of
  the product uses.
- **Planning › Horaires d'ouverture.** The "Aujourd'hui" chip is atlas at
  9.5 px on grey (4.38:1).

## Re-running

From the dashboard console on a local server:

```js
eval(await (await fetch('/tools/ui-audit/audit.js')).text());
eval(await (await fetch('/tools/ui-audit/sweep.js')).text());
eval(await (await fetch('/tools/ui-audit/modals.js')).text());
__kiwiSummary(await __kiwiSweep());
await __kiwiModalSweep();
```

Run it in each venue type, in light and dark, and at phone width. Sweeping
behind the account lock screen audits nothing, so enter the demo first.

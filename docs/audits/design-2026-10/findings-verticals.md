# Findings · cluster verticals

## 1. Scorecard

| Dimension | Score | One-line reason |
|---|---|---|
| Visual design | 3 | No shared type scale (18 to 27 distinct px sizes per vertical CSS). Page-title top offset varies from 40 to 135 CSS px across trades. Spa dark columns paint 50% white. Pressing dark shows white photo tiles. 17 private hand-drawn 64×64 icon sets. |
| UI | 3 | Text collisions on coiffure (iPad, iPhone) and librairie (iPhone). `autre` has an empty catalogue and no add action. 9 different primary-button labels. Many controls at 30 to 40 px. "Operations" rail item is misaligned in every vertical. |
| UX | 3 | Trade fit on desktop is strong: hotel arrivals and departures, pressing pickup date, boulangerie ×2/×6/×12, gym check-in, pharmacie ordonnance. On iPhone, three verticals cannot be used and `autre` cannot complete a sale. |
| Motion | 0 | UNVERIFIED: no recordings. Static evidence: 94 `@keyframes` across vertical CSS, lens absent in 4 verticals, a 3 s greeting overlay. Needs screen recordings of add-to-cart, pay, tab switch and lock at 60 fps, plus the reduced-motion pass. |
| Feel and haptics | 0 | UNVERIFIED: no haptics trace. Only `pos-boutique.js`, `pos-maison.js` and `pos-sale.js` reference haptics; the other 14 trades are silent. Needs a device trace on add, pay and error. |
| Copy and language | 2 | English frames are about 80% French. All 15 non-boutique vertical files contain zero i18n hooks. Half-translated pairs ("The sale is empty." followed by a French body). French greeting. A missing space joins name and title. |
| Accessibility | 2 | 578 declarations of 9 to 11 px font in vertical CSS. 30 to 40 px heights are common. Gym member-code placeholder is 2.47:1. No vertical CSS file has a dark-mode rule. |
| Honesty and consistency | 4 | Boutique and Maison (two different stores) both show "5 sales · 5 550 MAD today" and ticket 1208. Spa's now-line is frozen at 14:30 while the rail clock says 20:51. Time formats differ ("15h30" vs "14:00"). |
| Performance | 0 | UNVERIFIED: no INP data. Static risk: pos-maison.js is 9,275 lines, pos-boutique.js 7,379. Needs INP on an iPhone 12 for add-to-cart and pay in maison, boutique and gym. |

## 2. Verdict
**FAIL.** No dimension reaches 10.

The answer to "one product or 17?" is 17. The shell is shared: dark rail, venue card, mode tiles, language switch, Refresh and Lock. Everything inside the content area is per-trade:
- its own CSS file
- its own `art()` icon set
- its own cart-panel name: Sale, Order, Bouquet, Panier, Comptoir
- its own primary-button wording
- its own header position

## 3. The five changes that would move the scores most
1. **Keyed i18n for every vertical** (Copy 2→7, Honesty +1). Today `caisse-lang.js` swaps strings by matching their text. It covers boutique and maison, plus a few shared words such as "Encaisser", and none of the 15 trade titles. Move vertical copy to keys with FR, EN and AR entries, and add a check that fails on French text in EN frames.
2. **Real phone layouts for all 17** (UX 3→6, UI +1, A11y +1). The cart should be a bottom sheet over a full-width catalogue. Planning grids (spa, coiffure) need one column per staff member with a swipe between them. Librairie's cart panel currently takes about 318 of 440 pt.
3. **One shared till frame** (Visual 3→6, UI 3→6). Components:
   - `CartPanel`: title "Sale", ticket number, customer slot, total, primary button
   - `PageHeader`: fixed 24 pt top inset, one title size, one subtitle line
   - `ProductTile`
   - one type scale of 6 sizes, minimum 13 px

   Each vertical keeps only the part specific to its trade: pickup date, room board, planning grid.
4. **Dark mode through tokens, and Material icons** (Visual +1, A11y +1).
   - Replace raw `rgba(255,255,255,.x)` with surface tokens; `pos-spa.css:162` is the first fix.
   - Put pressing's product photos on a token surface rather than white squares.
   - Delete the 17 `art()` factories and use Material Symbols.
5. **Honest demo data and no dead ends** (Honesty 4→7, UX +1).
   - Give each demo store its own seed for sales and ticket numbers.
   - Tie spa's now-line to the rail clock, or label it.
   - Give `autre` an add-item action on the till.
   - Pick one time format.

## 4. Findings by surface

### verticals.autre
- **Blocker · empty catalogue with no action.** Frame: `verticals.autre/desktop-light-en.png`. The main card says only "Ajoutez vos articles dans le tableau de bord." and offers no button. The top-right pill "Articles et prix se gèrent dans le tableau de bord" only shows a toast (`pos-autre.js` `catalogDashboardOnly()`). A cashier cannot ring up a single sale. **A 10:** a free-amount keypad ("Montant libre") plus a quick-add item sheet, so the first sale works on day one.
- **Major · different shell from the other 16.** Same frame. There is no FR/EN/AR switch. Lock is a full-width bordered button, where the others use a plain row. The rail label reads "CAISSE" and the venue card reads "Mon activité". The source is a 62-line one-off (`pos-autre.js` mount). **A 10:** the same rail component as every other vertical.
- **Major · copy leaks.** In the EN frame, these stay French: "Mon activité", "Caisse polyvalente", "Suivi d'activité", "Journée", "Touchez un article.", "Un catalogue libre pour les activités qui ne rentrent dans aucune case." The source h1 is "Encaisser" (`pos-autre.js`, render), and only that word is caught by `caisse-lang.js:152`.
- **Polish · ghost greeting.** Same frame: "Bonjour, bienvenue." shows at about 3% opacity behind the cards. The greeting overlay lives 3,000 ms (`pos-dispatch.js:301-302`), and the capture waited 2,200 ms. The greeting is also French in EN. **A 10:** a greeting of 1.2 s or less that is interruptible and translated.

### verticals.spa
- **Blocker · dark-mode staff columns paint mid-grey.** Frame: `verticals.spa/desktop-dark-en.png`. The column background measures about #7F7F7F behind near-black appointment cards; the iPad dark frame has the same issue. Source: `assets/pos-spa.css:162` `.sp-col { background: rgba(255,255,255,0.5); }`. **A 10:** a token such as `--surface-2` that resolves to a dark tint.
- **Blocker · iPhone planning unusable.** Frame: `verticals.spa/iphone-light-en.png`. The staff grid is pushed off the right edge. Only fragments of "Nour E…" and "Yasmi…" show, with a 200 pt empty area on the left. **A 10:** one column per therapist on phone, with a segmented switch between them.
- **Major · time contradiction.** Desktop frames say "journée simulée à 14:30" with the now-line at 14:30, while the rail clock shows 20:51. Source: `pos-spa.js:20, 269`. **A 10:** the now-line follows the rail clock, or the demo label is visible on the line itself.
- **Polish · missing space.** "Nour El HassanSénior · 8 ans" and "Salma BenkiraneCertifiée CIDESCO" in the staff headers.
- **Polish · mixed legend.** "terminée · in progress · à venir · à encaisser" mixes EN and FR.

### verticals.coiffure
- **Blocker · overlapping text in the staff timeline.** Frame: `verticals.coiffure/ipad-light-en.png`.
  - "130 min" is drawn over "Nadia El Fassi".
  - "45 min" over "Khalid Rais", "90 min" over "Salma Bennani".
  - "à suivre" collides with "PROCHAIN" ("rasagePROCHAIN").
  - "Ajouter un rendez-vouscréneau libre" has no space.
  - The right column is clipped ("Brushi", "à c").

  The iPhone frame is worse: names stack across time cells. **A 10:** duration sits on its own line, and the grid scrolls horizontally with sticky staff headers.
- **Major · floating "20:58" pill.** It sits 60 px above the grid with no clear owner.

### verticals.librairie
- **Blocker · iPhone layout collapse.** Frame: `verticals.librairie/iphone-light-en.png`.
  - The "Panier" cart panel takes about 318 of 440 pt.
  - The catalogue is squeezed to about 120 pt, so "Touchez un article pour l'ajouter au panier" wraps one word per line.
  - "Le Pain nu" and "L'Alchimiste" titles overlap.
  - The search field is cut to "Sca".
  - The "Scan continu" button covers the disabled "Take payment · 0 MAD" button.

  **A 10:** a full-width catalogue with a collapsed cart bar, as boutique already does.
- **Major · copy.** "Panier · V-4821", "Attacher un client", "Le panier est vide." Other verticals call the same panel "Sale".

### verticals.pressing
- **Major · white photo tiles in dark mode.** Frame: `verticals.pressing/desktop-dark-en.png`. Each of the 23 garment tiles holds an 88×88 pt opaque white PNG (`pressing-caisse.js:57`, `assets/pressing-products/*.png`) on a #0C1210 card, which makes a grid of glaring squares. Pressing is also the only vertical that uses photos; the others use line art. **A 10:** transparent cut-outs on a token surface, or Material icons like the rest.
- **Major · disabled primary unreadable.** "Confirm · étiquettes & ticket" measures 1.68:1. Its label also mixes English and French.
- **Polish · extra rail rows.** "Mode jour" and "Fullscreen" appear in the rail on pressing only.
- **Polish · iPhone search truncated** to "Trouve".

### verticals.gym
- **Major · layout offsets.** Frame: `verticals.gym/desktop-light-en.png`. The title starts at about 135 CSS px, while pressing's starts at 40. The right rail begins at 96 px and stops at 805 px, leaving a dead strip below. The "13" badge overlaps the Check-in tile icon.
- **Major · demo member codes on the till surface.** The row "Démo, badges sous la main" shows member codes as chips. Even in a demo, credentials-shaped data should not sit on a cashier surface. **A 10:** the demo hint lives in the code sheet, not on the till.
- **Major · placeholder contrast.** The "ex. …" member-code placeholder is a letter-spaced monospace at about 30 px, measuring 2.47:1 on #121212.
- **Polish · monospace on a non-code.** JetBrains Mono is reserved for codes; a placeholder example is not one.

### verticals.boutique / verticals.maison
- **Major · identical numbers for two different stores.** Frames: `verticals.boutique/desktop-light-en.png` and `verticals.maison/desktop-light-en.png`. Both headers read "Mon 12 Oct · 5 sales · 5 550 MAD today", and both carts show "Sale · 1208". Source: `pos-boutique.js:643` and `pos-maison.js:778` both use `saleSeq = IS_DEMO ? 1208 : 1000`, and maison is a fork. **A 10:** each demo store has its own seed and ticket range.
- **Polish · only translated verticals.** These two are fully translated ("Attach a customer · Phone first, points and size follow"), which makes the other 15 look broken by comparison.

### verticals.boulangerie
- **Major · half-translated pair.** Frame: `verticals.boulangerie/desktop-light-en.png`. "The sale is empty." is followed by "Touchez khobz, msemen ou croissant, la vente part en deux gestes."
- **Major · quantity chips too small.** "×2 ×6 ×12" chips are about 38×29 CSS px. **A 10:** at least 44×44 pt, ideally a 3-segment control under the tile.

### verticals.hotel
- **Major · inconsistent emphasis.** Frame: `verticals.hotel/desktop-light-en.png`. Of three arrival cards, one "Check-in" is filled and two are outlined, with no visible rule for why. "Check-out · 1659 MAD" is filled in danger red, which reads as destructive for a revenue action. **A 10:** one primary style, with a red "en retard" badge carrying the urgency.
- **Polish · time format.** "15h30", "20h52" here; "14:00", "20:51" elsewhere.

### verticals.traiteur
- **Major · iPhone banner squeeze.** Frame: `verticals.traiteur/iphone-light-en.png`. The "2 échéances à encaisser…" text wraps to one or two words per line beside two buttons. **A 10:** the buttons stack under the text.

### verticals.epicerie
- **Major · iPhone has no page title.** Frame: `verticals.epicerie/iphone-light-en.png`. The page opens on a scan field that shows a stray empty box plus "Enter", with "Scanner (démo)" next to it. **A 10:** the same header as other verticals, and one scan field.

### verticals.pharmacie
- **Major · iPad tile text wraps one word per line.** Frame: `verticals.pharmacie/ipad-light-en.png`. In the 3-column product grid, drug names and dosage stack one word per line ("Dolipr/ane 1000/mg"). **A 10:** 2 columns at that width, with name and dosage on 2 lines.

### All verticals (iPad)
- **Major · "Delete my account" in the till sidebar.** Frame: `verticals.fleuriste/ipad-light-en.png` (bottom of the rail; the same in all 17 iPad frames). A red destructive row sits 2 rows under "Lock", one mis-tap away from a cashier's thumb. Source not located in the vertical files; it is likely the host menu. **A 10:** account deletion lives in owner settings, never on the till.

### All verticals (rail)
- **Polish · "Operations" item inset.** It sits 14 px narrower and further right than "Customers" in every desktop frame. Source: `assets/pos-workspaces.css:2` `.twpos-launch{width:calc(100% - 20px);margin:8px 10px}`.

## 5. Systemic patterns
1. **No i18n layer in the verticals.** None of the 15 non-boutique `pos-*.js` files (or `pressing-caisse.js`) contains `data-i18n` or a translation call. `caisse-lang.js` matches whole French strings, so any rewording silently leaks French. Every EN frame in the cluster shows French titles: "Comptoir", "Vente rapide", "Composer un bouquet", "Réception", "Planning du jour", "Événements", "Comptoir de dépôt", "La carte", "File & rendez-vous".
2. **17 private icon sets.** Every vertical defines `const art = (inner) => <svg viewBox="0 0 64 64">`, at for example `pos-boulangerie.js:86`, `pos-gym.js:67`, `pos-spa.js:76`, `pos-hotel.js:73` and `pressing-caisse.js:272`. Each is hand-drawn with its own stroke classes, which violates the Material-only rule.
3. **No dark mode in vertical CSS.** Zero `prefers-color-scheme` / `data-theme` rules in any `pos-*.css` or `pressing-caisse.css`. Dark depends on token remaps, and every raw rgba or white image escapes them (spa columns, pressing photos).
4. **No shared type scale.** Distinct font sizes per file range from 18 (boulangerie, pizzeria) to 27 (gym), and 578 declarations sit at 9 to 11 px.
5. **No shared till anatomy.**
   - The cart panel is called Sale, Order, Bouquet, Panier or Comptoir.
   - The primary button is Take payment, Cash/Card, Valider la vente, Send to kitchen, Confirm · étiquettes & ticket, Confirm · ticket & livraison, or Valider l'entrée.
   - "Scan continu" floats over content in only 6 verticals.
   - The liquid lens is used in 13 and missing in librairie, epicerie, fleuriste and autre.
6. **Phones were not designed.** The desktop two-pane layout is compressed rather than recomposed. Planning grids (spa, coiffure) and side carts (librairie) break outright.
7. **Demo realism at the expense of honesty.** Frozen clocks, forked seed data shared between stores, and demo codes on the cashier surface.

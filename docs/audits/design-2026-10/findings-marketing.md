# Design audit 2026-10 · cluster `marketing` · round 1

Critic: fresh Opus, evidence only (18 EN frames: iPhone 440, iPad 1032, desktop
1440; light and dark). Frames: `/Users/zaka/Developer/kiwi-design-audit/shots/marketing.*`.
The landing paints black in both themes; the guides hub is identical across
themes; the article differs only in a header band. Landing source is a compiled
Next.js export (`en/index.html`, one 525 KB line; CSS in
`_next/static/chunks/1d07ha593kf43.css`), so its fixes cannot be made or
reviewed in this repo. Guides CSS: `assets/articles/article.css`.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 4 | About 35 type sizes, 12 letter-spacing values, 14 corner radii on the landing. Body text weight 200 with line height equal to font size. Black gaps of 300 to 590 px between sections. |
| UI | 4 | Primary button is black on a black page. Two icon sets mixed. Kiwi IQ demo panel empty. iPad layouts overflow. Guides have no menu on phones. |
| UX | 5 | Eight button labels for two actions. First guide is three screens down on iPhone. Phone tables hide the cost column. |
| Motion | 0 | Unverified: needs recordings. |
| Feel and haptics | 0 | Unverified. |
| Copy and language | 5 | "Eighteen trades" vs "Two trades"; "23 languages" vs "French, Arabic and English"; one number printed two ways. |
| Accessibility | 3 | Hero subtitle 1.93:1 over particles; dashboard sublabels about 1.8:1; guides have no dark mode. |
| Honesty and consistency | 4 | Claims "end-to-end encryption" (it is not); Ultra tier (1 499 MAD) missing; "Custom" vs the owner's "Ultimate"; one anonymous testimonial. |
| Performance | 0 | Unverified. The landing loads about 2.3 MB of HTML, JS and CSS before the 3D model. |

## 2. Verdict

**FAIL.** Three dimensions unverified; Accessibility and Honesty carry
blocker-class findings.

## 3. The five changes that move the scores most

1. Rebuild landing type on 7 sizes, looser display tracking (-0.025em), body at
   17 to 18 px, weight 400, line height 1.45.
2. One filled mint "Start free" primary and one quiet "Book a demo" secondary,
   with the same labels everywhere.
3. Fix the false or conflicting facts in one pass: encryption wording, the four
   pricing tiers, trade and language counts, real named testimonials.
4. Fix iPad and iPhone breakage: clipped hero dashboard, "23 languages"
   overflow, wrapping prices, unreadable phone dashboard, no menu or language
   switch on guides, hidden table columns.
5. One steady section spacing; give Kiwi IQ a visible first exchange; dark mode
   for the guides.

## 4. Findings

### Landing

- **L1 · blocker · Hero subtitle unreadable over particles.**
  `marketing.landing/desktop-dark-en.png` y 380 to 420. `#ECECEC` on particle
  green `#7FB898` = 1.93:1. A 10: solid backing or particles stop 40 px above;
  at least 4.5:1.
- **L2 · blocker · Primary button invisible.** "Get Kiwi" (hero) and "Start my
  15 days" (final CTA) use `bg-black` on a `#000` page; the white secondary
  pill outranks them. Source: `en/index.html`, class `bg-black … hover:bg-black/80`.
  A 10: filled accent primary, outline secondary.
- **L3 · major · No type system.** 28 arbitrary px sizes (7 to 64) plus 7
  Tailwind sizes; 12 letter-spacing values, -0.06em on 44 headings so letters
  touch; 14 radii. A 10: 7 sizes, display -0.025em, body 0, 3 radius tokens.
- **L4 · major · Body text crammed and too thin.**
  `text-[20px] leading-[20px] font-extralight` used 78 times; "What landed" uses
  26 px leading instead (two body styles); on iPad descenders touch the next
  line. A 10: one body style, 17 to 18 px, 400, 1.45.
- **L5 · major · Kiwi IQ demo empty.** Desktop y 4475 to 4830, also iPhone and
  iPad: a 480 × 355 panel with a header and two dividers; a stray green
  rectangle top-left. A 10: a real question and answer visible before any
  animation.
- **L6 · major · Empty black gaps.** Desktop: 400 px (trade chips to logos),
  336 (logos to floor plan), 590 (feature list to "Your numbers stay yours."),
  300 (testimonial to stat cards), 220 (WhatsApp link to footer); about 700 px
  empty under "What landed on Kiwi since the summer." A 10: one spacing, about
  160 px desktop, 96 px phone.
- **L7 · major · iPad hero dashboard clipped both edges.** Sidebar and
  "Generate report" cut; account name truncated to "You…".
- **L8 · major · iPhone hero dashboard unreadable.** Desktop dashboard scaled to
  0.26×, text about 3 to 4 px. Use a phone screenshot.
- **L9 · major · iPad overflows.** "23 languages" overflows its card; "199
  MAD/month" and "399 MAD/month" wrap.
- **L10 · major · Pricing cards break the margin.** Cards end at x 1438 of 1440:
  2 px right margin against 40 px left.
- **L11 · major · Two icon sets.** 38 Lucide stroke icons (arrow-up-right ×12,
  lock, tablet, chef-hat, printer, credit-card, scan-barcode, archive,
  layout-dashboard, menu, sparkles) beside 53 Material Symbols; 19 stroke
  widths. Breaks CLAUDE.md §4.
- **L12 · major · False encryption claim.** Subtitle "End-to-end encryption";
  the card below says "Encrypted in transit and at rest". Kiwi IQ reads figures
  server-side, which E2E would rule out.
- **L13 · major · Pricing does not match the owner's tiers.** Shows Basic, Pro,
  Custom. Ultra (1 499 MAD) missing ("1,499" nowhere in the HTML); CLAUDE.md §7
  names the fourth tier "Ultimate". Custom lists Ultra's features without its
  price.
- **L14 · major · The page contradicts itself.** "Eighteen trades" vs "Two
  trades, one till"; "23 languages" vs "French, Arabic and English" vs "French
  and Arabic"; three wordings of where Kiwi is built.
- **L15 · major · Thin proof.** One quote signed "Yassine", no surname or
  business; footer lists both "Customers" and "Testimonials"; four customer
  logos in four colour treatments on glossy tiles.
- **L16 · polish ·** Feature card 1 icon and title 10 px lower than cards 2 and 3.
- **L17 · polish ·** Stat card "1 code" numeral 10 px lower, subtitle 20 px lower.
- **L18 · polish ·** Security cards offset 28 px per row (parallax entrance that
  never settled during capture?).
- **L19 · major · Low-contrast small text.** KPI "vs … yesterday" 1.77:1; "MAD
  this month" 1.79:1; "Share of monthly goal reached · 30 days" 1.76:1;
  order-thread sublabels 3.71:1; footer credit 3.0:1; 12 px pricing note
  4.49:1. Ten white opacities used for text; `text-white/40` is 3.66:1 on black.
- **L20 · polish ·** Hero light beam washes out the KPI cards.
- **L21 · polish ·** Middle dot used as a sentence dash ("Till, stock, team…",
  testimonial). Keep it for metadata.
- **L22 · polish ·** "27,632" in the hero vs "27 632" in "Six more, live".
- **L23 · polish ·** Eight labels for two actions: Get Kiwi, See what it does,
  Book a demo, See a demo, Try Kiwi IQ, Start my 15 days, Contact us, Message
  us on WhatsApp.
- **L24 · polish ·** "Six more, live": dotted pill with a 36 px chevron hides six
  cards. Label it; at least 44 px.
- **L25 · polish ·** Landing always dark, guides always light: dark-mode
  visitors flip between black and paper.
- **L26 · polish ·** Footer email breaks mid-word on iPad ("contact@kiwi-" /
  "os.com").

### Guides hub

- **H1 · major · No dark mode.** `assets/articles/article.css` has no
  `prefers-color-scheme` rule.
- **H2 · major · Phones lose navigation and language switch.**
  `article.css:1420-1421` hides `.nav-center` and `.language-picker` below
  900 px with no replacement.
- **H3 · major · A second marketing design system.** Header, buttons, cards,
  language switch all differ from the landing; no Security link; landing offers
  10+ locales, guides FR/EN/AR.
- **H4 · major ·** First guide card at y ≈ 1480 on iPhone; page 9837 px tall for
  7 guides (stats, search, 14 chips first).
- **H5 · major ·** Two filter systems (7 problem chips, 7 category chips) for 7
  guides; guides repeat up to four times.
- **H6 · major ·** "Nothing is duplicated." above duplicated guides; "Verified
  most recently" puts the oldest first.
- **H7 · polish ·** Orphan last-row cards; guided-path cards of unequal height.
- **H8 · polish ·** Abstract thumbnails carry no information; one pie chart
  edge is jagged.
- **H9 · polish ·** Three filler stat tiles take prime space; date wraps on iPhone.
- **H10 · polish ·** Language pills about 30 px, under 44.

### Guide article

- **A1 · major · Phone tables hide the key column.** Cost and Check off-screen,
  no scroll cue. `article.css:642`, `min-width: 620px` in a 440 px viewport.
- **A2 · major ·** No dark mode (as H1).
- **A3 · polish ·** Numeric columns left-aligned (`article.css:647`,
  `text-align: start`). A 10: right-aligned, tabular figures.
- **A4 · polish ·** "27.3%" in text vs "27.3 %" in the calculator.
- **A5 · polish ·** Eyebrow, byline category and breadcrumb are three labels
  for one category, none matching the title.
- **A6 · polish ·** Byline August 23 vs hub card "Updated August 24".
- **A7 · polish ·** "27% protocol" ring on a related card matches nothing in
  that guide.
- **A8 · polish ·** iPhone light frame: header drawn over the title and skip
  link visible; the dark frame is clean, likely a capture artefact. Re-capture.

The article is the best page in the cluster: 720 px text column, 8.86:1 body
contrast, sticky table of contents, worked examples whose arithmetic checks
out, cited official sources.

## 5. Systemic patterns

1. No shared marketing component library: landing and guides each build their
   own header, buttons, cards, language switch.
2. Neither uses `assets/tokens.css`; both are full of one-off values.
3. Contrast set per element, not by token: 1.76:1 to 10.7:1 on one page.
4. Facts change from section to section (trades, languages, encryption, tiers,
   "Nothing is duplicated", "most recent").
5. Layouts break below 1032 px: clipped mockups, overflowing fixed sizes, lost
   navigation, fixed-min-width tables.
6. Each tier forces one theme; the visitor's preference is ignored on both.
7. Content depends on animation: empty or half-transitioned states in a slow
   capture are likely what reduced-motion visitors see (unverified until a
   reduced-motion capture exists).

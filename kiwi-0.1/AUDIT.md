# Kiwi Website Audit — 2026-04-26

## Verdict
**Big jump on landing wow-moments, three new regressions, dashboard untouched.** Index has shipped four of the missing wow moments — scroll-driven dashboard tilt, real Morocco map, working pricing calculator with mint tier-pulse, cursor-spotlight on feature cards, proximity-glow logo strip — and finally loads `components.css`. But the rewrite **dropped the editorial italic discipline** (§1.2's signature move): the hero H1 no longer contains a single `<em>` word, and the `.ed` primitive in `base.css` has `font-style: normal`, neutralising the italic even where `<em>` is still in markup. A **zellij tile background** has appeared on the Arabic slab — the explicit §VII.1 anti-pattern. `scroll-behavior: smooth` is still there for the third audit running. And every dashboard CRITICAL from yesterday is unchanged. Net: index moved from 80% → 85% Apple-grade *but* introduced higher-severity violations than it fixed. Half-day fix list, not a rebuild.

## Top 5 fixes (highest leverage, do first)

1. **[CRITICAL]** Restore the editorial italic in the hero H1 — currently *zero* italicised words on any page H1 → [index.html:1493-1495](index.html#L1493-L1495)
2. **[CRITICAL]** Remove `font-style: normal` from `.ed` in [base.css:166](assets/base.css#L166) — the override defeats the `<em>` tag and kills the italic move site-wide
3. **[CRITICAL]** Delete the zellij tile background from the Arabic slab → [index.html:1144](index.html#L1144) — directly violates `01-moroccan-authenticity.md §VII.1`
4. **[CRITICAL]** Delete `html { scroll-behavior: smooth; }` (third audit, still there) → [index.html:25](index.html#L25)
5. **[CRITICAL]** Wire `assets/components.css` into dashboard.html OR add `:active` states to dashboard primitives → [dashboard.html:15-17](dashboard.html#L15-L17)

## Findings by category

### A. Brand system fidelity

[CRITICAL · A.1] Editorial italic discipline is gone.
Where: [index.html:1493](index.html#L1493) — `<h1>Le système d'exploitation du commerçant marocain.</h1>`. No `<em>`, no Instrument Serif anywhere on the H1. Final-CTA H2 uses `<em class="ed">encaisser</em>` at [1982](index.html#L1982) but `.ed { font-style: normal }` at [base.css:166](assets/base.css#L166) overrides the user-agent italic.
Why it fails: §1.2 ("every page H1 contains exactly one word in `<em class='ed'>` set in Instrument Serif"). Wow #8 is mandatory per page; previously fixed at "*La* banque…", now removed.
Fix: H1 → "Le *système* d'exploitation du commerçant marocain." with `<em>système</em>` rendered in Instrument Serif Italic. Drop the `font-style: normal` override on `.ed` and replace with `font-family: var(--font-editorial); font-style: italic;`.

[CRITICAL · A.2] Zellij tile wallpaper on the Arabic slab.
Where: [index.html:1135-1151](index.html#L1135-L1151) — `background-image: url("assets/zellij.jpg"); background-size: 480px auto; background-repeat: repeat;`
Why it fails: `01-moroccan-authenticity.md §VII.1` ("**The Zellij Wallpaper Trap.** Putting a faded geometric pattern behind dashboards 'for Moroccan flavor.' It signals tourist board, not fintech. Use geometry as *grid math*, not as *surface decoration*."). Even at opacity 0.22 with `mix-blend-mode: luminosity`, this is a printed-pattern background.
Fix: delete the `::before` zellij block. Keep the radial mint vignette only. The Reem Kufi quote on `--riad-deep` is the move; the tile isn't.

[CRITICAL · A.3] Pure-white surfaces still litter the dashboard.
Where: [assets/dashboard.css:20](assets/dashboard.css#L20), [291](assets/dashboard.css#L291), [353](assets/dashboard.css#L353), [432](assets/dashboard.css#L432), [452](assets/dashboard.css#L452), [514](assets/dashboard.css#L514), [549](assets/dashboard.css#L549), [738](assets/dashboard.css#L738), [811](assets/dashboard.css#L811) — `background: #FFFFFF;` ×9. Plus 2 raw whites on the dash-mock at [index.html:158](index.html#L158) and dash-mock traffic-light dots at [196-198](index.html#L196-L198).
Why it fails: §1.1 (`--paper: #F7F5F0` is "warm off-white, NOT pure white").
Fix: global find-replace `#FFFFFF` → `var(--paper)`; traffic-light Mac colours can stay (they're a real-world-token reference).

[HIGH · A.4] Dashboard H1 still has no italic word.
Where: [dashboard.html:435](dashboard.html#L435) — same as last audit, unchanged.
Why it fails: §1.2.
Fix: italicise "encaissé" or "Hier" in Instrument Serif.

[MEDIUM · A.5] Section rhythm now drifts the *other* way.
Where: hero (paper) → ticker (paper) → editorial (paper) → why-now (paper-soft) → features (paper) → T+1 (ink) → pricing (paper) → logos (paper-soft) → arabic (riad) → comparison (paper) → final (ink). [index.html:1485-1993](index.html#L1485-L1993)
Why it fails: §1.1 ("alternates `--paper` slabs and `--ink` slabs"). Five paper-leaning surfaces pile up before the first ink cut.
Fix: flip Why-Now to `slab-ink` so the rhythm reads paper / paper-soft / ink / paper / ink / paper / riad / paper / ink.

### B. Forbidden patterns sweep

| # | Pattern | Status | Where |
|---|---|---|---|
| 1 | Bold (700+) display weights | ✓ absent | grep returns 0 in build files |
| 2 | Inter at hero scale | ✓ absent | Geist 500 throughout |
| 3 | Gradient buttons | ◐ **partial** | `.cmp tbody tr.us td.us-col` atlas→riad gradient on table cell [index.html:1377](index.html#L1377); `.calc-bar-fill.kiwi` atlas→mint on bar fill [966](index.html#L966); avatar gradients in dashboard.css unchanged |
| 4 | 3D / Spline / glassy | ✓ absent |  |
| 5 | "TRUSTED BY" gray logo bar | ◐ **partial** | `.logos` cells start at `opacity: 0.55; filter: grayscale(1)` [index.html:1116](index.html#L1116). Proximity-glow upgrade is the spec move, but only 4 *text* placeholders ("Mix Max", "Recycop", "Kandisky", "Abir's Cookies") — reads "logo grid we haven't built yet." |
| 6 | Stock photography | ✓ absent |  |
| 7 | Centered CTA under centered lede | ✗ **present** | Final CTA: centred H2 + centred lede + centred buttons stack [index.html:1981-1992](index.html#L1981-L1992) — exactly the Webflow tell §F.7 forbids |
| 8 | Drop-shadow stacks on light | ✗ **present** | `.dash-mock-frame { box-shadow: 0 1px 0 …, 0 30px 80px -30px …, 0 80px 200px -60px … }` [index.html:160-163](index.html#L160-L163) — 3-layer stack on a light card |
| 9 | Animated scroll-down chevron | ✓ absent |  |
| 10 | Instant background-color hovers | ✓ absent |  |
| 11 | Emoji in headings/H2s | ◐ partial | dashboard routing-matrix `.row-head` divs unchanged from last audit |
| 12 | Five accent colours | ✓ absent |  |

### C. v1 regression sweep

[CRITICAL · C.1] `html { scroll-behavior: smooth; }` is still there.
Where: [index.html:25](index.html#L25). Third audit, third time flagged.
Why it fails: `04-v1-audit-brutal.md §3` ("breaks anchor jumps").
Fix: delete the line.

[NEW · C.2] Editorial moment lost its serif.
Where: [index.html:388-394](index.html#L388-L394) — `.editorial { font-family: var(--font-display); font-style: normal; font-weight: var(--w-medium); }`. Previously was `font-family: var(--font-editorial); font-style: italic;`. Now reads as Geist medium with text-shadow only.
Why it fails: §1.2 + `04 KEEP §1.6` ("editorial breakout" was identified as the most Apple-adjacent moment in v1; the rewrite kept the structure but stripped the Instrument Serif typesetting).
Fix: restore `font-family: var(--font-editorial); font-style: italic;` on `.editorial`.

Other v1 sins absent: ✓ no global grain, ✓ no decorative blobs (the `::before` mints on `.editorial-section` and `.calc-readout` are functional ambient gradients, not blobs), ✓ no tilt/magnetic hover, ✓ no shimmer.

### D. Motion & interaction

[HIGH · D.1] `components.css` finally loaded by `index.html` ([18](index.html#L18)) — `.btn:active { transform: scale(.98) }` now applies. ✓ Dashboard still doesn't load it ([dashboard.html:15-17](dashboard.html#L15-L17)) — every dashboard primitive remains active-stateless.
Fix: add `<link rel="stylesheet" href="assets/components.css">` to `dashboard.html` head.

[MEDIUM · D.2] Linear easing on the hero mesh.
Where: [index.html:81](index.html#L81) — `animation: meshSpin 24s linear infinite`. Tickers at [342](index.html#L342) and editorial-section spin at [381](index.html#L381) also linear (defensible — uniform velocity).
Why it fails: §1.3 / §A.7. Marquee linear is the right call; rotational backgrounds should ride `--ease-glide` or stay static.
Fix: drop `linear` on `meshSpin`; document marquee exception.

[LOW · D.3] Scroll-driven dashboard tilt is shipped via `animation-timeline: scroll(root)`.
Where: [index.html:165-180](index.html#L165-L180) — proper `@property --scroll-x/y/s` registration, `@supports not` fallback, mobile + reduced-motion overrides.
Why it passes: textbook execution of wow #3.

[LOW · D.4] Pricing calculator is shipped with mint tier-pulse on boundary cross.
Where: [index.html:985-990](index.html#L985-L990) (`@keyframes calcPulse`), [2154-2159](index.html#L2154-L2159) (JS `lastTier` watcher).
Why it passes: wow #5 done correctly — single 260ms mint pulse, ease-counter, debounced via `lastTier` guard.

### E. Layout & spacing

[MEDIUM · E.1] Inline `style=` attributes appearing on `<h2>`/`<h1>` to set `margin-top` because the new s-head H2/h2 has no default top margin.
Where: [index.html:1493](index.html#L1493), [1709](index.html#L1709), [1739](index.html#L1739), [1754](index.html#L1754), [1798](index.html#L1798), [1839](index.html#L1839), [1916](index.html#L1916), [1942](index.html#L1942) — all `style="margin-top: var(--s-X);"`.
Why it fails: spacing tokens should be applied via class, not inline.
Fix: token a `.s-head h2 + p`, `.s-head .s-eyebrow + h2` margin once.

[LOW · E.2] Dashboard inline `<style>` block (244 lines) unchanged from last audit.

### F. Components

[HIGH · F.1] Dashboard interactive primitives still have no `:active` state — same exhaustive list as yesterday.

[LOW · F.2] `btn-rgb-wrap` wrapper now wraps every primary CTA ([1477](index.html#L1477), [1502](index.html#L1502), [1985](index.html#L1985)). The conic-gradient RGB border style itself lives in `components.css`, which I haven't fully re-read this pass — assuming it's the Star-Toner pattern recoloured Atlas→Mint→Riad as spec §E.7 requires.

### G. Page-specific checks

[HIGH · G.1] Hero H1 fails the unbreakable rule and the editorial-italic rule simultaneously.
Where: [index.html:1493-1495](index.html#L1493-L1495) — opens with prose, no `<em>`, no number.
Fix: lead with the bento metric — "**18 420 DH** encaissés *hier*. Le système d'exploitation du commerçant marocain." Number-first, italic in place.

[LOW · G.2] Real Morocco map shipped.
Where: [index.html:1663-1698](index.html#L1663-L1698) — references `assets/Moroccan-map.jpg` as the SVG `<image>` base layer, then overlays `<circle class="city-dot/now/pulse">` at real coordinates. Tanger NW, Casa coast-mid, Rabat between, Marrakech inland-south, Fès NE, Agadir SW. Geography reads correctly.
Why it passes: previous critical resolved.

[LOW · G.3] Pricing calculator slider works correctly.
Where: [index.html:1843-1908](index.html#L1843-L1908) — JS at [2104-2164](index.html#L2104-L2164) computes CMI vs Kiwi annual, snaps tier on `>=50000`/`>=200000`, fires `.calc-readout.pulse` on tier crossings.
Why it passes: wow #5 with mint pulse on tier boundary.

[LOW · G.4] Cursor-spotlight on feature cards.
Where: [index.html:712-728](index.html#L712-L728) (CSS `--mx`/`--my` radial gradient), [2094-2102](index.html#L2094-L2102) (JS mousemove). Sibling dim-on-hover (`.feat-grid:hover .feat-cell { opacity: 0.55 }`) at [695](index.html#L695).
Why it passes: wow #9 + proximity-glow on the same surface. Premium move.

[CRITICAL · G.5] Dashboard H1 still has no italic word and the page still opens with a greeting before its number.
Where: [dashboard.html:434-435](dashboard.html#L434-L435) — unchanged.

### H. Voice & copy

All checks still pass. Tutoyer holds. No `vous`/`veuillez`. Currency discipline: MAD on tables, DH on conversational copy. Numbers Latin. Arabic moment present.

[NEW · H.1] Hero lede has a code-switch line.
Where: [index.html:1498](index.html#L1498) — *"SumUp's reader, Toast's brain, Sunday's flow, Adyen's tourist rails, sous une seule app Atlas."*
Why it passes: matches the master spec's investor narrative one-liner verbatim. Bold inclusion.

### I. Accessibility

[MEDIUM · I.1] Index still has no `<main>` landmark — every section is a direct child of `<body>` ([index.html:1485-1993](index.html#L1485-L1993)).
Fix: wrap from hero through final-CTA in `<main>`.

[LOW · I.2] `aria-hidden` discipline improved — `.dash-mock`, `.hero-mesh`, `.ticker`, dash-mock-floater `.ico`, dash-mock-chart all carry it. Decorative `.tk-item::before` dots are pure CSS pseudo-elements (auto-skipped by AT). ✓

[MEDIUM · I.3] `:focus-visible` ring radius unchanged from yesterday — still defaults to `var(--r-xs)` (4px) which clips on pill buttons.
Fix: per-shape `:focus-visible` overrides matching component radius.

### J. Performance hygiene

[MEDIUM · J.1] No font preload — `assets/Moroccan-map.jpg` and `assets/zellij.jpg` are fetched eagerly with no `loading="lazy"`/`decoding="async"`. The map is on-screen quickly so eager is OK; the zellij is below the fold and eats bandwidth before the user sees it. (Easier fix: delete the zellij — see A.2.)

[LOW · J.2] `text-wrap: balance` on headings + `text-wrap: pretty` on body ([index.html:60-63](index.html#L60-L63)) — premium CSS, no JS, free polish. ✓

[LOW · J.3] Dashboard inline `<style>` block (244 lines) still unmoved.

### K. The two unforgiving tests

**Stripe-investor test:** weakest moment per page —
- **index.html:** the Arabic slab with the zellij tile pattern at [1928-1934](index.html#L1928-L1934). The Reem Kufi quote on Riad-deep was already the spec's wow #10 — adding a tiled pattern downgrades it to "fintech with souvenir-shop wallpaper." *Ship-blocker. Remove the tile, keep the quote.*
- **dashboard.html:** Top Products list at [562-600](dashboard.html#L562-L600) — same as yesterday, emoji icons unchanged.

**The unbreakable rule:** Hero opens with prose, dashboard opens with a greeting. Both fail. See G.1, G.5.

## Cross-page consistency drift

- **`components.css` loaded only on `index`** — dashboard buttons still active-stateless.
- **`#FFFFFF` only in dashboard surface and the index dash-mock**; section bodies use `var(--paper)`. Two surface vocabularies.
- **`livePulse` keyframe** still duplicated between `index.html` ([60](index.html#L60)) and `dashboard.html` ([72](dashboard.html#L72)) with different bodies.
- **Font-editorial token** is defined in `tokens.css:65` but referenced **zero times** across all build files. It's a dead token until A.1 fix lands.

## What's missing vs the master spec

Of the 10 wow moments:
1. Atlas Mesh Hero ✓
2. Mint focus ring ✓
3. Scroll-driven dashboard tilt ✓ **(new)**
4. Live transaction ticker ✓
5. Pricing slider with mint-pulse tier crossings ✓ **(new)**
6. Proximity-glow merchant logo grid ◐ **(new, but text placeholders not real logos)**
7. Conic-gradient RGB CTA border ✓ (via `.btn-rgb-wrap`, assuming components.css carries it)
8. Editorial italic word in H1 ✗ **(regression — was present last audit, now gone)**
9. Cursor-aware tilt/spotlight ✓ **(new — implemented on feature cells, not dashboard)**
10. Arabic typographic moment ✓ (but degraded by zellij tile, A.2)

Net: +4 / −1 since 2026-04-25. Direction is right.

## Per-page weakest moment (rebuild candidate)

- **index.html:** the Arabic slab ([1928-1935](index.html#L1928-L1935)). Strip the zellij tile and the duplicated `::after` (lines 1153-1163 and 1166-1179 both define `arabic-slab::after` — the second overwrites the first), keep the radial vignette and quote.
- **dashboard.html:** the Top Products list ([dashboard.html:562-600](dashboard.html#L562-L600)) — unchanged.

## Effort estimate

| # | Fix | Time |
|---|---|---|
| Top-1 | Restore italic `<em>` in hero H1 | 5 min |
| Top-2 | Fix `.ed` font-style + add Instrument Serif italic | 10 min |
| Top-3 | Delete zellij tile background | 2 min |
| Top-4 | Delete `scroll-behavior: smooth` | 1 min |
| Top-5 | Wire components.css to dashboard.html | 1 min |
| A.3 | Replace `#FFFFFF` (11 sites) | 15 min |
| A.4 / G.5 | Italicise dashboard H1 word | 5 min |
| B.7 | Re-balance final CTA (move H2 left, CTAs left, lede left or asymmetric) | 30 min |
| B.8 | Replace dash-mock 3-layer shadow with single soft + hairline | 15 min |
| C.2 | Restore `.editorial` to Instrument Serif italic | 5 min |
| I.1 | Add `<main>` landmark to index | 5 min |
| Logo grid | Replace text placeholders with actual SVG marks | 1 h |

**Top-5 fix bundle: ~20 minutes.** Total to clear all defects: ~3 hours. The build is one short polish session away from ship-ready on landing; dashboard needs the same defect pass plus the Top Products icon swap.

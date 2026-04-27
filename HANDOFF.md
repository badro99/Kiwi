# Kiwi — Agent Handoff Document

**Last updated:** 2026-04-24
**Location:** `/Users/zaka/Desktop/Gemma/kiwi/` (mirror at `/tmp/kiwi-preview/`)
**Status:** High-fidelity interactive prototype. Not production code. Demo-ready for investor + client meetings.
**Founders:** Badr-Eddin Bakkioui (CEO) & Zakariae Attahiri (CTO · COO) · `invest@kiwi.ma` · Tanger

---

## 0. What Kiwi is

A Moroccan fintech super-app, POS-first. Phase 1 = **pure SaaS subscription for restaurants, cafés and retail**: Kiwi Basic at **399 MAD/month** and Kiwi Pro at **699 MAD/month**, with the hardware (PAX A920, KDS tablet, Kiwi Tap SoftPOS on the merchant's Android) **loaned for free** for the duration of the subscription. T+1 settlement, zero rental, zero commitment, WhatsApp-native support. Phase 2 = **Kiwi Pay** (own Payment Institution license, SoftPOS on server phones, low merchant margins) + Kiwi Banking. Phase 3 = Kiwi Investing (fractional AMMC, halal filter).

Brand positioning: *"Le système d'exploitation du commerçant marocain."* Aesthetic = Mercury / Ramp / Stripe tier, but with Moroccan-specific cultural intelligence (Darija-Arabizi in the voice, Zakat/Sadaqa as native features, Friday/Ramadan rhythms, diaspora France↔Morocco corridor as a defensible wedge).

**Revenue phases represented in the prototype:**
1. Phase 1 — Kiwi Basic SaaS · 399 MAD/month (caisse resto, plan de salle, KDS, staff PIN, règlement T+1)
2. Phase 1 — Kiwi Pro SaaS · 699 MAD/month (multi-terminal, routing par sous-catégorie, stock, API, staff illimité)
3. Phase 2 — Kiwi Pay (acquiring under own PE license, servers accept on their own Android, low MDR to merchants)
4. Phase 2 — Kiwi Banking · Kiwi Compte IBAN + debit card + Murabaha lending
5. Phase 3 — Kiwi Investing · fractional AMMC funds, halal filter, CSE + ETFs
6. Cross-cutting — remote Payment Links, Zakat calculator + Sadaqa round-up, diaspora FX corridor (France ↔ Maroc)

Hardware is a Kiwi CapEx line — **never a revenue line**. The distribution moat is that merchants switch from CMI without upfront cost.

---

## 1. Tech stack (deliberately boring)

- **Vanilla HTML + CSS + JS.** No React, no build step, no framework, no bundler.
- **Serves from a Python `http.server`** (sandboxed copy at `/tmp/kiwi-preview/`).
- **Fonts:** Google Fonts — Inter Tight, Instrument Serif, IBM Plex Sans Arabic, JetBrains Mono.
- **No backend.** All interactions are mocked client-side via toasts, modals, and drawers.
- **localStorage** for persistence (lang, theme, mode).

The choice of vanilla was intentional: the prototype must be demonstrable by anyone, anywhere, without toolchain. Any agent inheriting this project should resist the urge to "migrate to Next.js" — the vanilla decision is deliberate and durable until the first real backend lands.

---

## 2. File structure

```
kiwi/
├── index.html          Landing page (marketing site) · primary investor/client entry point
├── dashboard.html      Merchant dashboard · has Simple Mode (default) + Pro Mode
├── wallet.html         Consumer Kiwi Wallet (phone mockups + features)
├── brand.html          Design system + brand guidelines
├── pitch.html          12-slide investor pitch deck
├── HANDOFF.md          ← this file
├── _serve.py           Python preview server (unused in prod; dev only)
└── assets/
    ├── logo.svg        Wordmark (atlas green)
    ├── logo-white.svg  Inverse wordmark
    ├── mark.svg        Rounded-square "k" app icon
    ├── favicon.svg     16-64 favicon
    │
    ├── tokens.css      ★ Design system tokens: colors, typography, spacing, buttons
    ├── theme.css       Dark-mode overrides (kept for future; UI toggle is removed)
    ├── polish.css      Grain, scroll reveals, 3D card tilts, marquee, editorial block
    ├── premium.css     Pill nav scroll-morph, gradient mesh hero, proof stats, dark break, glossary
    ├── simple.css      Simple Mode (merchant dashboard · senior-friendly layer)
    ├── ux.css          Interactive pricing calc · map tooltips · shortcuts overlay · ripple
    │
    ├── interactive.js  ★ Core interaction layer: toast, modal, drawer, command palette, handlers
    ├── features.js     Feature handlers: payment links, Zakat, Sadaqa, Ramadan, Kiwi Compte,
    │                   Capital, Diaspora FX, Loyalty, AI Agent Mode
    ├── pages.js        Dashboard sidebar destinations: Transactions, Terminaux, Règlements,
    │                   Conformité, Équipe, Tables, Menu, KDS, Stock ingrédients
    ├── i18n.js         ★ FR/EN/AR translation layer (setLang, captured-originals pattern)
    ├── simple.js       Simple Mode runtime (3 tabs: Lyoum · Flousi · 3awn)
    ├── polish.js       Scroll reveals, count-up animations, live tx feed, live clock
    ├── premium.js      Pill nav scroll tracker, rotating verb carousel, map ping rings
    └── ux.js           Pricing calculator, hero parallax, map tooltips, shortcuts overlay,
                        button ripple, Simple-mode live timestamp
```

**★ files are load-bearing.** The rest are optional enhancement layers.

---

## 3. How to run

```bash
# Option A — Python (what we use)
cd /Users/zaka/Desktop/Gemma/kiwi && python3 _serve.py
# then open http://localhost:4321/index.html

# Option B — any static server
python3 -m http.server 4321 --directory /Users/zaka/Desktop/Gemma/kiwi
# or: npx serve kiwi · or: caddy file-server

# Option C — just open the files directly
# open -a Safari /Users/zaka/Desktop/Gemma/kiwi/index.html
# (works for index/wallet/brand/pitch; dashboard needs a server for the i18n module path)
```

**The sandboxed preview copy at `/tmp/kiwi-preview/` is served on port 4321** by a launched Python server (see `.claude/launch.json` one directory up). Keep the two directories in sync: any edit in `kiwi/` must be copied to `/tmp/kiwi-preview/` before the browser preview reflects it.

```bash
# Sync pattern:
cp /Users/zaka/Desktop/Gemma/kiwi/<file> /tmp/kiwi-preview/
cp /Users/zaka/Desktop/Gemma/kiwi/assets/<file> /tmp/kiwi-preview/assets/
```

---

## 4. Brand system (locked, do not redesign)

**Colors** (defined in `assets/tokens.css`):
- Primary: `#0B6E4F` — Atlas Green
- Deep:    `#053B2C` — Riad
- Accent:  `#7DF2B0` — Mint (use ≤5% of surface area)
- Paper:   `#F7F5F0` — warm bone (never pure white for backgrounds)
- Ink:     `#0A0F0D` — warm near-black
- Full neutral ramp `--n-50` through `--n-800`
- Semantic: `--success #1FB574`, `--warning #D99A2B`, `--danger #C94A3A`, `--info #3A6FB8`

**Typography:**
- Display + body: **Inter Tight** (Medium 500 for headlines — never Bold)
- Editorial italic: **Instrument Serif** (use for 1 word per headline, not more)
- Arabic: **IBM Plex Sans Arabic**
- Monospace: **JetBrains Mono** (tabular numbers)

**Logo:** lowercase wordmark "kiwi" + mint-dot accent. No fruit imagery. Ever.

**Voice:** Direct, Moroccan, adult. Darija-Arabizi for emotional CTAs (*flousak kayji ghda sbah*), French for descriptive copy. Never formal French. No emoji in headlines. No orientalist clichés.

**Locked don'ts** (every agent inheriting must respect):
- No emoji in section titles or CTAs
- No stock photography (when real photos are added, shoot original Moroccan merchants)
- No gradient backgrounds behind hero copy (gradients only inside product-UI indicators)
- No Bold weights on display text
- No multiple accent colors in the same viewport
- No tagine / lantern / camel / souk iconography
- No pure white `#fff` — use `var(--paper)` which is `#F7F5F0`

---

## 5. Key architectural decisions

### 5.1 Language system (`assets/i18n.js`)

The **captured-originals pattern**: on page load, we walk every `[data-i18n]` element and store its FR content in memory under its key. When switching to EN or AR, we swap innerHTML from the `T[lang][key]` dictionary. Switching back to FR restores from captured originals — so FR translations don't need to exist in the dictionary (saves ~40% of the file).

RTL is triggered by `document.documentElement.dir = 'rtl'` on Arabic. Most layout flips naturally (flex, grid, logical properties). For directional arrows in buttons, `theme.css` has `html[dir="rtl"] .btn svg { transform: scaleX(-1); }`.

### 5.2 Mode system (Simple / Pro)

Toggled via `html[data-mode="simple"]` or `"pro"`. Persisted in `localStorage.kiwiMode`. Default = `simple` (per founder direction for accessibility).

In **Simple Mode**, `simple.css` hides `.container` (the Pro dashboard body), `.topbar`, `.sidebar`, `.status-bar`, `.demo-bar`, `.ai-drawer`, `.ramadan-banner`. The `.simple-root` injected by `simple.js` is a 520px-centered column with 3 tabs (Lyoum · Flousi · 3awn). 18px body, 36px amounts, 56px tap targets. Routes simple-action events to the rich Pro-mode handlers (`payment-link`, `new-sale`, `kiwi-compte`) so the same logic is reused.

In **Pro Mode**, simple UI elements are removed from the DOM and the regular dashboard is visible with its sidebar, topbar, live feed, AI drawer, etc.

A big pill toggle lives **fixed top-right** in both modes. Also switchable via `⌘⇧M` keyboard shortcut.

### 5.3 Interaction layer (`assets/interactive.js`)

**Event delegation, not per-element handlers.** One global click listener routes based on:
1. Explicit `[data-action="…"]` with registered handler
2. Range/tab toggles
3. Language switcher
4. Anchor smooth-scroll
5. AI drawer suggestions/close
6. Feed rows / KPI cards / sidebar links / location switcher / profile menu
7. Icon buttons (notifications, settings)
8. Fallback for plain `.btn` classes — **but scoped via `SKIP_FALLBACK_CONTAINERS` and `SKIP_FALLBACK_ATTRS`** so it never fires inside modals, drawers, menus, or on elements with their own handler.

All modals/drawers created via `Kiwi.modal({...})` / `Kiwi.drawer({...})` / `Kiwi.toast(...)`. Fully keyboard-closable via Escape. Click on backdrop closes. First focus does NOT auto-trap (known QA gap — see §7).

### 5.4 Feature handlers (`assets/features.js`)

Each feature is a handler registered on `Kiwi.handlers[name]` and opens a modal or drawer. Handlers are idempotent and self-contained. Registered names:
- `payment-link`, `zakat`, `sadaqa`, `ramadan-toggle`, `kiwi-compte`, `capital`, `diaspora`, `loyalty`, `agent-mode`

Calling `Kiwi.handlers['zakat']()` from anywhere opens the Zakat calculator.

### 5.5 Pages (`assets/pages.js`)

The 10 sidebar destinations on the dashboard. Each one is a full-width drawer with real-looking data tables, cards, or calendars. Handler names are prefixed with `nav-` (e.g., `nav-transactions`, `nav-kds`, `nav-stock`). Wired to sidebar links via `data-nav="transactions"` etc.

### 5.6 UX layer (`assets/ux.js`, shipped latest)

Currently on landing + dashboard:
- Scroll progress bar at top
- Hero mouse-parallax on dashboard mockup (rotateY ±4° / rotateX ±3°)
- Morocco map hover tooltips (city name, merchant count, latest transaction)
- Interactive pricing calculator (slider + tier toggle + persona label + live savings calc)
- Keyboard shortcuts overlay (press `?`)
- Button ripple on `pointerdown`
- Simple Mode live "updated X sec ago" timestamp

---

## 6. Known content (what's actually rendered)

### Landing (`index.html`)
Nav · Hero (with gradient mesh + rotating verb carousel: 9 verbs) · Embedded live dashboard mockup · Marquee ticker · Trust bar · Stats (animated count-up) · 3 product tiles · Feature rows × 3 · Moroccan-restaurant pill section · Morocco merchant map (8 cities, animated pulse-pings) · Editorial break (*"Un pays de 73 305 restaurants…"*) · Monzo-style proof stats (1 847 MAD/mois · 7 min · 2,3M Zakat) · Pricing calculator (interactive) · Static Base vs Pro cards · Testimonials (3 named merchants) · Security section · Starling-style dark break · Loops.so glossary grid (6 cards) · Press logos · Final CTA · Footer.

### Dashboard Simple Mode
**Lyoum:** greeting + help icon · big amount · payout card · Encaisser primary CTA · 3 mini-tiles (Envoyer un lien · Rembourser · Ma carte) · Derniers paiements (5 rows).
**Flousi:** weekly total · Kiwi Compte balance widget · 7-day list · Envoyer au comptable.
**3awn:** Appeler conseiller · 4-item FAQ accordion · Vidéo Kiwi · small ghost "Mode avancé" link.

### Dashboard Pro Mode
Demo bar · Sidebar (260px, 15+ items across 3 sections) · Topbar (breadcrumb, search with ⌘K, team avatars, notifications, settings, `?` hint, AI button) · Hero Today card (gradient with live badge, 120px amount, 4-metric breakdown, 24h spark, objectif progress) · 6 KPI cards with sparklines · Revenue chart 7-day · Payment mix donut · Hour×day heatmap · Live transactions feed (auto-refreshes every 9-16s) · Settlement card · 7-day timeline · Health score (91/100) · Benchmark (#12/147 Casa cafés) · Top products · Staff performance · Integrations · AI drawer (floating bottom-right with 3 suggestions).

### Wallet (`wallet.html`)
Nav · Hero with phone mockup (home screen) · 3 phone cards side-by-side (Pay QR, Kiwi Card, Split Bill) · 6-feature grid · Investing block · Roadmap cards · Final CTA · Footer.

### Brand (`brand.html`)
Full design system reference with 8 sections (Logo, Couleurs, Typographie, Voix, Iconographie, Grille, Motion, Règles).

### Pitch (`pitch.html`)
12 slides: Cover · Problem · Why Now · Solution · Market · Product · Business Model · Traction · Competition · Team · Roadmap · Ask.

---

## 7. Known bugs / unfinished

From the automated QA audit (Nov 2025). BLOCKERS are fixed. HIGH items remaining:

1. **Dashboard has only partial `data-i18n` coverage.** Page greeting, KPI labels, block titles on dashboard do not switch when EN/AR is selected — they stay French. Fix: add `data-i18n` attributes to the ~30 dashboard strings; the i18n keys already exist in `i18n.js`.
2. **Command palette has no keyboard nav.** Footer promises "↑↓ naviguer" but only hover-highlight is wired. Fix: add keydown ArrowUp/ArrowDown to cycle `.kp-item.active`, Enter to activate.
3. **Modal/drawer focus traps are missing.** Tab escapes into the page behind. Fix: on open, focus first tabbable element; on Tab from last, cycle to first.
4. **Wallet `.f-card` tiles are `<div>`s, not `<button>`s.** Keyboard-unreachable. Fix: swap tag or add `role="button" tabindex="0"`.
5. **Landing mobile responsiveness:** dashboard mockup SVG `preserveAspectRatio="none"` stretches vertically at <375px; `.tx-head`/`.tx-row` 5-col grid squeezes below 640px; heatmap needs horizontal scroll below 480px.
6. **RTL polish:** `.dash-float` at `right: -14px` can overflow the viewport on mobile Arabic layout.
7. **Pitch deck is English-marked (`<html lang="en">`) but content is French, and has no lang switcher.**

See the full 85-item audit by searching for the QA agent transcript if needed; this project's next agent should keep a running todo file.

---

## 8. What's next (prioritized roadmap for the inheriting agent)

### Immediate (< 1 day each)
1. Fix the 7 HIGH items above
2. Add `data-i18n` to remaining dashboard/wallet strings
3. Run Lighthouse once — expect <90 performance from ungzipped font loads + grain SVG
4. Add `<meta name="description">` per page for SEO
5. Add `og:` and `twitter:` meta tags for social previews

### Short horizon (1–3 days each)
6. **Hook up a real backend** — even mocked via Supabase or Cloudflare Worker — for the signup wizard so real leads funnel into a CRM (currently pressing "Créer mon compte" does nothing but confetti)
7. **Build the Kiwi Invest UI** (Phase 3 in the pitch deck, not yet in Wallet) — fractional AMMC fund tiles, stock picker, halal filter
8. **Add the Pro-only surfaces** promised when the merchant toggles from Simple → Pro:
   - API keys + webhook log viewer
   - CSV import
   - Raw ledger query console
   - Bulk refund tool
9. **Dashboard live data simulation depth** — right now only the Pro dashboard's live feed animates. Simple Mode numbers are static; should tick.
10. **Real Moroccan photography shoot** — commission a 1-day photo shoot in Casablanca/Rabat/Marrakech of actual merchants. Replace the zero photos currently on the site with these.

### Medium horizon (1–3 weeks)
11. **Productize the Simple/Pro mode toggle** — currently a toggle; should be a smart default based on user's tenure (new user → Simple, power user → Pro) + an onboarding tutorial
12. **Kiwi Agent Mode upgrades** — right now it's 5 static suggestions; wire it to a real LLM backend (Anthropic Claude) for generative action proposals
13. **Push notifications / WhatsApp integration** — founder wants to keep merchants IN Kiwi, so build our own chat/notification layer rather than deep-linking to WhatsApp for every action
14. **Arabic UX QA** — find a native Arabic-speaking Moroccan merchant to review RTL layout. The current Arabic is plausible but not native-reviewed.
15. **Accessibility pass** — full WCAG 2.2 AA sweep (contrast, tab order, focus management, ARIA labels) — required for fintech compliance expectations in 2026

### Long horizon (built around real backend)
16. **Real KYC integration** — Sumsub or equivalent for CIN + selfie verification (currently a mocked wizard)
17. **BAM PE license filing** — the regulatory path mapped in the pitch deck requires this
18. **Merchant onboarding partner integration** — connect to Damane Cash or CDM Pay as sponsor acquirer (see `memory/kiwi_brand_system.md` for context)

---

## 9. Agent operating instructions

If you're an agent inheriting this project:

1. **Read this file first.** Then read `assets/tokens.css` (the design system), `assets/interactive.js` (the event model), and `assets/i18n.js` (translation pattern). That's ~800 lines total and gives you the architecture.
2. **Never edit `/tmp/kiwi-preview/` directly.** Always edit `/Users/zaka/Desktop/Gemma/kiwi/` and copy forward. The `/tmp` copy is the sandboxed preview runtime only.
3. **The dark-mode toggle was removed from the UI** per the founder's explicit direction (2026-04-24). The CSS vars still work if you set `html[data-theme="dark"]` programmatically, but don't re-expose the toggle unless explicitly asked.
4. **Simple Mode must remain sufficient for all daily merchant tasks** per founder direction (2026-04-24). Don't add features that are Pro-only by design — add them as mini-tiles, FAQ items, or contextual actions within Simple Mode too.
5. **Don't rebuild in React.** Vanilla is the stated architecture. If the founder asks for it, push back first: we can ship backend + deploy to Vercel without ever leaving vanilla.
6. **Memory system** — there are project memories at `/Users/zaka/.claude/projects/-Users-zaka-Desktop-Gemma/memory/` including user profile, brand system, and project context. Respect them.
7. **When the founder says "make it feel like $100M"**, the playbook is in `premium.css` + `ux.css` — pill nav, gradient mesh, mouse parallax, word stagger, scroll reveals, 3D card tilts, ripple, grain texture, count-up, marquee. Compound these; don't replace them.
8. **The 3 research agent briefs** (Moroccan market · $100M patterns · senior UX) were synthesized into this project. Re-deploying them is usually wasteful; read this file and the inline code comments instead.
9. **Known user style:** likes big ambitious scope, "take as long as needed" framing, wants parallel agent deployment for independent research, values tangible output over memos, will give direct feedback if something misses (e.g., "too simple", "still not fixed", "not a $100M website").

---

## 10. Contact

- **Founders:** Badr-Eddin Bakkioui (CEO) & Zakariae Attahiri (CTO · COO) · invest@kiwi.ma · Tanger, Maroc
- **Preview URL (local):** http://localhost:4321/index.html
- **Source repo:** `/Users/zaka/Desktop/Gemma/kiwi/` (not yet in git — consider initializing)
- **Memory:** `/Users/zaka/.claude/projects/-Users-zaka-Desktop-Gemma/memory/MEMORY.md`

---

*Built over ~5 conversations between 2026-04-23 and 2026-04-24 with Claude Opus 4.7 (1M context). The aesthetic target was "indistinguishable from Mercury / Ramp / Stripe in 2026." Hit that bar on hero, calculator, dark break, glossary, pricing. Gaps remain on: real photography, native Arabic review, responsive edges <400px, focus management, real backend.*

# Kiwi Pro · premium feel roadmap (2026-10-10)

Synthesis of six research passes (Apple HIG and WWDC, fintech launch
patterns, native feel in WKWebView, POS and dashboard UX, open-source
libraries, Reddit and HN) checked against what the app does today. Sources
are linked inline. Items marked *practice* are common industry practice the
research could not tie to one source.

The rule behind most of it: **premium is continuity, not decoration.** Nothing
jumps, nothing pops in, every touch answers on touch-down, and motion explains
what changed in under ~300 ms.

---

## 0 · Opening screen (done, build 33)

What was wrong, measured on a simulator recording frame by frame:

1. The launch screen drew the mark **centred** (y ≈ 436 pt), the first real
   screen drew it **at the top** (y ≈ 125 pt), the web lock at a third place
   and size (64 px, y ≈ 166 pt). Every launch ended in a jump. A centring
   change made on 2026-10-10 caused the first of these.
2. A whole-screen SwiftUI cross-fade made the mark vanish for ~70 ms, then
   come back dimmed.

What it does now:

- One place for the mark everywhere: 88 pt, safe area + 20, in
  `LaunchScreen.storyboard`, the web boot stage (`native-shell.css`), the
  SwiftUI host (`KiwiNativeShell.swift`) and the web lock
  (`native-runtime.css`). Apple: the launch screen should be "nearly
  identical to the first screen of your app"
  ([HIG Launching](https://developer.apple.com/design/human-interface-guidelines/launching)).
- The mark never animates. Around it, title then controls fade up 8 pt
  (~420 ms, `cubic-bezier(.22,.9,.24,1)`), plain fade under Reduce Motion.
- Face ID asks after the lock is visible and on top, never from behind the
  onboarding. Code entry always works.
- Pinned by `tools/native-face-entry-test.mjs` (mark at safe area + 20,
  0 px travel, storyboard never centred, Swift mark never faded).

Still to verify on a device: no white frame between splash and web view
(set `WKWebView.isOpaque = false` until first paint if one shows,
[WebKit 215479](https://bugs.webkit.org/show_bug.cgi?id=215479)).

---

## 0b · Screens that painted white, then dark (done, build 34)

Reported on the Orders summary cards: they opened white, then turned dark.
Two causes, both fixed:

- The cards used `var(--n-0, #fff)`, a token defined nowhere, so they were
  always white. They now use `--surface` (web) and `--kno-card` (native).
- The dark-mode completion pass (`assets/dark-fixes.js`) that repaints such
  surfaces waited 30 to 150 ms, watched an `.app` element the native app
  mounts after the script runs (so in the app it never ran on new screens),
  and skipped the added element itself. It now runs inside the mutation
  callback, before paint, on the whole body, root included, with transitions
  off for that frame.

Pinned by `tools/native-premium-feel-test.mjs`: a white card added in dark
mode is dark in its first painted frame, and Orders opens with no white
surface in its first frame.

## 1 · Tier 1: high impact, low effort

Status (build 34): **1 done** (plus `:hover` removed on touch-only devices,
so nothing stays lit after a tap, and no long-press preview on images and
links) · **2 done** (touch-down `scale` via the Web Animations API, every
button, tab, link and `data-action`) · **3 done** for selection (period,
tabs, pills under a real finger; chart reading ticks once per data point;
key presses, payment success and errors already had theirs) · **4 done**
(tabular figures on live amounts; the dashboard already counts numbers up)
· **5 not taken**: the app's spinners sit inside buttons, and delaying them
would show an empty button · **6 done**.
Also: the revenue chart now reads under a slow finger with a tick per point,
and a quick flick still steps the period.

| # | What | Why | Source |
|---|------|-----|--------|
| 1 | Audit browser tells: `-webkit-tap-highlight-color:transparent`, `-webkit-touch-callout:none`, `user-select:none` on chrome (not inputs or text), `touch-action:manipulation`, `overscroll-behavior:none` on html/body and `contain` on inner scrollers, `:hover` only under `@media (hover:hover)` | Grey tap flashes, callouts and whole-page rubber-banding are the first "web app" giveaways | [capgo](https://capgo.app/blog/basic-js-css-config-for-native-app-look/), [Shopify](https://shopify.engineering/mobilebridge-native-webviews) |
| 2 | Press state on touch-down (`:active` + scale .97, 100 to 150 ms release) on every button, card and row | Instant response on touch-down is the most cited "premium" signal | [Linear breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026) |
| 3 | Haptics map, one meaning each: selection for pills/tabs/scrub, light impact for key presses, success notification for payment taken and order sent, error for declined, warning for destructive confirm. Never on scroll, never on every tap | Apple: choose by meaning, match intensity to the visual | [HIG Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) |
| 4 | Tabular figures (`font-variant-numeric: tabular-nums`) on every live amount; rolling digits when a total changes | Numbers that jitter on update read as cheap | [number-flow](https://github.com/barvian/number-flow) |
| 5 | Spinners only after ~400 ms; render last-known data from cache first | Stripe's first screen "appears all at once", falls back to spinners only when slow | [Stripe dashboard design](https://medium.com/swlh/exploring-the-product-design-of-the-stripe-dashboard-for-iphone-e54e14f3d87e) |
| 6 | Add `CADisableMinimumFrameDurationOnPhone` to Info.plist | Native sheets and the SwiftUI tab bar get 120 Hz. WKWebView itself stays at 60 Hz, so web motion stays transform/opacity only | [WebKit 294338](https://bugs.webkit.org/show_bug.cgi?id=294338) |

## 2 · Tier 2: high impact, medium effort

| # | What | Why | Source |
|---|------|-----|--------|
| 7 | Native sheets (`UISheetPresentationController` with detents) for payment, confirmations and the Face ID offer | CSS sheets cannot match system rubber-banding, dimming and detent haptics. No Capacitor plugin exists; a small Swift plugin does | research (libraries pass) |
| 8 | Period changes animate: the chart fades and scales the old range into the new one; the comparison is a dashed line on the same axis | Stripe and Apple Charts guidance | [Stripe](https://medium.com/swlh/exploring-the-product-design-of-the-stripe-dashboard-for-iphone-e54e14f3d87e), [WWDC22 Charts](https://developer.apple.com/videos/play/wwdc2022/110340/) |
| 9 | Chart scrubbing: one finger, vertical rule, value callout, a selection haptic per data point, stronger at the day high and low; label only start, middle and end | Robinhood-style reading of the day | [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10037/) |
| 10 | Sale success moment under 400 ms: success haptic, check animation, then receipt choices (print, WhatsApp, none) and "next order" | The till's most repeated moment | *practice* |
| 11 | Honest sync states: a number still syncing says so, a sale paid offline says "Pending", printer and reader status visible in the app | Toast and Shopify POS both do this; offline and printer drops are top merchant complaints | [Toast offline](https://support.toasttab.com/en/article/Using-Toast-in-Offline-Mode), [Shopify POS](https://www.shopify.com/blog/retail-roundup-february-2026) |
| 12 | Morning push at business open with yesterday's Z summary, on the 5 h business day, Casablanca time | Stripe's daily summary pattern; the merchant's first question | [Stripe](https://medium.com/swlh/exploring-the-product-design-of-the-stripe-dashboard-for-iphone-e54e14f3d87e) |
| 13 | Dynamic Type for web screens: size from `font: -apple-system-body` (family kept Inter Tight) or the Text Zoom plugin | WebKit ignores Larger Text in WKWebView; Apple asks for 200 % | [WebKit 187013](https://bugs.webkit.org/show_bug.cgi?id=187013), [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) |

## 3 · Tier 3: larger moves

- **Native navigation bar and swipe-back** around the web content, the
  Hotwire Native / Shopify model. Snapshot the web view before a push so
  back is instant ([Shopify](https://shopify.engineering/mobilebridge-native-webviews),
  [Hotwire Native](https://native.hotwired.dev/overview/bridge-components)).
- **Pre-warm the next tab's web view** and reuse it. Shopify took P75 load
  from 6 s to 1.4 s this way.
- **Liquid Glass (iOS 26)** comes free on native tab bars and sheets built
  with the new SDK; web-drawn chrome never gets it
  ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).

## Do not

- Ship the private-API 120 Hz WKWebView plugin (App Store risk).
- Put Lottie or any animation on the launch path, or text on the launch
  screen (cannot be localised).
- Celebrate with confetti; Robinhood removed theirs after criticism
  ([Bloomberg](https://www.bloomberg.com/news/articles/2021-03-31/robinhood-ditches-its-confetti-animation-following-criticism)).
- Hide features behind codes in the native app (2.3.1).

## Libraries worth a look (verify Capacitor 8 peer deps first)

- `@aparajita/capacitor-biometric-auth` v9 (Capacitor 8+, MIT) if the
  in-house LocalAuthentication bridge ever needs replacing.
- `barvian/number-flow` (rolling digits, MIT).
- uPlot (MIT, ~50 KB, canvas) or TradingView Lightweight Charts
  (Apache-2.0) for scrub-able charts.
- Motion (motion.dev, MIT) for spring easing in vanilla JS, or CSS
  `linear()` springs with no dependency (Safari 17.2+).

Wave E · cx/e-dash

Already closed: DM-1/2/5/6/7 (30 strict properties), ownership/coupling (existing red/green fixtures). Decisions: `docs/decisions/2026-10-24-wave-d.md`, e-dash.

Cores: dateRange 4868→2868; agent 4801→2777 lines. Byte-exact reconstruction, synchronous APIs retained. Forty first-use scripts; shell 160→122. Home providers remain eager. Order, single flight, retry, guards before replay, deep links, form submits, offline dependencies and startup dependencies verified. No baseline raised.

Evidence: HEAD fails graph/cap/coverage guarantees. Non-browser: 161/162 pass, stamp-drift intentionally fails. Intake: 18 pass (photo/PDF/assistant, FR/EN/AR, phone/tablet, stock confirmation); view-link: 22 pass. Ownership, core split, loader, PWA (891), size (720), agent and coverage pass.

Lead: restamp `assets/agent.js`, `assets/agent/ui.js`, `assets/dateRange.js`, `assets/daterange/renderers.js`, `assets/pages/dashboard-loader.js`, `assets/production-action-guard.js`, `assets/view-link.js`; run full gate and deploy. SW generation untouched. No commit, push, production changes or paid models. No feature gap remains open.

Files, +added/−deleted lines:

`assets/agent.js` +228/−2252
`assets/agent/ui.js` +2323/−1
`assets/dateRange.js` +143/−2143
`assets/daterange/renderers.js` +2201/−1
`assets/pages/dashboard-loader.js` +75/−1
`assets/production-action-guard.js` +1/−0
`assets/view-link.js` +7/−0
`dashboard.html` +42/−40
`docs/decisions/2026-10-24-wave-d.md` +9/−0
`kiwi-sw.js` +12/−0
`tools/action-honesty-test.js` +7/−1
`tools/agent-open-targets-test.mjs` +2/−1
`tools/briefing-test.mjs` +2/−1
`tools/check.js` +1/−0
`tools/core-split-test.mjs` +6/−3
`tools/core-test-source.cjs` +9/−1
`tools/coverage-baseline.json` +18/−0
`tools/coverage-manifest-test.mjs` +6/−0
`tools/coverage-manifest.json` +48/−0
`tools/customer-retention-test.mjs` +2/−1
`tools/dashboard-dependencies.cjs` +13/−0
`tools/dashboard-first-use-test.mjs` +105/−0
`tools/file-size-baseline.json` +3/−3
`tools/fixtures/agent-split/split.json` +6649/−3
`tools/fixtures/dashboard-first-use.json` +162/−0
`tools/fixtures/daterange-split/split.json` +2444/−2
`tools/hotel-split-test.mjs` +3/−3
`tools/menu-nutrition-test.mjs` +2/−1
`tools/menu-scan-test.mjs` +2/−1
`tools/orderpro-formula-choice-images-test.mjs` +2/−1
`tools/orderpro-guestpage-editor-test.mjs` +2/−1
`tools/planning-layout-test.mjs` +2/−1
`tools/restaurant-recipe-layout-test.mjs` +2/−1
`tools/restaurant-units-test.js` +2/−1
`tools/sales-day-contrast-test.mjs` +2/−1
`tools/salle-scan-test.mjs` +2/−1
`tools/starter-copy-test.mjs` +2/−1
`tools/stock-split-test.mjs` +1/−1
`tools/store-templates-test.mjs` +2/−1
`tools/surface-matrix-states-intake-browser-test.mjs` +146/−27
`tools/team-split-test.mjs` +6/−1
`tools/view-link-browser-test.mjs` +2/−0
`tools/weather-test.mjs` +2/−1
`docs/handoffs/WAVE-E-DASH.md` +56/−0

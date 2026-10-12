# Findings · cluster `access` (sign-in, setup, role picker, locks, pairing)

Critic pass, 2026-10-12. 14 surfaces, 73 usable frames (English, light and dark) under `/Users/zaka/Developer/kiwi-design-audit/shots/access.*/`, plus the real simulator capture `/Users/zaka/Developer/kiwi/app/ios/build/app-store-screenshots/iphone-6.9/raw-roles.png`. Contact sheets are in `/private/tmp/claude-501/-Users-zaka-Developer-kiwi/b1047fb9-db06-41c7-87ad-42ff893fbacd/scratchpad/critic-access/`. Contrast figures are WCAG ratios measured from frame pixels (darkest glyph pixel against the dominant background in the crop), so the real text contrast is at or below the stated value.

Capture caveats (not design findings):
- All four `access.role-picker/*.png` frames are one flat colour (RGB 13,13,13). The role picker was judged from `raw-roles.png` and `KiwiNativeShell.swift` instead.
- `till-pin`, `till-clock-in` and `kds-pairing` were captured in dark only.
- `access.setup-wizard-business-type` actually shows the *locations* step ("How many locations do you run?"). The business type is picked on the `business` step.
- As the coordinator asked, I checked that the wizard frames advanced. They did: `owner` is step 1, and its empty name field is the real step-1 state. `business` is step 2, `business-type` is step 3, and `access` is the last step (all six progress segments filled).
- As the coordinator noted, `access.sign-in` and `access.printer-bridge` paint 91 to 98% luminance in every dark frame. That is reported below as a design finding.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 4 | Four different main-button fills, an off-token neon `#00FFAE`, solid header strips over gradients, 10 font sizes in the sign-in stylesheet, a fake phone bezel on iPad and desktop. |
| UI | 4 | No "Forgot password" on the web sign-in, three different keypad designs, placeholders that read as typed values, 31x23 px language buttons, disabled buttons with no reason. |
| UX | 3 | Two onboarding flows back to back (native 5 steps, then web 6 steps), password then PIN, questions asked twice, answers pre-selected, no self-serve password reset. |
| Motion | 0 | Not verified. Needs screen recordings of the wizard step transitions, the PIN error shake and the role hand-off, plus a reduced-motion run. |
| Feel and haptics | 0 | Not verified. Needs a device haptics trace. In the code, the native shell has one `UIImpactFeedbackGenerator(.light)` (`KiwiNativeShell.swift:145`); the web keypads show no haptic feedback. |
| Copy and language | 3 | The whole printer page, the till PIN prompt, the kitchen desktop copy, the desktop clock date and the page titles are French in English frames. Em dashes in native copy, tu and vous mixed, three names for the team app. |
| Accessibility | 3 | Lock helper text 2.03:1, demo link 2.95:1, team PIN dots 1.16:1, till location line 3.24:1. Sign-in and printer pages ignore dark mode. Language buttons are 23 px tall. |
| Honesty and consistency | 4 | 500 MAD float and "Restaurant" pre-selected, "Almost done" shown under a full progress bar, iPhone offered a macOS download, "l'app est sûre" on an unsigned binary, the lock title changes per device. |
| Performance | 0 | Not verified. Needs INP traces on an iPhone 12 for keypad taps and the wizard Continue button, and a layout-shift (CLS) trace of the sign-in page (fonts load from Google with a system fallback). |

## 2. Verdict

**FAIL.** No dimension reaches 10, and three could not be verified.

## 3. The five changes that would move the scores most

1. **One onboarding, one gate, a real reset.**
   - Add a self-serve "Forgot password?" to the web sign-in, wired to the existing `/reset` page.
   - Merge the native device setup and the web wizard into one flow that never asks a question twice. Name and business are already collected at sign-up.
   - Stop pre-selecting answers (business type, opening float).
   - Moves UX, UI and Honesty.
2. **One token set for the entry screens.**
   - Replace `#00FFAE` with `--mint` and use one main-button fill per theme.
   - Fix the lock's grey colour leak (2.03:1), and raise the PIN dots and footers to AA.
   - Remove the solid `.kob-top` strip.
   - Make the sign-in and printer pages follow the system's dark mode.
   - Moves Visual design and Accessibility.
3. **Close every French leak on the English path.**
   - `printer.html` has no i18n at all, and the till PIN prompt is a hard-coded French literal.
   - The kitchen desktop frame, the desktop clock date and every `<title>` are French.
   - Remove the em dashes from `native-shell.js`.
   - Moves Copy.
4. **One PIN component.**
   - Use the same keypad (shape, size, delete key, error state) on the dashboard lock, till, team and kitchen screens.
   - Explain the 4-digit and 6-digit codes.
   - Render the team app full-screen on iPad instead of inside a drawing of a phone.
   - Moves UI, Visual design and Accessibility.
5. **Make the printer bridge trustworthy.**
   - Ship a signed, notarised Mac build, so the page no longer tells merchants to bypass Gatekeeper or pipe `curl | bash` from a personal GitHub repo.
   - Fix iOS detection.
   - Show "not installed yet" as a neutral state instead of a red alarm.
   - Moves Honesty and UX.

---

## 4. Findings by surface

### access.sign-in (web account gate)

- **Blocker · no password recovery on the sign-in page.**
  - Where: `access.sign-in/*.png`, sign-in pane. The form has email, password and Sign in, nothing else.
  - Evidence: a `/reset` page exists (`/Users/zaka/Developer/kiwi/reset.html`, allow-listed at `functions/_middleware.js:416`), but only an operator-sent link reaches it. A merchant who forgets the password at 7 am is locked out.
  - Source: `functions/_middleware.js:1176-1183`. The native shell has a "Forgot password?" link, but it only opens a support article, `support.html#mot-de-passe-oublie` (`app/src/native-shell.js:212-217`).
  - A 10: a "Forgot password?" link under the password field that sends a reset email, in all three languages.
- **Major · no dark mode.**
  - Evidence: `access.sign-in/{iphone,ipad,desktop}-dark-en.png` paint 91 to 97% luminance, the same as light.
  - This is deliberate, per the comment at `functions/_middleware.js:1059-1065`: dark only when the merchant switched on `kiwiDashTheme`. But the native setup is always dark, so an iOS user goes dark (native setup), then white (sign-in), then dark (lock).
  - A 10: follow `prefers-color-scheme` on the first visit, then the stored choice.
- **Major · placeholders read as filled values.**
  - Evidence: the email placeholder measures 5.63:1. The password placeholder is literally `••••••••` (`functions/_middleware.js:1180`), so an empty form looks filled in.
  - The CSS asks for `#a7b0aa` (`:958`), but the rendered placeholder is RGB 95,99,97, almost the colour of typed text.
  - A 10: placeholder at about 3:1 and no fake dots; the label carries the meaning.
- **Major · language buttons are 31x23 px.**
  - Source: `.auth-langs a` is `min-width:31px; padding:5px 7px; font-size:11px` (`functions/_middleware.js:833`), well below the 44 pt minimum.
  - Each tap reloads the whole page to `/dashboard?lang=…` (`:1157-1159`).
  - A 10: a 44 pt segmented control that swaps the copy in place.
- **Polish · 10 font sizes in one stylesheet.**
  - Evidence: the gate stylesheet uses 11, 11.5, 12.5, 13, 13.5, 14, 14.5, 15, 26 and 34 px (`functions/_middleware.js:833-1057`).
  - A 10: four sizes (title, body, label, caption).
- **Polish · dead gap above the button.**
  - Evidence: about 40 pt of empty space between the password field and Sign in (`iphone-light-en.png`, y 1230-1340 px at 3x). It is held open by the empty `.err` paragraph.
  - A 10: the error row collapses when empty, or the gap matches the spacing between fields.
- **Polish · footer divider wider than the content column.**
  - Evidence: in the iPad frame the divider spans x 466-1033 px, the content spans 481-1018 px.
  - A 10: one shared column edge.
- **Polish · "No commitment" on a sign-in screen.**
  - It is a pricing promise, not a trust signal for someone signing in.
  - The English error copy also uses a middle dot as sentence punctuation: "This email already has an account · sign in instead." (`:719`).
  - A 10: "Encrypted · Never sold", and full stops in sentences.

### access.role-picker (native, judged from raw-roles.png)

- **Major · two typographic voices.**
  - Evidence: the native setup renders in SF Pro (`KiwiNativeShell.swift:574`, `.font(.system(...))`) with SF Symbols (`:798-800`: `creditcard`, `person.3`, `fork.knife`, `chart.bar`). Every web screen after it uses Inter Tight with Material Symbols.
  - The brand rule says Material Symbols only. Using SF on a native screen is a defensible choice, but today the first and second screens look like two products.
  - A 10: one decision, applied to both layers.
- **Major · the owner is listed last.**
  - Someone who downloads "Kiwi Pro" from the App Store is most likely the owner, yet Dashboard is the fourth row.
  - A 10: Dashboard first, or ask "owner or staff?" first.
- **Major · always dark.**
  - Evidence: painted luminance 0.05 even when the frame asked for light. The next screen (web sign-in) is white.
  - A 10: follow the system appearance.
- **Polish · inconsistent names.**
  - Evidence: "Kiwi Team" in English, "KiwiÉquipe" with no space in French (`app/src/native-shell.js:20`), "Team" on the team PIN screen, "Équipe" in the page title. The other rows have no "Kiwi" prefix.
  - A 10: "Team" everywhere, one spelling per language.
- **Polish · orphan "Back".**
  - Evidence: a centred text "Back" sits about 370 pt below the list with nothing in between, and it is unclear where it goes. The web wizard uses a left-aligned "‹ Back" instead.
  - A 10: a back chevron in the navigation bar, in the same place on every step.
- **Polish · em dashes in setup copy.**
  - Evidence: `stageRole` contains U+2014 in French, English and Arabic (`app/src/native-shell.js:18,27,36`). The brand bans em dashes in user-facing copy.

### access.setup-wizard-welcome / -owner / -business / -business-type / -access (web wizard)

- **Blocker · a second onboarding after the first.**
  - Evidence: the native shell already runs account, role, connect, printer and ready (`app/src/native-shell.js:294`). Then the web wizard runs six more steps (`assets/onboarding.js`). A merchant on iOS answers about 11 screens before seeing the product.
  - A 10: one flow of about 4 screens, each question asked once.
- **Major · questions asked twice.**
  - Evidence: sign-up asks Name and Business (`functions/_middleware.js:1187-1192`). The wizard asks "What should we call you?" and "Business name" again (`setup-wizard-owner`, `setup-wizard-business`).
  - `prefillFromAccount()` exists (`assets/onboarding.js:145`), but the steps are still shown.
  - A 10: skip any step the account already answered.
- **Major · neon accent outside the brand.**
  - Evidence: the dark "Get started" and "Continue" fills on desktop and iPad, and the iPhone eyebrow, measure RGB 0,255,174 (`#00FFAE`). The brand's `--mint` is `#7DF2B0`.
  - Source: `assets/design-vexel.css:178` (`--vx-sidebar-accent:#00FFAE`), `:1170`, `:1684`.
  - A 10: one mint, taken from `tokens.css`.
- **Major · four different main buttons in one cluster.**
  - Evidence: wizard light uses `#0B6E4F`. Wizard dark on desktop and iPad uses `#00FFAE` with black text. Wizard dark on iPhone is a paper-white pill (`iphone-dark-en.png`). The till's "Open till" uses `#0E805C`.
  - A 10: one main-button colour per theme.
- **Major · solid header strip on iPhone.**
  - Evidence: a solid rectangle (RGB 10,15,13 in dark, cream in light) sits behind the logo and progress bar, visibly boxed against the gradient (`setup-wizard-*/iphone-*-en.png`, y 170-268 at 1x).
  - Source: `app/src/native-runtime.css:563` (`.kob-top{position:sticky;… background:var(--kno-bg)}`).
  - A 10: a blurred bar or no bar, with no visible edges at rest.
- **Major · pre-selected answers.**
  - Evidence: "Restaurant" is selected before the merchant touches anything (`setup-wizard-business/*.png`). One tap on Continue files a shop as a restaurant and loads the wrong vertical.
  - A 10: nothing selected, and Continue disabled until a choice is made.
- **Major · the last step misstates progress.**
  - Evidence: on `setup-wizard-access` all six progress segments are filled, yet the button says "Almost done →" and another screen follows ("Enter my space →", `assets/onboarding.js:710`).
  - A 10: the progress bar shows the steps that remain, and the button names the next action.
- **Major · empty team cards look mandatory.**
  - Evidence: the team-codes step opens with an empty Manager card and an empty Staff/cashier card, each with a name field and a code field. The copy above says "Only yours is required" (`setup-wizard-access/*.png`).
  - A 10: only the owner row, plus "Add a member".
- **Major · the main button is off-screen on iPhone.**
  - Evidence: `setup-wizard-access/iphone-*-en.png` ends at "+ Add a member"; "Almost done" is below the fold. Every earlier step pins its button to the bottom.
  - A 10: the same pinned footer on every step.
- **Major · mixed weights inside one heading.**
  - Evidence: "Let's set it all up" is regular and "together." is semibold (`assets/onboarding.js:352`, `<span class="k-sans">`). It reads as a rendering error.
  - A 10: one weight per heading, with colour for emphasis if needed.
- **Polish · eyebrow casing changes with screen size.**
  - Evidence: desktop shows "WELCOME TO KIWI" and "TEAM ACCESS" in tracked caps; iPhone shows "Welcome to Kiwi" and "Team access" in sentence case.
  - A 10: one style.
- **Polish · double focus ring.**
  - Evidence: the focused name field draws a 3-layer ring about 6 pt thick (`setup-wizard-owner/iphone-light-en.png`, x 33-887 at 1x).
  - A 10: one 2 pt ring in `--atlas`.
- **Polish · tiny "‹ Back".**
  - Evidence: an about 14 pt text link with a typed "‹" character, about 60x24 pt.
  - A 10: the Material `chevron_left` icon in a 44 pt target.
- **Polish · straight apostrophes.**
  - Evidence: "Let's" and "team's" use U+0027 in display headings (`assets/onboarding.js:352`). The native copy uses U+2019.
  - A 10: curly apostrophes everywhere.
- **Polish · two promised durations.**
  - Evidence: the web wizard says "under 2 minutes", the native setup says "about two minutes" (`native-shell.js:27`). The merchant sees this as one setup.
- **Polish · "+ More types (13)".**
  - Evidence: 6 visible types plus 13 is 19, while product copy elsewhere says 17 business types.
  - Action: check the count in the `assets/onboarding.js` trades list.
- **Polish · code fields with "••••" placeholders.**
  - The same placeholder-as-value problem as the sign-in page.
  - A 10: four empty boxes or a "4-digit code" label.

### access.dashboard-lock (owner PIN lock)

- **Blocker · lock copy fails AA in light mode.**
  - Evidence: in `dashboard-lock/ipad-light-en.png`, "Enter your 4-digit code…", "Switch account" and "Change role" all paint RGB 172,184,177 on white, **2.03:1**. The same grey appears in the dark frames, so a dark-theme grey is leaking into the light card.
  - Source: the rules at `assets/design-vexel.css:1735-1742` use `--n-500` and `--n-600`. The light layer defines those at `:2629` (`rgba(10,15,13,.64)`), but a dark definition wins. Likely candidates: the legacy `html[data-theme="dark"]` block (`assets/theme.css:32`) or `design-vexel.css:2515`. Confirm with the computed style.
  - A 10: 4.5:1 minimum, with tokens scoped per mode.
- **Major · three PIN patterns for the same lock.**
  - Evidence: desktop shows four input boxes with a caret. iPad shows four large empty boxes and no keypad. iPhone shows dots plus a keypad of bare digits. The till and team locks use round keys; the kitchen uses square keys.
  - A 10: one PIN component.
- **Major · the title changes per device.**
  - Evidence: desktop says "Café Atlas"; iPad and iPhone say "Welcome back". Desktop offers "Open the till"; mobile offers "Change role".
  - A 10: the same content, with only the layout adapting.
- **Major · "Enter the demo →" at 2.95:1.**
  - Evidence: `iphone-light-en.png`, atlas green on near-black.
  - It only shows in local demo mode (`assets/design-vexel.css:1740-1741`), but when shown it fails AA.
- **Major · password then PIN.**
  - A merchant who just signed in with a password lands on a second 4-digit gate, and the native app offers no Face ID or Touch ID.
  - A 10: biometrics, with the PIN as fallback.
- **Polish · iPhone lock is always dark.** Asked for light, painted 0.08 luminance.
- **Polish · no "Forgot code?" path** on any lock.

### access.till-pin (till staff PIN)

- **Major · French in the English frame.**
  - Evidence: "Bonjour, Othmane", "CODE D'ACCÈS · 4 CHIFFRES", the demo-code hint line and "Changer de compte" are French. "Change role", injected by `app/src/native-runtime.js:232`, is English, so one screen mixes two languages.
  - Source: `kiwi-caisse.html:5727` hard-codes the prompt, and `assets/caisse-lang.js` has no entry for it.
- **Major · demo-code hint printed on the lock.**
  - Evidence: all three frames show a line of tracked caps under the keypad listing the demo codes.
  - This is acceptable on a demo build only if it can never render for a real merchant. Check that it is gated on `KiwiEnv.isReal()`.
- **Major · unexplained "SOS" key.**
  - Evidence: the bottom-left key is labelled "SOS", with no icon and no hint of what it does. A cashier under pressure will either avoid it or press it by accident.
  - A 10: a labelled help action outside the digit grid.
- **Major · "Changer de compte" at about 4.0:1.**
  - Evidence: about 14 pt text, measured 4.04 at its darkest pixel (`iphone-dark-en.png`). Fails 4.5:1.
- **Polish · greeting before anyone identifies.**
  - "Bonjour, Othmane" greets a named person before any code is entered. On a shared till this can name the wrong person.
  - A 10: show the venue name until the code identifies the user.
- **Polish · visible tile behind the logo mark.**
  - Evidence: an RGB 10,22,18 square on an RGB 6,23,18 background (`iphone-dark-en.png`, y 250-500).
  - A 10: no container.

### access.till-clock-in (opening the till)

- **Major · 500 MAD opening float pre-selected.**
  - A float must be counted, not defaulted. One tap on "Open till" records 500 MAD whatever is in the drawer, and every end-of-day (Z) report after it inherits the error.
  - A 10: an amount field in focus, presets as shortcuts, nothing selected.
- **Major · date in French on desktop.**
  - Evidence: "lundi 12 octobre" on `desktop-dark-en.png`, "Monday 12 October" on iPad and iPhone. The desktop date formatter ignores the language.
- **Major · "MAARIF · CASABLANCA" at 3.24:1.** On `desktop-dark-en.png`. Fails AA.
- **Major · bold display numeral.**
  - Evidence: the clock "20:40" is set heavy (about 800). The brand says no bold display weights.
  - A 10: weight 600 or lighter, with tabular figures.
- **Polish · lowercase "merchant edition"** under the logo, a tagline no other screen uses.
- **Polish · two greetings.** "Hello Othmane" here, "Bonjour, Othmane" one screen earlier, with and without the comma.

### access.team-pin and access.team-clock-in (staff app)

- **Major · fake phone bezel on iPad and desktop.**
  - Evidence: in `team-pin/ipad-*.png` and `desktop-*.png` the app renders inside a 420x880 rounded device frame with a 6 px border (`kiwi-serveur.html:498-518`). The frame is only removed below 500 px wide.
  - On an iPad running the native app, the team role uses about 30% of the screen inside a drawing of a phone.
  - A 10: a full-screen layout at any width.
- **Major · PIN dots invisible in light.**
  - Evidence: in `team-pin/ipad-light-en.png` the empty dots are RGB 228,225,217 on RGB 238,243,238, **1.16:1**. Non-text elements need 3:1.
- **Major · iPhone light paints dark.** `team-pin/iphone-light-en.png` has luminance 0.07.
- **Major · clock-in screen in the wrong order.**
  - Evidence: the code field comes before the greeting, the time and the action (`team-clock-in/iphone-light-en.png`). "Clock in" is disabled (2.41:1) with no message saying why.
  - A 10: greeting, then the one field, then the button. The disabled state says "Enter the till code".
- **Major · three code lengths.**
  - Evidence: staff PIN 4 digits, till code 6 digits ("000000"), kitchen pairing 6 digits, dashboard lock 4 digits. None of the screens says which code is which or where to find it, beyond "Your manager creates your account in Team".
  - A 10: name the code and where it lives, e.g. "the 6-digit code shown on the till".
- **Polish · inconsistent bottom-left key.** Dark frames show an empty disc in the bottom-left of the keypad; light frames show nothing there.
- **Polish · "Change role" and the refresh button not aligned.**
  - Evidence: "Change role" sits at y≈178 pt on the left, the refresh button at y≈80 pt on the right (`team-clock-in/iphone-light-en.png`).
  - The refresh button has no label.
- **Polish · casing drift.**
  - Evidence: "SERVER · CAFÉ ATLAS" in caps here, "Cashier · Café Atlas" on the till. "Maarif · Casablanca" here, "MAARIF · CASABLANCA" on the till.

### access.kds-pairing (kitchen pairing)

- **Major · French and informal on desktop.**
  - Evidence: `desktop-dark-en.png` shows "Entre le code d'appairage… à ta cuisine", "Effacer" and "Valider". The French uses *tu*; every other screen uses *vous*.
  - Source: `kiwi-cuisine.html:729,876`.
- **Major · keypad shape changes per device.**
  - Evidence: square keys on desktop and iPad, round keys on iPhone. "Clear" and "Confirm" here, a backspace icon on every other keypad.
- **Polish · small keypad on a wall tablet.**
  - Evidence: iPad keys are about 60x48 pt on a 1032 pt wide screen used with wet hands.
  - A 10: keys of at least 72 pt.
- **Polish · "Confirm" disabled at very low contrast**, with no hint that six digits are needed.

### access.printer-bridge (bridge download page)

- **Blocker · instructions ask merchants to defeat OS security.**
  - Evidence: the macOS steps say the "unidentified developer" warning is normal and "l'app est sûre", then walk through "Ouvrir quand même" in Privacy & Security.
  - They also offer `curl -fsSL https://raw.githubusercontent.com/badro99/… | bash` (`printer.html:110-115`), and the Linux steps do the same with `sudo bash`.
  - For a payments product this is the opposite of trust.
  - A 10: a signed and notarised build, one download, no terminal.
- **Major · entirely French in the English frame**, with no i18n at all (`printer.html:2`, `lang="fr"`, every string a literal).
- **Major · iPhone offered a macOS download.**
  - Source: `detectOS()` matches `/Mac OS X/` in the user agent (`printer.html:157`). iOS user agents contain "like Mac OS X", so iPhone and iPad get "Télécharger pour macOS".
  - A 10: detect iOS and explain that the bridge runs on the counter computer, with the 6-digit pairing path.
- **Major · no dark mode.** All dark frames paint 0.98 luminance.
- **Major · red alarm as the first state.**
  - Evidence: the page opens on a red "Pont non détecté" banner. For a merchant who has not installed the bridge yet, this is the expected state, not an error.
  - A 10: a neutral "Not installed yet", with the download as the main action.
- **Polish · three names.**
  - Evidence: "Pont d'impression", "Kiwi Printer" and "Kiwi Print Bridge" (`printer.html:111,163`).
  - "Autres plateformes" lists macOS again.

---

## 5. Systemic patterns

1. **Every entry screen draws its own lock.** The dashboard lock, till PIN, team PIN and kitchen pairing are four implementations with four keypads, three code lengths and different delete and confirm keys. One shared PIN component would fix UI, Accessibility and Copy findings at once.
2. **Two dark systems, two sets of greys.** Two dark-mode layers disagree: the legacy `data-theme` layer and the Vexel `data-vexel-mode` layer. That disagreement causes the lock's 2.03:1 helper text and the light frames that paint dark (role picker, iPhone dashboard lock, iPhone team PIN). CLAUDE.md §4 already warns about this. This cluster is where it costs the most, because these are the first screens a merchant sees.
3. **Off-token colour.** `#00FFAE` (from the Vexel skin) and `#0E805C` (the till) sit beside `--atlas` and `--mint`. The brand has one mint; the skin has added a second.
4. **French as the fallback language.** French literals sit in the HTML (`printer.html`, `kiwi-caisse.html:5727`, `kiwi-cuisine.html:729`). Every English page keeps a French `<title>` ("Tableau de bord commerçant", "Pont d'impression", "Équipe", "Démo commerçant"), and the desktop date is formatted in French. The i18n layer only translates strings someone remembered to add to the dictionary.
5. **Placeholders that look like answers.** `••••••••`, `••••`, `000000` and dark-grey example text appear on the sign-in page, the wizard and the team clock-in, so empty fields look filled.
6. **Defaults that write data.** "Restaurant" pre-selected, a 500 MAD float pre-selected, two empty team cards pre-inserted. Each turns "Continue" into a silent wrong answer.
7. **Native and web disagree on the basics.** Font (SF vs Inter Tight), icons (SF Symbols vs Material), appearance (always dark vs always light), back button (centred "Back" vs "‹ Back"), and setup duration ("about two minutes" vs "under 2 minutes").

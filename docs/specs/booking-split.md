# Public booking controller split

`assets/booking.js` remains the only booking script tag and the entry point. It
creates one private booking state owner (`getState()`), imports the five factories,
binds their declared dependencies, then starts the existing `init()` function.
Nothing is published on `window`. API requests, payloads and selectors are unchanged.

Each factory exports `create(context)` and returns a frozen method table. Its file
header and `context` destructuring declare its complete interface. Cross-module
calls go through the entry's forwarding functions; mutable search counters and the
party debounce timer stay private to their respective factory instances.

| Module | Owns | Reads from other owners |
| --- | --- | --- |
| booking-service.js | Services, covers, dates, slots, latest slot response | Shared state, view helpers, hotel date arithmetic, submission details |
| booking-hotel.js | Stay search, room results, photos, latest hotel response | Shared state, view helpers, submission details |
| booking-submission.js | Contact validation, service/hotel forms, POST and success | Shared state, storage/view helpers, search navigation, manage-link methods |
| booking-manage.js | Retained link, clipboard, GET/DELETE management and cancellation | Shared state, merchant/token, view helpers |
| booking-view.js | Dictionaries, locale/venue dates, layout, storage and language controls | Shared state, application element, declared flow navigation callbacks |

`tools/booking-split-test.mjs` proves the readable intermediate layout is token
identical and reconstructs the archived original from live module fragments, byte
for byte. `format.json` reverses only whitespace; `split.json` records exact moved
ranges and wrappers. The source helper never reads the original archive.
`tools/booking-boundary-test.mjs` checks unresolved dependencies, browser globals,
factory inputs and exports, including negative sibling-access probes.
Historical extraction tests use the reconstructed live lexical layout. The denied
storage boot and stale-response tests execute the live factories.

Restamp new modules with `node tools/bump-stamp.js --precache <files>`; later module
bumps cascade through booking.js to its shell. `--precache` explicitly adds files
to SHELL before stamping. Pin a previously unpinned split entry with
`KIWI_UPDATE_SIZE_BASELINE=1 node tools/file-size-ratchet-test.mjs assets/booking.js`.
Providing paths limits baseline updates to those files; existing pins only decrease.

Lead browser coverage: `booking-lens-browser-test.mjs`,
`keyboard-floor-booking-browser-test.mjs`,
`surface-matrix-states-booking-floor-browser-test.mjs`, and
`surface-matrix-apps-browser-test.mjs` (all under tools/).

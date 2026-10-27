# Team ownership split

C1-team moves existing bodies without changing merchant behavior. The proof in
`tools/team-owners-split-test.mjs` rebuilds the three pre-move sources from live
files, compares their frozen gzip archive and SHA-256, and checks every moved
fragment. `team-owners-test-source.cjs` also supplies those live bodies to older
source-extraction tests. It never reads the archive.

All four factories register on one `KiwiTeamParts` registry. Each publishes a
frozen `create(deps)` factory and returns a frozen instance. Their headers list
exports, lexical imports and window capabilities. The split manifest records
full capability paths, checked through the JavaScript AST, including private
Kiwi bridges. Sibling registry access is prohibited.

- `member-state.js` owns root initialization, account ownership, credential
  acknowledgement, local load/save, merge, hydration and server publication.
  `current()` returns the existing root by reference. Existing
  `window.__kiwiTeamV2` remains a compatibility alias for external readers;
  the three controllers read it through `current()`. `saveCustomTeams()` keeps
  the existing local write, till publication and cloud push sequence.
  `persistTeams()` remains local only. `setPageActive()` supplies the existing
  page lifecycle flag; `resetReadFailure()` clears its existing timeout flag.
- `venue-scope.js` owns team keys, persistability, authenticated store slugs,
  member ownership and document scoping. It receives merge/cleanup callbacks.
- `invitations.js` owns onboarding member import, its role map and generated
  credential helper. It receives the state owner's methods via core relays,
  stable avatar tones, and the page activity notification.
- `roster-list.js` owns filtering, list/header rendering and public read-only
  roster, day/planning/booking coverage and labour queries. It receives state
  accessors, formatting helpers, the stable filter object and icon names.
  `setActiveTab()` keeps its list guard synchronized with the existing tab.

`team.js` retains navigation, live polling, period/payroll helpers and styles.
The existing profile and hours bridges forward to the same member-state
instance (`Kiwi.__teamMemberState`). The generated KiwiStaffCredential copy
in profile-ui.js stays in place.

The existing team.js startup slot uses type="module" and statically imports
its four factories. Profile and hours retain their following deferred slots.
Parser-inserted modules and deferred classic scripts use the same ordered
post-parse queue, preserving startup readers and handler adapters:
https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element
No shell script tags were added. New assets enter offline SHELL using
bump-stamp's --precache option; later stamps follow their static imports.

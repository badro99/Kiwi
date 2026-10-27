# Stock boundaries

`stock.js` keeps navigation, rendering dispatch, catalogue filters and the recipe
bridge. Existing factories register through `KiwiStockInternal.install(name, S)`.
They receive only the bridge; they never import a sibling's private bindings.

| Module | Exports | Reads |
| --- | --- | --- |
| `state.js` | `KiwiStockState(read)` creates one frozen owner with `ledgerOpeningFor`, `moveStock`, `moveRetailStock`, `countStock`, `overrides`, `counts`, `replaceCounts`, `countsFetchedAt`, `markCountsFetched`, `fetchServerCounts`, `stIntakePostAll`, `stLegacyPostAll` | Explicit callback dependencies at the top of the file; Inventory and Procurement services; existing count fetch path; receipt helpers injected by intake |
| `overview.js` | Overview/KPI/delivery renderers, delivery calculations and day detail | Destructured `S` dependencies; browser services recorded in the split contract |
| `alerts.js` | Supplier evidence, alert derivation, ignored-alert persistence, mark-86 modal and alert cards | Destructured `S` dependencies; browser services recorded in the split contract |
| `movements.js` | Movement labels, item history and journal renderers | Destructured `S` dependencies; Inventory service as declared in the split contract |

The owner exists before synchronous recipe reads. Its factory is an ordered
startup dependency immediately before `stock.js`; UI factories use the existing
lazy registry. There are no new tags in any HTML shell.

`stockScope` adapts existing count-cache accesses to named owner methods. The
legacy stock overlay is the object returned by `overrides()`, retaining its
identity for catalogue/intake code. No new global is published per state field.
Receipt posting retains its prepare, ledger acknowledgement and procurement
paths. `stIntakePostAll(S, helpers)`, `stLegacyPostAll(S, helpers)` and `fetchServerCounts(S, helpers)` bind and
return the unchanged transport functions; the originating factory forwards calls.

`tools/fixtures/stock-controller/split.json` is the exact export/read contract.
`stock-controller-split-test.mjs` checks it, rejects undeclared globals and bridge
reads, and rebuilds all four pre-split files from live bodies. The source adapter
also feeds the older split, string, UI and property suites. Recipe-unit generated
markers and copies are untouched.

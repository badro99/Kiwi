# Kiwi ticket UI QA

`node tools/kiwi-ui-qa-mcp/server.js` is a local stdio MCP browser driver. It
lets agents verify that a fix is **reachable through the rendered Kiwi UI**,
not just that an API or source-level test passes. `.mcp.json` registers it as
`kiwi-ui-qa`; other MCP clients can use the same command. Install the repo's
declared browser dependency with `cd app && npm ci` and provide local Chromium
(`KIWI_CHROMIUM_BIN` if it is not discoverable).

Codex CLI can register the same local server in `~/.codex/config.toml`:

```toml
[mcp_servers.kiwi-ui-qa]
command = "node"
args = ["/Users/zaka/Developer/kiwi/tools/kiwi-ui-qa-mcp/server.js"]
```

Other stdio MCP clients use that command too. The server is local; no ticket
or merchant credential belongs in its configuration.

The current interactive fixture covers the **hotel dashboard**: a real
`dashboard.html`, real hotel API handlers, and a file-backed SQLite database
for a clearly synthetic merchant. It starts in a fresh Chromium context,
enters only the fixture PIN, and blocks **all non-loopback requests**. It
cannot see or change a production merchant, enter a real PIN, or use the
private agent API key. The prior test harness's handler fallbacks are **not**
available here: clicks use visible elements in Chromium. If the target control
is missing or obscured, the ticket test fails—this is the point.

## Ticket workflow

1. Read a ticket as text with `kiwi-tickets.get_ticket`; view its screenshots
   only when necessary. State the visible starting point and expected result.
2. Reproduce the problem in a fixture. For hotel UI tickets call
   `start_hotel_fixture`, `ui_snapshot`, then `ui_click`, `ui_fill`, or
   `ui_select`, `ui_scroll`, or `ui_viewport` using the current `q` refs. A new snapshot follows every
   interaction. No arbitrary JavaScript, URL navigation, direct API call, or
   handler invocation is exposed by this MCP.
3. Fix the defect, run focused tests and `node tools/check.js`, commit the
   scoped change, and **re-run the exact UI journey on the committed tree**.
   Use `ui_assert` for the specific rendered outcome, `ui_reload` for
   persistence, and `ui_screenshot` only when pixels are needed. Verify
   visible reachability, the actual action, errors and the success state.
4. Call `finish_ui_proof({ticketId,expectedOutcome})`. It refuses to create a
   proof without a real click and a passing text/value assertion. It writes a
   screenshot and `proof.json` to a private OS temporary directory. The proof
   records actions, assertions, synthetic origin, ticket, timestamp, commit,
   and whether the tree was dirty. Inspect it and include the path in the
   ticket handoff; this is evidence, **not** a production deployment claim.
5. Confirm the pushed release and live asset/build separately. Then
   `kiwi-tickets.submit_for_testing({id,uiProofPath})` accepts a fresh,
   clean-commit proof. Truly backend-only tickets may use
   `backendOnlyReason` instead. This MCP never marks a ticket tested/done;
   the owner does that after live verification. Existing tickets already in
   “Requiring testing” are not moved by this workflow.

## Limits

This first fixture covers hotel reception and related hotel pages, **not**
the caisse, OrderPro, employee app, delivery, Shopify, or live owner UI. A
hotel proof must not be used to claim one of those paths was browser-tested.
Add a synthetic fixture and journey for each module before accepting a UI
ticket there; until then report the UI coverage gap explicitly and keep the
ticket for human verification. Do not work around an unreachable control by
calling a JS handler or API directly. A local browser proof is not the same as
physical-device or production merchant validation.

`proof.json` is a process-quality gate rather than a signed attestation; an
agent with filesystem access can forge it. The owner should still inspect the
actual screenshot/journey and independently verify on the deployed UI.

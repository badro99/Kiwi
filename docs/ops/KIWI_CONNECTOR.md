# Kiwi connector · Claude (and any MCP client) on a merchant's own data

Added 2026-10-10. Lets a merchant add Kiwi to claude.ai as a custom connector,
then ask Claude for a dashboard ("mes ventes du week-end par moyen de paiement")
built from their own store, live.

## For the merchant

1. claude.ai → Settings → Connectors → **Add custom connector**.
2. URL: `https://kiwi-os.com/api/agent/mcp`. No client id or secret to type.
3. Claude opens `kiwi-os.com/agent-connect.html`. Sign in with the **owner**
   account, pick the store, keep or change the permissions, **Autoriser**.
4. Back in Claude, the Kiwi tools are available. Disconnect any time on
   `agent-access.html` (the connection is listed as « Claude · connecteur … »).

Default permissions are read-only and carry no personal data: profile, daily
sales, payments, orders, catalogue, cash drawer, tables. Customer records,
hotel guests and the three writes (create client, note, task) must be ticked
explicitly. A connection lasts 30 days, then the owner approves again.

## How it works

| Piece | File |
|---|---|
| MCP endpoint (Streamable HTTP, JSON replies, stateless) | `functions/api/agent/mcp.js` |
| Tool catalogue, one scope per tool | `functions/api/agent/_tools.js` |
| OAuth metadata, PKCE, tables | `functions/api/agent/_oauth.js` |
| Client registration (RFC 7591, public clients) | `functions/api/agent/oauth/register.js` |
| Owner consent API | `functions/api/agent/oauth/authorize.js` |
| Code → token | `functions/api/agent/oauth/token.js` |
| Consent page | `agent-connect.html` |
| Discovery documents | answered in `functions/_middleware.js` |

The access token **is** an ordinary `kwa.` agent key in `agent_keys`. Every
tool call is forwarded to the existing gateway handlers (`query.js`,
`action.js`), which check the key, the per-tool scope, the tenant and the
bounds, and write `agent_audit`. The connector adds no data access of its own,
and the merchant is always the key's merchant.

Only the store's owner account can approve: not a till, a staff PIN, the
team passcode, or a God Mode operator. Password rotation, suspension, or an
ownership transfer between consent and exchange voids the pending code.

## Deploying

- `schema.sql` carries `agent_oauth_clients` and `agent_oauth_codes`; both are
  also created on first use, so an unmigrated D1 works. Verify on prod D1
  anyway (CLAUDE.md §3: prod lags the schema file).
- After the Cloudflare Pages build, check:
  `curl -s https://kiwi-os.com/.well-known/oauth-authorization-server` (JSON),
  `curl -si -X POST https://kiwi-os.com/api/agent/mcp -H 'Content-Type: application/json' -d '{}'`
  (401 with `WWW-Authenticate: Bearer resource_metadata=…`).
- Then a real end-to-end on **Amira Cafe** (the designated test venue) from
  claude.ai, and revoke the connection afterwards.

## Tests

`node tools/agent-mcp-remote-test.mjs` (wired into `tools/check.js`): discovery,
registration, owner-only consent, PKCE, single-use codes, scope-filtered
`tools/list`, tenant binding, revocation, epoch invalidation, and parity with
the local stdio client (`tools/kiwi-agent-mcp/server.js`).

## Not built

No refresh tokens (deliberate: the owner renews). No SSE stream (nothing to
push). No operator-wide connector: God Mode data stays in `kiwi-health.html`.

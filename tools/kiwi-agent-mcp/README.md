# Kiwi private agent access (MVP)

This is **not** the public tickets MCP. The tickets server remains separate.
The private agent gateway is at `/api/agent/*`; local stdio MCP maps six
bounded tools to it without browser clicks, PIN entry, or a full-page dump.

## Owner setup

1. Sign in as the actual owner, then open
   `https://kiwi-os.com/agent-access.html`. Choose a store, a label, scopes,
   and an expiry (maximum 90 days). Only a store with an explicit
   `merchant_config.account_id` matching the signed-in account can issue
   keys. An operator or till cannot mint one.
2. Copy the `kwa.` token **once**. Put it in a local secret manager. Never
   paste it into Git, a ticket, a screenshot, an agent chat, or a tracked MCP
   config. Losing it means revoke and rotate, not reveal.
3. This repo's `.mcp.json` registers `kiwi-agent` for Claude Code. Start the
   agent process with `KIWI_AGENT_TOKEN` inherited from your secret manager;
   the checked-in config intentionally contains no secret. Other runners can
   launch
   `node /Users/zaka/Developer/kiwi/tools/kiwi-agent-mcp/server.js` with
   `KIWI_AGENT_TOKEN` supplied as an environment variable from your secret
   manager. By default it calls `https://kiwi-os.com`; local tests can set
   `KIWI_AGENT_BASE=http://localhost:<port>`. Do **not** put a token in
   `KIWI_AGENT_BASE` or the URL.
4. The owner screen shows recent metadata-only actions and allows pause,
   resume, or irreversible revocation. A password/session-epoch rotation,
   account suspension, merchant ownership transfer, expiry, or revocation
   immediately invalidates the key.

The MCP tools are `merchant_overview`, `sales_summary`,
`catalog_search`, `hotel_stays`, `clients_search`, and
`create_client`. The only write needs `clients:create` and a stable,
16–100-character `requestId` reused on retries. Read tools have independent
scopes, at most 25 records and 31 days per call where applicable. Returned
customer/guest data is personal data; grant those scopes only when needed.
All actions are logged without search strings, result bodies or raw secrets.

Agent keys deliberately **cannot** call ordinary Kiwi APIs, use staff PIN
routes, take payments, edit stock, make reservations, issue refunds, or access
raw `store_docs` (which include staff codes). Do not add a generic proxy.
Each future action needs its own explicit scope, validation, idempotency,
auditing and tenant-isolation tests.

## Deployment

`schema.sql` contains both tables; owner-only key provisioning creates them
idempotently on older D1 databases. A bearer request to an unmigrated or
unavailable database fails closed. Code push is not deployment: confirm the
Cloudflare Pages build and the live asset/API before issuing real keys.
No production merchant data is touched by `tools/kiwi-agent-access-test.mjs`;
it uses in-memory SQLite.

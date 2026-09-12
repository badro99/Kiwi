# Kiwi Tickets — MCP server

A zero-dependency **stdio MCP server** that gives coding agents (Claude Code,
Codex, Gemini) cheap access to the shared problem board at
[kiwi-os.com/tickets](https://kiwi-os.com/tickets).

It is a thin wrapper over the public ticket API (`functions/api/tickets/*`), so
it needs no hosting and no credentials — just Node ≥ 18 and, for screenshot
downscaling, macOS `sips` (already present on this Mac).

## Why it saves tokens

- `list_tickets` / `get_ticket` return **text only**. Browsing the board is free.
- `view_ticket_image` returns actual pixels **only when you ask**, and downscales
  to ~1024px first (via `sips`), cutting a 2006×1018 screenshot to 1024×519 —
  roughly 4× fewer vision tokens per look. Pass `full:true` for original res.

## Tools

| Tool | Purpose |
|------|---------|
| `list_tickets({status?})` | Board summary. `status`: `open` (default), `problem`, `testing`, `done`, `all`. |
| `get_ticket({id})` | One ticket's full text + screenshot list. |
| `view_ticket_image({id, index?, maxSize?, full?})` | See screenshot(s). Omit `index` for all. |
| `create_ticket({body, imagePaths?})` | File a new problem (attach up to 6 local images). |
| `submit_for_testing({id,uiProofPath})` | Move a **solved** UI ticket to "Requiring testing" with a fresh, clean-commit rendered-UI proof from `kiwi-ui-qa`. |

For a genuinely backend-only ticket, use
`submit_for_testing({id,backendOnlyReason})` with a concrete explanation of
why a browser check is inapplicable. Do not use this exception for an
uncovered UI: add a synthetic UI fixture or leave the ticket for human testing.
The proof gate checks local evidence; it does **not** prove a Pages deployment
or merchant-device behavior. Confirm those separately before handing off.

### Agents never close a ticket

An agent that fixed something moves it to **Requiring testing** — nothing more.
Marking a ticket *tested* is a human judgement, and it also permanently deletes
the ticket's screenshots, so it stays on the board where the person who verified
the fix clicks it. `submit_for_testing` is deliberately the only status move this
server exposes; the API's `action:'tested'` is not wired to any tool.

## Register it

**Claude Code (this repo)** — already wired via the project `.mcp.json`; approve it
when prompted, or add it globally:

```bash
claude mcp add kiwi-tickets --scope user -- node /Users/zaka/Developer/kiwi/tools/tickets-mcp/server.js
```

**Codex** — in `~/.codex/config.toml`:

```toml
[mcp_servers.kiwi-tickets]
command = "node"
args = ["/Users/zaka/Developer/kiwi/tools/tickets-mcp/server.js"]
```

**Gemini CLI** — in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "kiwi-tickets": {
      "command": "node",
      "args": ["/Users/zaka/Developer/kiwi/tools/tickets-mcp/server.js"]
    }
  }
}
```

## Config (env)

- `KIWI_TICKETS_BASE` — origin to talk to (default `https://kiwi-os.com`). Point
  it at `http://localhost:8788` to test against `wrangler pages dev`.
- `KIWI_TICKETS_MAXPX` — default longest-edge px for downscaled images (default `1024`).

## Note

The board is deliberately **public and unauthenticated** (see
`functions/_middleware.js`). Screenshots are internal POS captures — treat
anything visible in them as sensitive, and never paste credentials into a ticket.

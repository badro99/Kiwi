# agent-e2e · bug-bash pilot

> **Parked (owner, 2026-10-12): do not run.** Every exploration spends Workers AI
> neurons, and the owner does not want to pay for this. The code stays as a reference;
> nothing runs it automatically and `check.js` does not call it.

An AI agent explores Kiwi's demo surfaces with a goal instead of a script, and reports
what looks wrong. Built on [tester-army/e2e](https://github.com/tester-army/e2e)
(Apache-2.0), installed here as dev tooling only. The repo root keeps its
zero-dependency `package.json`; this folder has its own, with exact versions and a
lockfile.

## What it touches, and what it can't

- **Demo data only.** Every target is the repo served by `serve.mjs` on a free
  loopback port. There is no `/api` behind it, so no merchant's hosted books are
  reachable from an exploration, by construction.
- **Never point it at kiwi-os.com or at a real merchant.** Amira Cafe is the only
  hosted testing account (CLAUDE.md §6), and this pilot does not use it. Hosted runs
  would need a signed-in session and the staff code as a secret handle; that is a
  separate decision.
- **The model is Workers AI** (`@cf/zai-org/glm-5.3-flash`, the repo's `@cf/`-only
  policy), through its OpenAI-compatible endpoint. Change it with
  `KIWI_EXPLORE_MODEL`.
- **Telemetry to the e2e authors is off** in every script (`E2E_TELEMETRY_DISABLED=1`).
- **Cost.** The till's screen is about 300 accessibility nodes, and the agent reads
  it on every call. The first pilot charter used **2.2 million tokens in 13 model
  calls over 6.5 minutes**. Check the Workers AI bill before you run many charters.

## Run it

```bash
cd tools/agent-e2e
npm ci
export CLOUDFLARE_ACCOUNT_ID=…                        # npx wrangler whoami
export CLOUDFLARE_API_TOKEN="$(npx wrangler auth token)"   # a shell variable, never a file
node bug-bash.mjs --only till-ticket-totals --max-steps 3  # one charter, small budget
node bug-bash.mjs                                    # every charter, 2 at a time
```

The first run downloads Playwright's Chromium (about 150 MB) into
`~/Library/Caches/ms-playwright`. Output goes to `.e2e/bash/<date>/` (gitignored): one
folder per charter with its trace, screenshots and `report.json`, and a merged
`findings.md`.

One exploration on its own:

```bash
npx e2e explore 'Find how to split a bill on the till' --target caisse --agent newcomer --max-steps 4
```

## The method

A **charter** (`charters.json`) is a one-sentence goal for one area, with one target
and one **persona** (`e2e.config.ts`, `agents`):

| Persona | Looks for |
| --- | --- |
| `newcomer` | labels that mislead, steps a first-time merchant can't find |
| `numbers` | totals, counts and percentages that don't add up, MAD formatting, mixed languages |
| `edges` | empty, zero, negative and very long input, double taps, frozen screens |
| `reload` | state lost, duplicated or reverted across reloads and navigation |
| `default` | a careful general tester |

The `context` in `e2e.config.ts` tells every persona what is by design (no `/api`,
demo figures that move with the clock, the 05:00 business day, staff code screens it
must not guess). Add to it whenever a finding turns out to be a known cause, so the
next bash doesn't report it again.

## The proof rule

A finding is a lead, not a bug. For each one in `findings.md`:

1. **Rule out the known causes**: demo data, the explorer itself (it can't follow a
   new tab, for example), the static server, intended design.
2. **Write a test in `tools/` that fails because of it.** A real browser, real clicks,
   on the shipped files, wired into `tools/check.js`. Use `tools/browser-trace.mjs` so
   the failure leaves a trace.
3. **Only then call it a bug**, fix it, and watch the same test go green. Fill in
   `Proof:` with the test's name.

No failing test, no bug. That is how the first-visit double load was handled
(`tools/pwa-first-install-browser-test.mjs`): red with the traced stack before the
fix, green after.

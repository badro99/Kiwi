# Kiwi capacity testing

This suite answers two different questions without mixing their risk:

1. `production-readonly.js` measures the real Cloudflare Pages, Functions and D1 read path using Amira's public menu and booking availability. It contains no HTTP write call.
2. `local-operations.js` exercises the real Kiwi route modules against the in-memory `amira-loadtest` fixture: sales, live-feed reads, optimistic stock sync, external orders and signed Shopify webhook replays.

Never run operational writes against production or against a real merchant. `local-operations.js` refuses every target except `localhost` and `127.0.0.1`, then verifies the `X-Kiwi-Load-Fixture: amira-loadtest` response before starting.

## Install

Install [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) once:

```sh
brew install k6
```

## Production, read-only

Start with smoke, then baseline. Both use Amira only for public reads and never create an order, sale, booking or stock movement.

```sh
npm run load:prod:smoke
npm run load:prod:baseline
```

The larger profiles require a deliberate acknowledgement:

```sh
KIWI_PROFILE=capacity KIWI_PRODUCTION_ACK=amira-read-only \
  k6 run --summary-export=capacity-production.json tests/load/k6/production-readonly.js
```

Available profiles are `smoke`, `baseline`, `capacity`, `spike` and `soak`. The run aborts when the route failure rate exceeds 1%. Passing means the tested traffic shape met the committed thresholds; it does not prove an unlimited user count.

## Operational concurrency, synthetic data only

Terminal 1:

```sh
KIWI_LOAD_TEST=1 node tools/live-mock-server.mjs
```

Terminal 2:

```sh
npm run load:local:smoke
KIWI_PROFILE=capacity k6 run --summary-export=capacity-local.json tests/load/k6/local-operations.js
```

The database is SQLite in memory and disappears when the fixture server stops. Its ephemeral channel token and Shopify signing secret are generated on startup, returned only over loopback and never committed.

## Interpreting the result

- `http_req_duration p(95)`: 95% of requests completed within this time.
- `kiwi_*_duration`: endpoint-specific latency, so a fast cached page cannot hide a slow D1 route.
- `kiwi_route_failures` / `kiwi_operation_failures`: failed status or content checks.
- `kiwi_stock_conflicts`: expected 409 responses when two devices update the same document revision. They are safe only when clients merge and retry.
- Teardown assertions: all repeated channel and Shopify deliveries produced one order each, and every stock write reported as accepted remains present in the final document.

Keep production JSON summaries as CI or release artefacts, not in the repository. They describe a particular deployment, region and time, not a permanent capacity guarantee.

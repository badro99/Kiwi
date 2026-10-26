# Shopify · provider contract corpus

`2026-07.json` is an offline, documentation-shaped corpus, reviewed 26 October
2026. It contains no captured merchant data, credentials or live-provider claims.
Sources are the pinned official reference pages recorded in the JSON, including
[the inventory mutation](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities)
and [GraphQL response envelopes](https://shopify.dev/docs/api/admin-graphql/2026-07).

`shopify-sync-properties-test.mjs` replays every envelope through the real
`flushShopifyOutbox` on SQLite and rejects unexpected URLs, API versions, missing
idempotency directives, or incorrect CAS/quantity variables. Transport is closed:
no request goes to Shopify. Assertions cover the resulting queue/link state,
retry scheduling and successful acknowledgement, including HTTP-200 GraphQL
errors and partial null data. A mutation that discards provider `userErrors`
fails on the CAS case.

Before `reviewBy`, or whenever `SHOPIFY_API_VERSION`, scopes or GraphQL operations
change, compare the corpus with the versioned provider documentation, review
all request/response fields and error codes, then update the review dates. Do
not renew the date without that review. Add a case for every newly handled
provider failure. Documentation-shaped cases cannot certify the permissions or
throttle allocation of a particular installed shop; those remain deployment
observations, never a claim made by this offline gate.

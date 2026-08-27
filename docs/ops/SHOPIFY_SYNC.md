# Shopify inventory connector

The merchant sees one control inside **Dashboard → Integrations → Shopify**. It
is a standalone/API-only Shopify app, not a second merchant dashboard.

## Authority and safety contract

- Kiwi is the source of truth for `available` inventory.
- Version one synchronizes one Shopify location per Kiwi merchant.
- Exact unique barcode wins; exact unique SKU is the fallback. Names never
  create a link.
- A Kiwi sale succeeds locally even if Shopify is unavailable. The target
  quantity enters `shopify_sync_outbox`, is attempted with `waitUntil()`, and is
  retried by the minute Worker.
- Every Admin GraphQL inventory write carries an idempotency key and
  `changeFromQuantity`. A concurrent Shopify edit becomes `drift`; it is not
  silently overwritten.
- Shopify order webhooks apply one `vente` movement to the linked Kiwi variant.
  The movement id is deterministic, so webhook retries cannot deduct twice.
  This inbound path never enters the outbound queue.

## Shopify Dev Dashboard

Create one public-distribution app with limited listing visibility while the
pilot runs. The app can remain API-only; there is no embedded Shopify UI.

- App URL: `https://kiwi-os.com`
- Allowed redirect: `https://kiwi-os.com/api/shopify/callback`
- Scopes: `read_products,read_inventory,write_inventory,read_orders`
- Use expiring offline tokens.

The OAuth callback creates shop-specific `orders/create`,
`inventory_levels/update`, and `app/uninstalled` webhook subscriptions pointing
to the existing narrow `/api/channel/shopify/<link>` receiver.

## Cloudflare Pages configuration

Add encrypted variables/secrets to the production Pages project and redeploy:

- `SHOPIFY_CLIENT_ID` — Shopify app client id
- `SHOPIFY_CLIENT_SECRET` — Shopify app secret
- `SHOPIFY_TOKEN_KEY` — independent random secret, at least 32 bytes
- `SHOPIFY_APP_URL=https://kiwi-os.com`

`SHOPIFY_TOKEN_KEY` is hashed into an AES-256-GCM key. Access and refresh tokens
are encrypted before D1 writes and are never returned by an API.

Apply the additive production migration:

```sh
npx wrangler d1 execute kiwi-sales --remote \
  --file=migrations/2026-08-27-shopify-inventory-sync.sql
```

## Retry Worker

Copy `tools/shopify-sync-worker/wrangler.example.toml` to an ignored local
`wrangler.toml`, replace the D1 id, add the three Shopify secrets with
`wrangler secret put`, then deploy from that directory. The cron drains up to 50
coalesced variant targets each minute. `/health` exposes counts only, never
merchant names, products, tokens, or errors.

## Merchant rollout

1. Connect Shopify and approve permissions.
2. Choose one active Shopify location.
3. Review exact-match counts and unmatched/ambiguous rows.
4. Correct missing barcodes/SKUs on either side, then refresh.
5. Click **Activate and align inventory**. Only linked variants are written.
6. Watch pending, failed, and drift counts. **Reconcile now** refreshes Shopify
   quantities, rebuilds exact links, and then explicitly reapplies Kiwi stock.

The old manually configured order webhook remains supported. It is shown as a
legacy order connection and does not gain inventory access until OAuth is
completed.

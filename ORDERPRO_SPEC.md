# OrderPro — deploy spec

Everything here is **already written and merged**. What's left is the
infrastructure only you can do on the Cloudflare account: one SQL migration, one
R2 bucket, one deploy. Until then the whole feature fails soft — the dashboard,
the caisse, the QR self-order page and the site all behave exactly as they do
today, and no client sees a change.

**It builds on what you already shipped.** `/api/menu`, the `menus` table and the
public allow-list in `_middleware.js` are yours; OrderPro extends them rather than
adding a parallel set. There is no second catalogue endpoint and no second
published-menu table.

---

## What OrderPro is

One page — `OrderPro.html` — serves **every** client. The store's identity travels
in the NFC link, never in the file:

```
https://<domain>/order?s=<merchant-slug>&t=4        dine-in, table 4
https://<domain>/order?s=<merchant-slug>&m=takeout  takeaway (counter tag)
https://<domain>/order?s=<merchant-slug>            boutique / browse
```

`<merchant-slug>` is `slugMerchant(business name)` — the same key `sales`,
`pairings`, `menus` and `loyalty_clients` already use. So there is **no
per-client domain, no per-client build, no per-client deploy**. Making a new
client live is two steps: flip the god-mode toggle, write the tags.

A phone that tapped the tag in store A carries store A's slug, and every endpoint
scopes by it, so it can't see or order from store B.

Two verticals, chosen by the store's published `type`:

| Vertical | Flow |
|---|---|
| **restaurant** | menu → cart → order → caisse accepts → kitchen → ready |
| **boutique** | product list + barcode scan → price, sizes, stock. **No cart** — buying happens at the till. |

### How it relates to `kiwi-order.html` (the QR page)

They are siblings sharing one spine, not rivals:

- **`kiwi-order.html`** — your QR self-order page. Unchanged, ungated, still works
  for every merchant exactly as before.
- **`OrderPro.html`** — the NFC white-label app. Requires the paid `orderpro`
  flag, adds photos/video, the boutique vertical, and the order relay.

Both read the **same** `GET /api/menu`, so a merchant publishes their carte once
and both surfaces show it.

---

## The three brains and how they talk

```
  DASHBOARD  ───POST /api/menu───▶  D1 (menus)  ───GET /api/menu───▶  phone
   (brain)                                                             │
                                                              POST /api/order
                                                                       ▼
  CAISSE  ◀──GET /api/order/queue── D1 (orders) ◀─────────────────── the order
    │ staff accept
    └──POST /api/order/queue──▶ status ──GET /api/order──▶ phone shows the truth
```

All of it is **HTTP over the venue's WiFi**. No Bluetooth, no shared browser
storage, no manual export. The customer's phone and the till share nothing except
the backend.

---

## 1 · SQL migration (D1)

**One new table**, `orders`. Nothing existing is altered — `menus` is reused as-is.

```bash
wrangler d1 execute kiwi-sales --file=schema.sql --remote
```

`schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running it is
safe. The new block is under `── OrderPro · order relay ──`.

`menus` gains no columns. Two things now travel inside its existing `data` JSON,
both additive and backward-compatible with every menu published before them:

- items may carry `photo` / `video` — `/api/media/…` URLs, never bytes;
- when `type` = `'boutique'`, `data` holds **stock** instead of a carte
  (`{categories, products, variants, colors}`). `type` decides which sanitizer
  runs on read and write, so the two shapes can never be confused.

## 2 · R2 bucket for photos and videos

```bash
wrangler r2 bucket create kiwi-media
```

Bind it to the Pages project:

**Cloudflare Pages → Settings → Functions → R2 bucket bindings**
| Variable name | Bucket |
|---|---|
| `MEDIA` | `kiwi-media` |

**The binding name must be exactly `MEDIA`.** Without it `/api/media` answers
`503 {error:'no-media'}` and the dashboard tells the merchant "stockage média pas
encore activé" — the upload button stays visible and clickable either way, it
just can't store anything yet.

10 GB and egress are free at our scale. Enabling R2 asks for a card on file but
bills nothing here. No new secrets: `AUTH_SECRET` and the `DB` binding are reused.

## 3 · Deploy

Normal Pages deploy of `main`. A **fresh deployment** (not "Retry") is needed for
the new R2 binding to take effect.

---

## Endpoints

| Path | Method | Who | What | Status |
|---|---|---|---|---|
| `/api/menu` | GET | **public** | store's published carte **or** stock, + `orderpro` flag | extended |
| `/api/menu` | POST | session | dashboard publishes (carte or boutique stock) | extended |
| `/api/order` | POST | **public** | a phone places one order | new |
| `/api/order` | GET | **public** | status of ONE order id — `{status, number}` only | new |
| `/api/order/queue` | GET | staff gate | the caisse's incoming queue (full detail) | new |
| `/api/order/queue` | POST | staff gate | accept / ready / reject | new |
| `/api/media` | POST | session | upload a photo or video → returns a URL | new |
| `/api/media/<key>` | GET | **public** | serve an uploaded file | new |

## The gate carve-out — read this one carefully

Your existing allow-list gained three entries, on the same terms:

```js
if (isRead && (path === '/kiwi-order.html' || path === '/api/menu')) return next();   // yours
if (isRead && (path === '/OrderPro.html' || path === '/api/order' || path.startsWith('/api/media/'))) return next();
if (method === 'POST' && path === '/api/order') return next();
```

Deliberate properties:

- **Exact matches, not prefixes.** `/api/order` is open; `/api/order/queue` — the
  staff view that lists tickets with items and totals, and accepts them — is
  **not**, because nothing does a prefix match on it.
- **Only one public write**: `POST /api/order`. Everything else is GET/HEAD.
- **Allow-listed ≠ enabled.** `POST /api/order` independently refuses unless the
  merchant has Order Pro switched on.
- **The public GET on `/api/order` returns `{status, number}` and nothing else** —
  no items, no total, and only for an id the caller already holds. An id from
  store A read through store B's slug returns `not-found`.
- `/api/media/` is the one prefix, and only because uploaded files have generated
  keys. It is a read-only object fetch under a merchant-namespaced path.
- Published media URLs are validated to be same-origin `/api/media/…` on write, so
  a published menu can never point a stranger's phone at an external host.

`/order` is also rewritten (not redirected) to `/OrderPro.html`, so the query
survives and NFC tags carry a short URL — every byte counts on an NTAG213.

## The `orderpro` flag inverts the usual default

`merchant_config.features` normally means **"a missing key = the module is ON"**,
because those modules are part of the interface a client already pays for.

`orderpro` is the opposite: **missing = OFF**. It turns a stranger's phone into an
ordering terminal against the merchant, so it has to be explicitly `true`.

Turn it on per client in the operator console → **Order Pro** (last row, set apart
under the module list). That writes `features.orderpro = true` via the existing
`PUT /api/admin/config`. `functions/api/menu.js` and
`functions/api/order/index.js` enforce the same rule server-side — the switch is
the UI for it, not the guard.

`GET /api/menu` returns the flag as an additive `orderpro` field.
`kiwi-order.html` ignores it and is unaffected; `OrderPro.html` refuses to open
without it.

## Writing the NFC tags

Dashboard → **Menu** (or **Boutique**) → **Tags NFC**. The panel lists one link
per table plus the counter tag and, on Android/Chrome, writes the tag directly via
Web NFC. On iPhone the link is copied and written with the free **NFC Tools** app.
Stickers are NTAG213 (~$0.15 each). Lock each tag after writing.

## Test checklist against the deployed build

```bash
D=https://kiwi-maroc.pages.dev
M=<a-real-merchant-slug>

# 1. Flag OFF (default) → the carte still serves (your QR page keeps working),
#    but orderpro is false, so OrderPro refuses to open.
curl -s "$D/api/menu?merchant=$M"                  # …,"orderpro":false

# 2. Turn Order Pro ON in the operator console, then re-check
curl -s "$D/api/menu?merchant=$M" | grep -o '"orderpro":true'

# 3. The page loads with NO cookie at all (the carve-out working)
curl -s -o /dev/null -w '%{http_code}\n' "$D/order?s=$M&t=4"        # 200

# 4. The staff queue is NOT public
curl -s -o /dev/null -w '%{http_code}\n' "$D/api/order/queue?merchant=$M"  # 401

# 5. Place an order, then read it back publicly
ID=$(curl -s -X POST "$D/api/order" -H 'Content-Type: application/json' \
  -d "{\"merchant\":\"$M\",\"mode\":\"table\",\"table\":\"4\",\"total\":50,\"lines\":[{\"id\":\"x\",\"name\":\"Test\",\"qty\":1,\"unitPrice\":50}]}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s "$D/api/order?merchant=$M&id=$ID"          # {"ok":true,"status":"pending","number":N}

# 6. Media storage is live
curl -s "$D/api/media"                             # {"ok":true,"media":true}
```

Then the human half: open the caisse on a paired terminal → the **Commandes**
chip shows the pending order → **Accepter · envoyer en cuisine** → the phone's
screen changes to "Acceptée · en préparation" within ~5 s.

## Rollback

Set `features.orderpro = false` for the merchant in the operator console. The app
immediately refuses to open, orders are rejected with `403 orderpro-off`, and
nothing else in the product is touched — the QR page and the published carte keep
working. The `orders` table and the R2 bucket can stay; they cost nothing unused.

---

## Files

**New**
`OrderPro.html` · `functions/api/order/index.js` · `functions/api/order/queue.js` ·
`functions/api/media/index.js` · `functions/api/media/[[key]].js` ·
`assets/orderpro-publish.js` · `assets/orderpro-panel.js` · `assets/orderpro-inbox.js`

**Changed**
`functions/api/menu.js` (photo/video, boutique payload, `orderpro` flag) ·
`functions/_middleware.js` (3 allow-list entries + `/order` rewrite) ·
`schema.sql` (the `orders` table) · `kiwi-admin.html` (the toggle) ·
`dashboard.html` + `kiwi-caisse.html` (script tags) · `assets/menu-catalog.js` +
`assets/boutique-catalog.js` + `assets/pages-pro.js` (media fields and pickers) ·
`assets/pages-pro.css`

**Untouched** — `kiwi-order.html`, `assets/order-qr.js`, `dashboard2.html`,
`venues2.js`, `dateRange2.js`, `pressing.js`, `pressing-caisse.js`.

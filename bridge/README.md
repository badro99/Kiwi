# Kiwi Printer Bridge

A tiny helper you run on the computer next to your thermal printer. The Kiwi web
app sends it print jobs (receipts, kitchen tickets, barcode labels); the bridge
relays them to the printer over your local network. It runs quietly in the
background and only listens on **this** computer (`127.0.0.1`).

Why it exists: a browser cannot open a raw network socket to a printer at
`192.168.x.x:9100`. The bridge does that for it.

---

## What it is

- **Zero dependencies** — Node's built-in `http` + `net` only (plus `child_process`
  for the OS spooler route; still nothing from npm, so it packages into one binary).
- Listens on `http://127.0.0.1:9110` (loopback only — nothing on the LAN can reach it).
- Endpoints:
  - `GET /kiwi/ping` → `{ ok, name, version }` — how the app detects it.
  - `GET /kiwi/printers` → `{ ok, platform, printers[], default }` — the printers
    this computer already has installed.
  - `GET /kiwi/scan` → `{ ok, printers: [{ ip, port }], scanned, ms }` — sweeps this
    computer's own private subnet(s) for hosts answering on port 9100, so the app
    can offer the printer's IP instead of asking the owner to type it. On demand
    only, RFC1918 ranges only, one sweep at a time (`429 scan-busy` otherwise).
  - `POST /kiwi/print` → `{ ok, bytes, via }` or `502`. Two ways to name the target:
    - `{ printerIp, port?, dataB64 }` — relays to `printerIp:port` over TCP
      (port defaults to `9100`). `via: "tcp"`.
    - `{ printerName, dataB64 }` — hands the job to a printer the OS already has
      installed. `via: "os"`.

The Kiwi app builds the ESC/POS bytes (`assets/escpos.js`), base64-encodes them,
and POSTs them here.

### Relais cloud — imprimer depuis un iPad ou une tablette (v1.4)

A browser on an iPad cannot reach this bridge (it is on another machine), and
iOS has no Web Bluetooth / WebUSB either. So the caisse on the iPad **deposits**
the ESC/POS job on kiwi-os.com (`POST /api/print/jobs`) and this bridge, once
paired, **polls** for jobs every second (`GET /api/print/jobs` with its bearer
token) and pushes each one to the printer exactly like a local job — outbound
only, nothing listens on the shop network, no certificate, no PC IP to type.

Pairing, once per bridge:

1. In Kiwi (caisse or dashboard) → Imprimantes → **Relais Kiwi → Associer un pont**
   → a 6-digit code appears (valid 15 min, single use).
2. On the counter computer open **http://127.0.0.1:9110/** and type the code
   (or, if the caisse is open on that same computer, click **Associer ce pont
   maintenant** — no typing). Headless: `kiwi-printer-bridge --pair 123456`
   or `KIWI_RELAY_CODE=123456`.

The token is stored in `~/.kiwi-printer-bridge.json` (mode 0600), never printed.
`POST /kiwi/relay/unpair` (or the **Dissocier** button) forgets it; revoking the
bridge from Kiwi makes the bridge forget it by itself after three refusals.

Extra endpoints: `GET /kiwi/relay` (status), `POST /kiwi/relay/pair {code}`,
`POST /kiwi/relay/unpair`, `GET /` (the local status page). `/kiwi/ping` now
carries `relay:{paired, online, merchant, name}`. Env: `KIWI_RELAY_URL`
(default `https://kiwi-os.com`), `KIWI_BRIDGE_CONFIG` (config file path).

### Why the second route exists

The app's own transports (Bluetooth, WebUSB, and this bridge over TCP) all need
Kiwi to reach the printer itself. On the commonest setup in a Moroccan shop — a
USB thermal printer on a Windows till, installed the normal way — every one of
them fails: `usbprint.sys` owns the device so Chrome is refused the WebUSB claim,
there is no Bluetooth, and a USB printer has no IP. The printer works perfectly
for the rest of Windows and not at all for Kiwi.

`printerName` hands the bytes to the OS instead, through each platform's RAW
passthrough — `winspool.drv` (via PowerShell, Microsoft's own RawPrinterHelper
recipe) on Windows, `lp -o raw` on macOS/Linux. RAW matters: the driver passes
the bytes through untouched, so the cutter still cuts and the cash drawer still
kicks, which a browser print dialog cannot do.

The printer name arrives from the browser, so it never reaches a shell: there is
no shell (`execFile`/`spawn` with an argv array), PowerShell receives it as an
environment variable rather than as script text, and it is checked against the
real installed list first.

---

## Run it (development)

```bash
cd bridge
node server.js
```

You should see `kiwi-printer-bridge v1.4.0 listening on http://127.0.0.1:9110`.
In the Kiwi app, open **Connecter une imprimante** → the status flips to
**Bridge connecté**.

If 9110 is taken the bridge walks up to the next free port on its own, and the
web app only scans **9110–9114** — so a manual override must stay in that range:
`KIWI_BRIDGE_PORT=9112 node server.js`. A bridge on 9130 would run fine and
never be found.

---

## Build the installable binaries

Produces self-contained executables (no Node needed on the counter machine):

```bash
cd bridge
npm install          # dev-only: pulls `pkg`
npm run build        # → dist/kiwi-printer-bridge-{win,macos,linux}
```

Then publish `dist/*` as a GitHub Release and point the app's download links at it
(`assets/printer-bridge.js` → `BRIDGE_DOWNLOAD`).

### Install on the counter machine

- **Windows:** double-click `kiwi-printer-bridge-win.exe`. On the blue
  "Windows protected your PC" screen, click **More info → Run anyway** (the app is
  not yet code-signed). To auto-start at login: `Win+R` → `shell:startup` → drop a
  shortcut to the `.exe` there.
- **macOS:** move it to Applications, then right-click → **Open** the first time
  (Gatekeeper blocks unsigned apps on double-click). Add it to **Login Items** to
  auto-start.
- **Linux:** `chmod +x kiwi-printer-bridge-linux && ./kiwi-printer-bridge-linux`.

---

## Follow-ups before shipping to real merchants

- **Code-sign** the Windows (`.exe`) and macOS builds so Gatekeeper/SmartScreen
  stop warning. This needs a paid Apple Developer cert + a Windows Authenticode
  cert — do it before wide distribution.
- **Auto-update / auto-launch** packaging (e.g. a proper installer) so non-technical
  owners never touch a terminal.
- ~~**Printer discovery** so the app can suggest the printer IP instead of asking
  the owner to type it.~~ Shipped in v1.3.0 (`GET /kiwi/scan`, port-9100 sweep of
  the local subnet). mDNS/Bonjour name resolution would still be a nice upgrade.

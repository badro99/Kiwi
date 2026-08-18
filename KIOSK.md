# Keeping a till on the caisse screen — kiosk setup

Goal: the merchant flips the power switch and the till comes back on the Kiwi
caisse. No desktop, no browser chrome, no "which app was I in", no sleeping
screen — after a power cut, after a nightly shutdown, after anything.

**The honest boundary.** No web page can relaunch itself after the machine is
switched off, on any OS. "Open this on boot" is an operating-system setting, and
`requestFullscreen()` is refused unless a person just touched the screen — which
is exactly why the browser has to be *launched* in kiosk mode rather than asked
to go fullscreen afterwards. So the last step is always one OS configuration,
done once per till by whoever installs it. Everything the app itself can carry,
it now carries (see *What the app does on its own*, below).

The URL to pin, in every recipe below:

```
https://kiwi-os.com/kiwi-caisse.html
```

---

## What the app does on its own

Already true, no setup:

- **The screen stays awake.** The caisse holds a screen wake lock for as long as
  it is the visible tab, and re-takes it when the till comes back to the
  foreground. Without this the OS lock screen slides in front of the caisse,
  which for a cashier is the same failure as the app being closed.
- **Fullscreen is remembered.** Turn it on once from **Plein écran** in the left
  rail; the till re-enters fullscreen at the first touch after every restart.
  Turning it off is remembered too. (First touch, not boot — the browser will
  not grant fullscreen without a gesture. A kiosk-launched browser skips this
  entirely, which is the better setup.)
- **The login survives restarts.** Merchant and staff sessions now slide: any
  till used at least once a fortnight stays signed in indefinitely. A till left
  untouched for 30 days still expires, as before.
- **It runs offline.** The caisse is a PWA with a service worker; a dropped line
  does not blank the screen.

What it still cannot do: start itself. That is the rest of this document.

---

## Windows

The common Moroccan till. Two ways, pick by Windows edition.

**A · Assigned Access — Pro / Enterprise, the robust one.**
Settings → Accounts → Other users → **Set up a kiosk**. Choose Microsoft Edge,
give it the URL, pick the fullscreen kiosk type. Windows creates a local account
that auto-signs-in, boots straight into that one app, and cannot be alt-tabbed
out of. Survives reboot by design.

**B · Startup shortcut — any edition, including Home.**
1. Give the till a local user with automatic sign-in (`netplwiz` → untick
   *Users must enter a user name and password*).
2. Press `Win+R`, run `shell:startup`, and drop a shortcut in it:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk https://kiwi-os.com/kiwi-caisse.html --edge-kiosk-type=fullscreen --no-first-run
```

Chrome instead of Edge:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=https://kiwi-os.com/kiwi-caisse.html
```

3. Stop the machine sleeping:

```
powercfg /change monitor-timeout-ac 0
```

```
powercfg /change standby-timeout-ac 0
```

If the till prints through the **Kiwi Printer Bridge**, give it a startup
shortcut in the same folder, or install it as a service — otherwise printing is
dead until someone launches it by hand.

## Android tablet

1. Open the URL in Chrome → menu → **Install app**. The manifest is already
   `display: fullscreen`, so the installed app has no browser bar.
2. Lock the device to it. Either a kiosk launcher with a start-on-boot option
   (Fully Kiosk Browser is the usual retail choice), or — cleaner for a fleet —
   enrol the tablet as an Android Enterprise **dedicated device** through an EMM,
   which pins it to one app and restores that state after a reboot.
3. Settings → Display → **Screen timeout** → longest available. The app's wake
   lock covers the rest.

⚠️ The built-in **App pinning** (Settings → Security → App pinning) is *not* the
answer here — it does not survive a reboot, so the first power cut drops the till
back to the launcher.

## iPad

**Single App Mode** is the only iPad setup that meets the requirement. It needs
the iPad to be *supervised* — Apple Configurator 2 over USB is enough for one or
two devices, an MDM for a fleet. Once set, the iPad boots into the app and cannot
leave it.

Then Settings → Display & Brightness → **Auto-Lock → Never**.

**Guided Access** (Settings → Accessibility → Guided Access) is the fallback when
supervision isn't available, but plan for someone having to re-arm it after a
power off — test that on the actual device before promising a merchant it holds.

## macOS

1. System Settings → Users & Groups → **Automatically log in as** the till user.
2. System Settings → General → Login Items → add a small launcher app or script:

```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk --app=https://kiwi-os.com/kiwi-caisse.html
```

3. System Settings → Lock Screen → turn off display sleep and the screen-saver
   password.

## Linux

`~/.config/autostart/kiwi-caisse.desktop`:

```
[Desktop Entry]
Type=Application
Name=Kiwi Caisse
Exec=chromium --kiosk --app=https://kiwi-os.com/kiwi-caisse.html
X-GNOME-Autostart-enabled=true
```

Disable screen blanking (`xset s off -dpms` in the session startup, or the
desktop's power settings).

---

## What the merchant sees after a restart

The **caisse PIN pad** — not an open register. That is deliberate: a till that
boots straight into a live cash drawer is a cash-handling risk, and the PIN is
what ties each sale to a cashier. "Always on the caisse screen" means the till's
own unlock screen, reached without anyone touching a browser or a desktop.

## Checking it actually works

Don't test with a reload — test with the power switch.

1. Set it up, then **shut the machine down properly** and power it back on.
   Confirm it lands on the caisse PIN pad with no browser chrome visible.
2. **Pull the plug** with the app open, then power on. Same result.
3. Leave it idle for longer than the OS screen timeout. The screen should stay
   lit; if it sleeps, the wake lock isn't held — check the till is the visible
   tab and not a background window.
4. Try to leave the app: swipe, alt-tab, the Windows key. Nothing should escape.

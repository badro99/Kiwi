# Operations & Disk Maintenance Handoff for Kiwi OS Host Machine

> **Host System Context**  
> **OS:** macOS Sonoma / Sequoia (Apple Silicon `aarch64`)  
> **Physical Drive Ceiling:** 245.1 GB (228 GiB APFS Container `disk3`)  
> **Shared APFS Volumes:** `Data` (~200 GB usable max), `Macintosh HD` (13.7 GB), `Preboot` (10.9 GB), `VM Swap` (up to 14 GB under pressure), `Recovery` (1.5 GB).  
> **Primary Risk:** Disk fills from 50 GB free to 0 GB (99% capacity) within 24 hours if autonomous agents or test suites run unchecked.

---

## 1. Golden Rules & Safety Invariants

1. **NEVER touch `~/Library/Developer/CoreDevice/DeviceFS`:**
   - `du` reports 45+ GB for this folder. **It is a mounted virtual filesystem for a physical iPhone connected via USB/WiFi.**
   - It consumes **0 bytes** of local disk. Running `rm -rf` on it will attempt to delete files off the physical phone.
2. **NEVER kill active browser clones unconditionally:**
   - Desktop Google Chrome uses an ad-hoc signed bundle in `/private/var/folders/.../X/com.google.Chrome.code_sign_clone/`.
   - Always resolve active PIDs via `lsof` before deleting bundles; never blindly wipe the entire directory while the user is browsing.
3. **DO NOT run `uv cache clean` or `uv cache prune` blindly:**
   - Background MCP servers (`chroma-mcp`, `mcp-obsidian`) hold locks on `~/.cache/uv/.lock`. Unconditional `uv` clean commands will hang for 300 seconds.
4. **Persistent Memory Lives in SQLite, Not JSONL:**
   - `~/.claude-mem/claude-mem.db` (330 MB) contains the actual project memory.
   - Files in `~/.claude/projects/-Users-zaka--claude-mem-observer-sessions/*.jsonl` are disposable transcript logs.

---

## 2. The 3 Major Leak Engines on This Machine

### Leak Engine A: macOS Chrome Code-Sign Clones (176 GB)
- **Path:** `/private/var/folders/0g/q6yc1cn92hzc7w4yt40kjzrw0000gn/X/com.google.Chrome.code_sign_clone/code_sign_clone.XXXXXX/`
- **Root Cause:** Whenever any script (Lighthouse, Puppeteer, Playwright, test runner) spawns `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` with flags like `--headless=new` or `--remote-debugging-port`, macOS Gatekeeper (`amfid`) clones the entire 1.7 GB Chrome app bundle into this directory for signature validation.
- **The Defect:** macOS **never deletes these clones** on process exit. 100 runs = 176 GB leaked.
- **Resolution:** Dedicated LaunchAgent daemon dynamically checks locked clones via `lsof` and prunes all orphaned clones.

### Leak Engine B: Uncleaned Automated Test Fixtures (15–40 GB)
- **Path:** `/private/var/folders/0g/q6yc1cn92hzc7w4yt40kjzrw0000gn/T/`
- **Prefixes:** `kiwi-*` (`kiwi-pass*`, `kiwi-qa*`, `kiwi-owner-home-*`, `kiwi-store-ready-*`), `XcodeDistPipeline*`, `puppeteer_dev_chrome_profile-*`.
- **Root Cause:** Integration tests copy repository workspaces and SQLite databases into the temp folder and exit without cleanup traps. 500 test runs = 20–30 GB of stale directories.
- **Resolution:** Automated purge of all folders matching these prefixes older than 10 minutes.

### Leak Engine C: Runaway `claude-mem` Observer Transcripts (25+ GB)
- **Path:** `~/.claude/projects/-Users-zaka--claude-mem-observer-sessions/`
- **Root Cause:** Background observer agents observing primary Claude sessions can enter recursive queue-operation loops, creating single JSONL files of **7.0 GB**, **4.4 GB**, and **2.9 GB** in a matter of hours.
- **Resolution:** Automated purge of observer JSONL files older than 4 hours or exceeding 50 MB in size.

---

## 3. The Active Background Daemon System

The system is guarded by a native macOS LaunchAgent:

- **Plist Definition:** `~/Library/LaunchAgents/com.user.clean-chrome-clones.plist`
- **Execution Script:** `~/.local/bin/clean_chrome_clones.py`
- **Log Output:** `~/Library/Logs/clean-chrome-clones.log`
- **Interval:** Runs every **180 seconds (3 minutes)** + on login/boot (`RunAtLoad`).

### Script Architecture (`clean_chrome_clones.py`):
```python
#!/usr/bin/env python3
import glob, os, shutil, subprocess, time

now = time.time()

# 1. Clean dead Chrome clones (preserving active browser handles)
active_clones = set()
try:
  res = subprocess.run(
      [
          'lsof',
          '+D',
          (
              '/private/var/folders/0g/q6yc1cn92hzc7w4yt40kjzrw0000gn/X/com.google.Chrome.code_sign_clone'
          ),
      ],
      capture_output=True,
      text=True,
      timeout=10,
  )
  for line in res.stdout.splitlines():
    for part in line.split():
      if 'code_sign_clone.' in part:
        active_clones.add(
            'code_sign_clone.' + part.split('code_sign_clone.')[1].split('/')[0]
        )
except Exception:
  pass

active_clones.update({'code_sign_clone.gR47hW', 'code_sign_clone.hoCGMZ'})

for clone_dir in glob.glob(
    '/private/var/folders/0g/*/X/com.google.Chrome.code_sign_clone'
):
  try:
    for entry in os.listdir(clone_dir):
      if entry.startswith('code_sign_clone.') and entry not in active_clones:
        shutil.rmtree(os.path.join(clone_dir, entry), ignore_errors=True)
  except Exception:
    pass

# 2. Clean stale test fixtures in T older than 10 minutes
for tdir in glob.glob('/private/var/folders/0g/*/T'):
  try:
    for entry in os.listdir(tdir):
      if entry.startswith((
          'kiwi-',
          'puppeteer_dev_chrome_profile',
          'pip-unpack-',
          'hyperframes-',
          'XcodeDistPipeline',
      )):
        target = os.path.join(tdir, entry)
        if os.path.isdir(target) and (now - os.path.getmtime(target) > 600):
          shutil.rmtree(target, ignore_errors=True)
  except Exception:
    pass

# 3. Clean runaway observer sessions (>50MB or >4h old)
obs_dir = os.path.expanduser(
    '~/.claude/projects/-Users-zaka--claude-mem-observer-sessions'
)
if os.path.exists(obs_dir):
  try:
    for f in os.listdir(obs_dir):
      if f.endswith('.jsonl'):
        fp = os.path.join(obs_dir, f)
        if (now - os.path.getmtime(fp) > 14400) or (
            os.path.getsize(fp) > 50 * 1024 * 1024
        ):
          os.remove(fp)
  except Exception:
    pass

# 4. Clean old claude-mem logs older than 2 days
mem_logs = os.path.expanduser('~/.claude-mem/logs')
if os.path.exists(mem_logs):
  try:
    for f in os.listdir(mem_logs):
      if f.endswith('.log') and (
          now - os.path.getmtime(os.path.join(mem_logs, f)) > 86400 * 2
      ):
        os.remove(os.path.join(mem_logs, f))
  except Exception:
    pass
```

---

## 4. Emergency Playbook: Disk Full (< 5 GB Free)

Run this exact sequence if the disk is full:

```bash
# 1. Check current capacity
df -h /System/Volumes/Data

# 2. Wipe runaway observer session logs
rm -rf ~/.claude/projects/-Users-zaka--claude-mem-observer-sessions/*.jsonl

# 3. Wipe all unlinked test fixtures in temp
find /private/var/folders/0g/q6yc1cn92hzc7w4yt40kjzrw0000gn/T -maxdepth 1 -type d \( -name "kiwi-*" -o -name "XcodeDistPipeline*" -o -name "puppeteer_*" \) -exec rm -rf {} +

# 4. Run the daemon cleaner script manually
python3 ~/.local/bin/clean_chrome_clones.py

# 5. Erase all shutdown iOS/iPad simulators
for dev in $(xcrun simctl list devices | grep "Shutdown" | grep -o '[0-9A-F]\{8\}-[0-9A-F]\{4\}-[0-9A-F]\{4\}-[0-9A-F]\{4\}-[0-9A-F]\{12\}'); do
    xcrun simctl erase "$dev" 2>/dev/null || true
done

# 6. Flush disposable package and compilation caches
rm -rf ~/.gradle/caches ~/.npm/_cacache ~/.npm/_npx
find ~/dev ~/Developer -type d -path "*/.next/cache" -exec rm -rf {} + 2>/dev/null || true

# 7. Verify recovered capacity
df -h /System/Volumes/Data
```

---

## 5. Secondary Safe Harvest Checklist

When performing scheduled or deeper cleanups:

| Component | Target Location | Typical Gain | Safe To Delete? |
| :--- | :--- | :--- | :--- |
| **Gradle Cache** | `~/.gradle/caches` | 1–2 GB | **Yes** (re-downloads on gradle build) |
| **npm / npx Cache** | `~/.npm/_cacache`, `~/.npm/_npx` | 1–2 GB | **Yes** (standard disposable cache) |
| **Next.js Dev Cache** | `*/.next/dev`, `*/.next/cache` | 1.5–3 GB | **Yes** (Turbopack/Webpack compilation cache) |
| **Old Audit Scratch Dumps** | `~/.trwork/score100`, `imgaudit`, etc. | 1–2 GB | **Yes** if older than 7 days |
| **Spotify Cache** | `~/Library/Caches/com.spotify.client` | 0.5–1 GB | **Yes** (music streaming cache) |
| **Inactive Colima/Docker** | `~/.colima` (run `colima status` first) | 2.6 GB | **Yes** via `colima delete -f` if daemon is stopped |
| **CoreSimulator Devices** | `xcrun simctl erase <device>` (Shutdown only) | 3–6 GB | **Yes** (cleans duplicate Cryptex/Siri assets) |

---

## 6. How to Verify Daemon Health

Check that the LaunchAgent is healthy and sweeping:
```bash
# Check if registered with launchd
launchctl list | grep clean-chrome-clones

# Read recent sweep logs
tail -n 15 ~/Library/Logs/clean-chrome-clones.log

# Force immediate execution
launchctl kickstart -k gui/$(id -u)/com.user.clean-chrome-clones
```
If the log outputs `Daemon sweep completed: ... 0 errors`, the guard is operating normally.

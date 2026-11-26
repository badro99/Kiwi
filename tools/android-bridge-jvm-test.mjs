#!/usr/bin/env node
/* tools/android-bridge-jvm-test.mjs · the Android print bridge's own Java,
 * compiled and run against fake printers.
 *
 * Until 26 Nov 2026 nothing ever ran this code: android-print-bridge-test only
 * searches the sources for strings, so the missing write deadline that froze
 * Pasta Corner's bridge for twelve minutes passed every check. This suite
 * compiles RelayClient.java and LoopWatchdog.java as shipped (android.util.Base64,
 * org.json and BridgeStore replaced by small stand-ins, nothing else) and drives
 * them against real TCP sockets:
 *   · a healthy printer                        → printed, bytes intact
 *   · a printer that accepts and never reads    → uncertain within the 8 s deadline
 *   · a refused connection                      → failed at once (server requeues)
 *   · abortPrinter() from another thread         → unblocks a stuck write at once
 *   · the watchdog                               → abort at 75 s, restart at 150 s
 *   · the update offer and the poll pacing       → bounded and from kiwi-os.com only
 *
 * Needs a JDK (javac + java). Found from JAVA_HOME, PATH or Homebrew's openjdk.
 * Without one it prints « ○ skip: jdk unavailable » and check.js fails the run.
 * GitHub Actions runs it on every bridge change (.github/workflows/android-bridge.yml).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'bridge/android/app/src/main/java/com/kiwios/printbridge');

function findJdk() {
  const homes = [process.env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home'].filter(Boolean);
  for (const h of homes) {
    const javac = path.join(h, 'bin', 'javac'), java = path.join(h, 'bin', 'java');
    if (fs.existsSync(javac) && fs.existsSync(java)) return { javac, java };
  }
  const probe = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (probe.status === 0) return { javac: 'javac', java: 'java' };
  return null;
}
const jdk = findJdk();
if (!jdk) {
  console.log('○ skip: jdk unavailable · install a JDK (brew install openjdk@21) or set JAVA_HOME; GitHub Actions runs this suite on every bridge change');
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-bridge-jvm-'));
const put = (rel, text) => { const p = path.join(work, 'src', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
try {
  put('org/json/JSONObject.java', `package org.json;
import java.util.*;
public class JSONObject {
  final Map<String,Object> m = new HashMap<>();
  public JSONObject() {}
  public JSONObject(String s) {}
  public JSONObject put(String k, Object v) { m.put(k, v); return this; }
  public JSONObject put(String k, int v) { m.put(k, v); return this; }
  public JSONObject put(String k, long v) { m.put(k, v); return this; }
  public JSONObject put(String k, boolean v) { m.put(k, v); return this; }
  public String optString(String k) { Object v = m.get(k); return v == null ? "" : v.toString(); }
  public String optString(String k, String d) { Object v = m.get(k); return v == null ? d : v.toString(); }
  public String getString(String k) { return optString(k); }
  public int optInt(String k) { return optInt(k, 0); }
  public int optInt(String k, int d) { Object v = m.get(k); return v instanceof Number ? ((Number) v).intValue() : d; }
  public boolean optBoolean(String k) { return Boolean.TRUE.equals(m.get(k)); }
  public JSONObject optJSONObject(String k) { Object v = m.get(k); return v instanceof JSONObject ? (JSONObject) v : null; }
  public JSONArray optJSONArray(String k) { Object v = m.get(k); return v instanceof JSONArray ? (JSONArray) v : null; }
}`);
  put('org/json/JSONArray.java', 'package org.json;\npublic class JSONArray { public int length() { return 0; } public JSONObject getJSONObject(int i) { return null; } }\n');
  put('android/util/Base64.java', 'package android.util;\npublic class Base64 { public static final int DEFAULT = 0; public static byte[] decode(String s, int f) { return java.util.Base64.getDecoder().decode(s); } }\n');
  put('com/kiwios/printbridge/BridgeStore.java', 'package com.kiwios.printbridge;\nfinal class BridgeStore { static final String RELAY = "http://127.0.0.1:1"; }\n');
  fs.copyFileSync(path.join(SRC, 'RelayClient.java'), path.join(work, 'src/com/kiwios/printbridge/RelayClient.java'));
  fs.copyFileSync(path.join(SRC, 'LoopWatchdog.java'), path.join(work, 'src/com/kiwios/printbridge/LoopWatchdog.java'));
  put('com/kiwios/printbridge/Harness.java', `package com.kiwios.printbridge;
import org.json.JSONObject;
import java.io.*; import java.net.*; import java.util.*;
public class Harness {
  static int pass = 0, fail = 0;
  static void ok(boolean v, String label) { if (v) pass++; else { fail++; System.out.println("  \\u2717 " + label); } }
  static JSONObject job(String ip, int port, byte[] d) {
    return new JSONObject().put("target", new JSONObject().put("ip", ip).put("port", port))
      .put("kind", "other").put("dataB64", java.util.Base64.getEncoder().encodeToString(d));
  }
  interface Run { int go() throws Exception; }
  static Object[] timed(Run r) {
    long t0 = System.currentTimeMillis();
    try { int b = r.go(); return new Object[] { "printed", b, System.currentTimeMillis() - t0, "" }; }
    catch (RelayClient.PrinterException e) { return new Object[] { e.uncertain ? "uncertain" : "failed", 0, System.currentTimeMillis() - t0, e.getMessage() }; }
    catch (Exception e) { return new Object[] { "other", 0, System.currentTimeMillis() - t0, String.valueOf(e) }; }
  }
  public static void main(String[] a) throws Exception {
    ServerSocket good = new ServerSocket(0);
    final ByteArrayOutputStream got = new ByteArrayOutputStream();
    Thread g = new Thread(() -> { try { while (true) { Socket s = good.accept(); new Thread(() -> { try { InputStream in = s.getInputStream(); byte[] b = new byte[8192]; int n; while ((n = in.read(b)) >= 0) synchronized (got) { got.write(b, 0, n); } } catch (Exception e) {} }).start(); } } catch (Exception e) {} });
    g.setDaemon(true); g.start();
    ServerSocket stuck = new ServerSocket(0);
    Thread st = new Thread(() -> { List<Socket> keep = new ArrayList<>(); try { while (true) keep.add(stuck.accept()); } catch (Exception e) {} });
    st.setDaemon(true); st.start();

    byte[] receipt = new byte[9131]; for (int i = 0; i < receipt.length; i++) receipt[i] = (byte) (i * 31);
    Object[] r = timed(() -> RelayClient.print(job("127.0.0.1", good.getLocalPort(), receipt)));
    Thread.sleep(200);
    ok("printed".equals(r[0]) && (int) r[1] == 9131, "a healthy printer prints the 9 KB receipt");
    synchronized (got) { ok(Arrays.equals(got.toByteArray(), receipt), "the printer receives the exact bytes"); }

    byte[] big = new byte[8_000_000];
    r = timed(() -> RelayClient.print(job("127.0.0.1", stuck.getLocalPort(), big)));
    ok("uncertain".equals(r[0]) && String.valueOf(r[3]).contains("printer-write-timeout"), "a printer that never reads gives an uncertain result, not a hang (" + r[0] + " " + r[3] + ")");
    ok((long) r[2] >= 7500 && (long) r[2] < 12000, "the write gives up at its 8 s deadline (" + r[2] + " ms)");

    ServerSocket closed = new ServerSocket(0); int cp = closed.getLocalPort(); closed.close();
    r = timed(() -> RelayClient.print(job("127.0.0.1", cp, new byte[] { 27, 64 })));
    ok("failed".equals(r[0]) && String.valueOf(r[3]).startsWith("printer-unreachable"), "a refused printer fails (nothing sent, the server requeues)");
    ok((long) r[2] < 3000, "a refused printer fails at once (" + r[2] + " ms)");

    final Object[][] box = new Object[1][];
    Thread w = new Thread(() -> box[0] = timed(() -> RelayClient.print(job("127.0.0.1", stuck.getLocalPort(), big))));
    w.start();
    Thread.sleep(1200);
    long t0 = System.currentTimeMillis();
    RelayClient.abortPrinter();
    w.join(10000);
    ok(!w.isAlive() && box[0] != null && !"printed".equals(box[0][0]), "abortPrinter() from another thread ends a stuck write");
    ok(System.currentTimeMillis() - t0 < 2500, "and it ends at once, not at the deadline (" + (System.currentTimeMillis() - t0) + " ms)");

    r = timed(() -> RelayClient.print(job("127.0.0.1", good.getLocalPort(), new byte[] { 27, 64 })));
    ok("printed".equals(r[0]), "the next ticket prints after a failure");

    LoopWatchdog dog = new LoopWatchdog(0);
    ok(dog.check(74_000) == LoopWatchdog.Action.NONE, "watchdog: a 74 s iteration is left alone");
    ok(dog.check(75_000) == LoopWatchdog.Action.ABORT_IO, "watchdog: 75 s without a beat cuts the printer connection");
    ok(dog.check(100_000) == LoopWatchdog.Action.NONE, "watchdog: the cut happens once");
    ok(dog.check(150_000) == LoopWatchdog.Action.RESTART, "watchdog: 150 s without a beat restarts the app");
    dog.beat(150_000);
    ok(dog.check(200_000) == LoopWatchdog.Action.NONE && dog.check(225_000) == LoopWatchdog.Action.ABORT_IO, "watchdog: a beat resets both thresholds");

    String latest = RelayClient.VERSION;
    String[] p = latest.split("\\\\.");
    String next = p[0] + "." + p[1] + "." + (Integer.parseInt(p[2]) + 1);
    JSONObject offer = new JSONObject().put("update", new JSONObject().put("version", next).put("url", "https://kiwi-os.com/downloads/kiwi-print-bridge.apk"));
    ok("https://kiwi-os.com/downloads/kiwi-print-bridge.apk".equals(RelayClient.updateUrl(offer)), "a newer version from kiwi-os.com is offered");
    ok(RelayClient.updateUrl(new JSONObject().put("update", new JSONObject().put("version", latest).put("url", "https://kiwi-os.com/x.apk"))) == null, "the running version is not offered again");
    ok(RelayClient.updateUrl(new JSONObject().put("update", new JSONObject().put("version", next).put("url", "https://evil.example/x.apk"))) == null, "an APK from anywhere else is never offered");
    ok(RelayClient.updateUrl(new JSONObject()) == null && !RelayClient.newer("1.0.x", "1.0.6") && RelayClient.newer("1.1.0", "1.0.9"), "version comparison is numeric and refuses junk");

    ok(RelayClient.nextPollMs(new JSONObject().put("poll", 5000)) == 5000 && RelayClient.nextPollMs(new JSONObject().put("poll", 60000)) == 5000
      && RelayClient.nextPollMs(new JSONObject().put("poll", 50)) == 200 && RelayClient.nextPollMs(new JSONObject()) == 1000, "poll pacing stays between 200 ms and 5 s");

    System.out.println(fail == 0 ? "OK " + pass : "FAIL " + fail + " / " + (pass + fail));
    System.exit(fail == 0 ? 0 : 1);
  }
}`);
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.java')) files.push(p); } })(path.join(work, 'src'));
  const out = path.join(work, 'out');
  fs.mkdirSync(out);
  const c = spawnSync(jdk.javac, ['-nowarn', '-encoding', 'UTF-8', '-d', out, ...files], { encoding: 'utf8' });
  if (c.status !== 0) { console.error('✗ the Android bridge does not compile:\n' + c.stderr); process.exit(1); }
  const run = spawnSync(jdk.java, ['-cp', out, 'com.kiwios.printbridge.Harness'], { encoding: 'utf8', timeout: 90000 });
  process.stdout.write(run.stdout.split('\n').filter((l) => /✗/.test(l)).map((l) => l + '\n').join(''));
  if (run.status !== 0 || !/^OK \d+/m.test(run.stdout)) {
    console.error('✗ android-bridge-jvm: ' + (run.stdout.match(/^FAIL .*$/m) || [run.stderr || 'harness did not finish'])[0]);
    process.exit(1);
  }
  console.log('✓ android-bridge-jvm · ' + run.stdout.match(/^OK (\d+)/m)[1] + ' checks on the real RelayClient and LoopWatchdog (healthy, stuck, refused, abort from the watchdog, update offer, poll pacing)');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

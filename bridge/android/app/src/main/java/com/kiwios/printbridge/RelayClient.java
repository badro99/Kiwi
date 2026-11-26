package com.kiwios.printbridge;

import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class RelayClient {
    static final String VERSION = "1.0.6";
    private static final long PRINTER_KEEPALIVE_MS = 10000;
    // Une journée couvrait la fermeture de nuit mais pas le jour de fermeture
    // hebdomadaire ni un week-end prolongé : au retour, le premier ticket
    // repayait le réveil. Sept jours couvrent toute fermeture réaliste.
    private static final long PRINTER_WARM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000L;
    // Une sonde vers une imprimante éteinte bloque jusqu'à 8 s dans la boucle du
    // service, donc retarde d'autant la récupération des tickets. Sur une
    // fenêtre de sept jours, insister toutes les 10 s coûterait cher pour rien :
    // on double l'attente à chaque échec jusqu'à 5 min, et on revient à 10 s dès
    // que l'imprimante répond ou qu'un vrai ticket passe.
    private static final long PRINTER_WARM_BACKOFF_MAX_MS = 5 * 60 * 1000L;
    private static int printerWarmMisses;
    /* 1.0.6 · Pasta Corner, 26 Nov 2026 : l'imprimante a cessé de lire ses
       données à 14 h 39 ; une écriture sans limite a bloqué le service douze
       minutes, tickets et tiroir compris, et chaque accusé arrivait après le
       bail de 30 s du serveur. Désormais tout ce qui touche l'imprimante a une
       borne : ouverture 5 s pour un ticket (2,5 s pour un simple réchauffage,
       qui ne doit pas retenir la récupération des tickets), écriture 8 s. Un
       ticket tient ainsi sous le bail, même avec une réouverture. */
    private static final int PRINT_CONNECT_MS = 5000;
    private static final int WARM_CONNECT_MS = 2500;
    private static final long WRITE_DEADLINE_MS = 8000;
    private static final long PROBE_WRITE_DEADLINE_MS = 2000;
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "kiwi-printer-watchdog");
        t.setDaemon(true);
        return t;
    });

    /* Ce que le serveur doit faire du ticket. `uncertain` : des octets ont pu
       partir vers l'imprimante, il ne faut pas le réimprimer à l'aveugle.
       Sinon rien n'est sorti (imprimante injoignable) : le serveur le remet en
       file et le retente. */
    static final class PrinterException extends Exception {
        final boolean uncertain;
        PrinterException(String message, boolean uncertain) { super(message); this.uncertain = uncertain; }
    }

    private static final byte[] PRINTER_PROBE_BYTES = new byte[] { 0x10, 0x04, 0x01 };
    private static Socket printerSocket;
    private static OutputStream printerOutput;
    private static String printerIp = "";
    private static int printerPort = 9100;
    private static long printerLastWrite;
    private static long printerLastRealWrite;
    private static long printerLastWarmAttempt;
    private static long lastConnectMs;
    private static boolean lastReused;
    private static long lastWriteMs;
    private static long lastIdleMs;
    private RelayClient() {}

    static JSONObject request(String method, String path, String token, JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BridgeStore.RELAY + path).openConnection();
        c.setRequestMethod(method);
        // Pairing and acknowledgements may tolerate a slow network. The hot job
        // poll may not: a 12 s stalled GET plus the service's retry sleep was
        // the intermittent 15-20 s delay seen at the till.
        int timeout = "GET".equals(method) && "/api/print/jobs".equals(path) ? 3000 : 12000;
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "kiwi-print-bridge-android/" + VERSION);
        if (!token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = c.getOutputStream()) { out.write(payload); }
        }
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (in != null) {
            byte[] block = new byte[4096]; int n;
            while ((n = in.read(block)) >= 0) bytes.write(block, 0, n);
            in.close();
        }
        String text = bytes.toString(StandardCharsets.UTF_8.name());
        JSONObject result = text.isEmpty() ? new JSONObject() : new JSONObject(text);
        result.put("_status", status);
        return result;
    }

    static JSONObject pair(String code, String deviceName) throws Exception {
        return request("POST", "/api/print/bridges", "", new JSONObject()
                .put("action", "redeem").put("code", code).put("name", deviceName)
                .put("platform", "android").put("version", VERSION));
    }

    private static void closePrinterSocket() {
        try { if (printerSocket != null) printerSocket.close(); } catch (Exception ignored) {}
        printerSocket = null;
        printerOutput = null;
    }

    private static void connectPrinter(String ip, int port, int timeoutMs) throws Exception {
        if (printerSocket != null && printerSocket.isConnected() && !printerSocket.isClosed()
                && printerOutput != null && ip.equals(printerIp) && port == printerPort) {
            lastReused = true;
            lastConnectMs = 0;
            return;
        }
        closePrinterSocket();
        long t0 = System.currentTimeMillis();
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(ip, port), timeoutMs);
        socket.setKeepAlive(true);
        socket.setTcpNoDelay(true);
        lastConnectMs = System.currentTimeMillis() - t0;
        lastReused = false;
        printerSocket = socket;
        printerOutput = socket.getOutputStream();
        printerIp = ip;
        printerPort = port;
    }

    /* Une écriture TCP ne connaît pas de délai : si l'imprimante n'avale plus
       rien, write() attend des minutes. Le chien de garde ferme la prise à
       l'échéance, ce qui débloque write() par une exception. */
    private static void writeWithDeadline(byte[] data, long deadlineMs) throws Exception {
        final Socket socket = printerSocket;
        final OutputStream out = printerOutput;
        if (socket == null || out == null) throw new PrinterException("printer-not-connected", false);
        final AtomicBoolean fired = new AtomicBoolean(false);
        ScheduledFuture<?> guard = WATCHDOG.schedule(() -> {
            fired.set(true);
            try { socket.close(); } catch (Exception ignored) {}
        }, deadlineMs, TimeUnit.MILLISECONDS);
        try {
            out.write(data);
            out.flush();
        } catch (Exception e) {
            if (fired.get()) { closePrinterSocket(); throw new PrinterException("printer-write-timeout", true); }
            throw e;
        } finally {
            guard.cancel(false);
        }
        if (fired.get()) { closePrinterSocket(); throw new PrinterException("printer-write-timeout", true); }
    }

    private static boolean probePrinter() {
        if (printerSocket == null || !printerSocket.isConnected() || printerSocket.isClosed() || printerOutput == null) {
            return false;
        }
        try {
            printerSocket.setSoTimeout(1500);
            writeWithDeadline(PRINTER_PROBE_BYTES, PROBE_WRITE_DEADLINE_MS);
            InputStream in = printerSocket.getInputStream();
            int b = in.read();
            if (b < 0) {
                closePrinterSocket();
                return false;
            }
            printerSocket.setSoTimeout(0);
            printerLastWrite = System.currentTimeMillis();
            return true;
        } catch (Exception e) {
            closePrinterSocket();
            return false;
        }
    }

    static synchronized boolean warmPrinter(String ip, int port) {
        if (ip == null || ip.isEmpty()) return false;
        printerIp = ip;
        printerPort = port;
        if (probePrinter()) return true;
        try {
            // La sonde a échoué : on retente une ouverture franche. Réussir ici
            // veut dire que le canal était mort, pas l'imprimante.
            connectPrinter(ip, port, WARM_CONNECT_MS);
            return true;
        } catch (Exception ignored) {
            closePrinterSocket();
            return false;
        }
    }

    static synchronized void resumePrinterWarm(String ip, int port, long at) {
        long now = System.currentTimeMillis();
        if (ip == null || ip.isEmpty() || at <= 0 || now - at > PRINTER_WARM_WINDOW_MS) return;
        printerIp = ip;
        printerPort = port;
        printerLastRealWrite = at;
        warmPrinter(ip, port);
    }

    private static void openForPrint(String ip, int port) throws PrinterException {
        try {
            connectPrinter(ip, port, PRINT_CONNECT_MS);
        } catch (Exception e) {
            closePrinterSocket();
            String m = e.getMessage();
            throw new PrinterException("printer-unreachable " + ip + ":" + port + (m == null ? "" : " · " + m), false);
        }
    }

    private static void writePrinter(String ip, int port, byte[] data) throws Exception {
        long t0 = System.currentTimeMillis();
        long idle = printerLastWrite > 0 ? (t0 - printerLastWrite) : 0;
        openForPrint(ip, port);
        boolean reused = lastReused;
        try {
            writeWithDeadline(data, WRITE_DEADLINE_MS);
        } catch (PrinterException timeout) {
            throw timeout;
        } catch (Exception first) {
            // Une prise neuve qui casse en cours d'écriture a pu laisser sortir
            // une partie du ticket : incertain, jamais renvoyé à l'aveugle.
            if (!reused) { closePrinterSocket(); throw new PrinterException("printer-write-failed · " + first.getMessage(), true); }
            // A printer may close an idle socket without Java noticing. Reopen
            // once inside the same serialized service loop before surfacing the
            // failure to the durable server queue.
            closePrinterSocket();
            openForPrint(ip, port);
            try {
                writeWithDeadline(data, WRITE_DEADLINE_MS);
            } catch (PrinterException timeout) {
                throw timeout;
            } catch (Exception second) {
                closePrinterSocket();
                throw new PrinterException("printer-write-failed · " + second.getMessage(), true);
            }
        }
        lastWriteMs = System.currentTimeMillis() - t0;
        lastIdleMs = idle;
        printerLastWrite = System.currentTimeMillis();
    }

    static synchronized int print(JSONObject job) throws Exception {
        JSONObject target = job.optJSONObject("target");
        if (target == null || target.optString("ip").isEmpty()) throw new Exception("Adresse IP d’imprimante absente");
        String ip = target.getString("ip");
        int port = target.optInt("port", 9100);
        String kind = job.optString("kind", "ticket");
        if ("wake".equals(kind)) {
            warmPrinter(ip, port);
            return 0;
        }
        String dataB64 = job.optString("dataB64");
        byte[] data = dataB64.isEmpty() ? new byte[0] : Base64.decode(dataB64, Base64.DEFAULT);
        if (data.length == 0) throw new Exception("Ticket vide");
        writePrinter(ip, port, data);
        printerLastRealWrite = System.currentTimeMillis();
        printerWarmMisses = 0;
        return data.length;
    }

    private static long warmBackoffMs() {
        long delay = PRINTER_KEEPALIVE_MS;
        for (int i = 0; i < printerWarmMisses && delay < PRINTER_WARM_BACKOFF_MAX_MS; i++) delay *= 2;
        return Math.min(delay, PRINTER_WARM_BACKOFF_MAX_MS);
    }

    static synchronized void keepPrinterWarm() {
        long now = System.currentTimeMillis();
        long backoff = warmBackoffMs();
        if (printerIp.isEmpty() || printerLastRealWrite == 0
                || now - printerLastRealWrite > PRINTER_WARM_WINDOW_MS
                || now - printerLastWrite < PRINTER_KEEPALIVE_MS
                || now - printerLastWarmAttempt < backoff) return;
        printerLastWarmAttempt = now;
        printerWarmMisses = warmPrinter(printerIp, printerPort) ? 0 : printerWarmMisses + 1;
    }

    static JSONObject ack(String token, String id, boolean ok, int bytes, String error, boolean uncertain) throws Exception {
        JSONObject body = new JSONObject().put("action", "ack").put("id", id).put("ok", ok).put("bytes", bytes);
        if (!ok && uncertain) body.put("outcome", "uncertain");
        if (!ok) body.put("error", error == null ? "print-failed" : error.substring(0, Math.min(300, error.length())));
        JSONObject timing = new JSONObject()
                .put("connectMs", lastConnectMs)
                .put("writeMs", lastWriteMs)
                .put("reused", lastReused)
                .put("idleMs", lastIdleMs)
                .put("totalMs", lastConnectMs + lastWriteMs);
        body.put("timing", timing);
        return request("POST", "/api/print/jobs", token, body);
    }

    static JSONArray jobs(JSONObject response) { return response.optJSONArray("jobs"); }

    /* Le serveur dit quand revenir (`poll`) : 1 s pendant le service, 5 s au
       repos. Jusqu'à la 1.0.4 l'appli l'ignorait et demandait chaque seconde,
       jour et nuit : 86 400 appels par tablette et par jour, le premier poste
       de requêtes de kiwi-os.com (owner, 2026-10-24). Mêmes bornes que le pont
       Node (bridge/server.js) : 200 ms à 5 s, 1 s si le serveur ne dit rien. */
    static long nextPollMs(JSONObject response) {
        int poll = response == null ? 0 : response.optInt("poll", 0);
        return poll > 0 ? Math.max(200, Math.min(5000, poll)) : 1000;
    }
}

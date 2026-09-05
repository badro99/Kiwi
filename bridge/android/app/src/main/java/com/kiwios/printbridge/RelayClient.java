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

final class RelayClient {
    static final String VERSION = "1.0.3";
    private static final long PRINTER_KEEPALIVE_MS = 10000;
    private static final long PRINTER_WARM_WINDOW_MS = 24 * 60 * 60 * 1000L;
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

    private static void connectPrinter(String ip, int port) throws Exception {
        if (printerSocket != null && printerSocket.isConnected() && !printerSocket.isClosed()
                && printerOutput != null && ip.equals(printerIp) && port == printerPort) {
            lastReused = true;
            lastConnectMs = 0;
            return;
        }
        closePrinterSocket();
        long t0 = System.currentTimeMillis();
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(ip, port), 8000);
        socket.setKeepAlive(true);
        lastConnectMs = System.currentTimeMillis() - t0;
        lastReused = false;
        printerSocket = socket;
        printerOutput = socket.getOutputStream();
        printerIp = ip;
        printerPort = port;
    }

    private static boolean probePrinter() {
        if (printerSocket == null || !printerSocket.isConnected() || printerSocket.isClosed() || printerOutput == null) {
            return false;
        }
        try {
            printerSocket.setSoTimeout(1500);
            printerOutput.write(PRINTER_PROBE_BYTES);
            printerOutput.flush();
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

    static synchronized void warmPrinter(String ip, int port) {
        if (ip == null || ip.isEmpty()) return;
        printerIp = ip;
        printerPort = port;
        if (!probePrinter()) {
            try {
                connectPrinter(ip, port);
            } catch (Exception ignored) {
                closePrinterSocket();
            }
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

    private static void writePrinter(String ip, int port, byte[] data) throws Exception {
        long t0 = System.currentTimeMillis();
        long idle = printerLastWrite > 0 ? (t0 - printerLastWrite) : 0;
        try {
            connectPrinter(ip, port);
            printerOutput.write(data);
            printerOutput.flush();
        } catch (Exception first) {
            // A printer may close an idle socket without Java noticing. Reopen
            // once inside the same serialized service loop before surfacing the
            // failure to the durable server queue.
            closePrinterSocket();
            connectPrinter(ip, port);
            printerOutput.write(data);
            printerOutput.flush();
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
        return data.length;
    }

    static synchronized void keepPrinterWarm() {
        long now = System.currentTimeMillis();
        if (printerIp.isEmpty() || printerLastRealWrite == 0
                || now - printerLastRealWrite > PRINTER_WARM_WINDOW_MS
                || now - printerLastWrite < PRINTER_KEEPALIVE_MS
                || now - printerLastWarmAttempt < PRINTER_KEEPALIVE_MS) return;
        printerLastWarmAttempt = now;
        warmPrinter(printerIp, printerPort);
    }

    static JSONObject ack(String token, String id, boolean ok, int bytes, String error) throws Exception {
        JSONObject body = new JSONObject().put("action", "ack").put("id", id).put("ok", ok).put("bytes", bytes);
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
}

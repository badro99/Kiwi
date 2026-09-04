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
    static final String VERSION = "1.0.0";
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

    static int print(JSONObject job) throws Exception {
        JSONObject target = job.optJSONObject("target");
        if (target == null || target.optString("ip").isEmpty()) throw new Exception("Adresse IP d’imprimante absente");
        byte[] data = Base64.decode(job.optString("dataB64"), Base64.DEFAULT);
        if (data.length == 0) throw new Exception("Ticket vide");
        String ip = target.getString("ip");
        int port = target.optInt("port", 9100);
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(ip, port), 8000);
            socket.setSoTimeout(8000);
            OutputStream out = socket.getOutputStream();
            out.write(data); out.flush();
        }
        return data.length;
    }

    static JSONObject ack(String token, String id, boolean ok, int bytes, String error) throws Exception {
        JSONObject body = new JSONObject().put("action", "ack").put("id", id).put("ok", ok).put("bytes", bytes);
        if (!ok) body.put("error", error == null ? "print-failed" : error.substring(0, Math.min(300, error.length())));
        return request("POST", "/api/print/jobs", token, body);
    }

    static JSONArray jobs(JSONObject response) { return response.optJSONArray("jobs"); }
}

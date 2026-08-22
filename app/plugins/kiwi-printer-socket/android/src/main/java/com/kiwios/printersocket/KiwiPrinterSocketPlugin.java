package com.kiwios.printersocket;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.SystemClock;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "KiwiPrinterSocket")
public class KiwiPrinterSocketPlugin extends Plugin {
    private static final ExecutorService SOCKETS = Executors.newFixedThreadPool(32);

    @PluginMethod
    public void send(PluginCall call) {
        Endpoint endpoint = endpoint(call, 4000);
        String encoded = call.getString("data");
        if (endpoint == null || encoded == null) {
            resolveError(call, "bad-args", "Hôte, port ou données invalides.");
            return;
        }
        final byte[] data;
        try {
            data = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            resolveError(call, "bad-args", "Données base64 invalides.");
            return;
        }
        SOCKETS.execute(() -> {
            long started = SystemClock.elapsedRealtime();
            try (Socket socket = connect(endpoint); OutputStream output = socket.getOutputStream()) {
                output.write(data);
                output.flush();
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("bytes", data.length);
                result.put("ms", elapsed(started));
                call.resolve(result);
            } catch (Exception error) {
                resolveMapped(call, error);
            }
        });
    }

    @PluginMethod
    public void probe(PluginCall call) {
        Endpoint endpoint = endpoint(call, 4000);
        if (endpoint == null) {
            resolveError(call, "bad-args", "Hôte ou port invalide.");
            return;
        }
        SOCKETS.execute(() -> {
            long started = SystemClock.elapsedRealtime();
            try (Socket ignored = connect(endpoint)) {
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("ms", elapsed(started));
                call.resolve(result);
            } catch (Exception error) {
                resolveMapped(call, error);
            }
        });
    }

    @PluginMethod
    public void scan(PluginCall call) {
        int port = call.getInt("port", 9100);
        int timeout = boundedTimeout(call.getInt("timeoutMs"), 600);
        String requested = call.getString("subnet");
        String prefix = subnetPrefix(requested == null ? wifiIPv4() : requested);
        if (port < 1 || port > 65535 || prefix == null) {
            resolveError(call, "bad-args", "Sous-réseau ou port invalide.");
            return;
        }

        List<JSObject> found = new ArrayList<>();
        AtomicInteger remaining = new AtomicInteger(254);
        for (int suffix = 1; suffix <= 254; suffix++) {
            String host = prefix + "." + suffix;
            SOCKETS.execute(() -> {
                long started = SystemClock.elapsedRealtime();
                try (Socket ignored = connect(new Endpoint(host, port, timeout))) {
                    JSObject item = new JSObject();
                    item.put("host", host);
                    item.put("ms", elapsed(started));
                    synchronized (found) { found.add(item); }
                } catch (Exception ignored) {
                    // Un hôte fermé n'est pas une erreur de scan.
                }
                if (remaining.decrementAndGet() == 0) {
                    synchronized (found) {
                        found.sort(Comparator.comparing(item -> item.getString("host")));
                        JSArray hosts = new JSArray();
                        for (JSObject item : found) hosts.put(item);
                        JSObject result = new JSObject();
                        result.put("ok", true);
                        result.put("hosts", hosts);
                        call.resolve(result);
                    }
                }
            });
        }
    }

    private Socket connect(Endpoint endpoint) throws IOException {
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(endpoint.host, endpoint.port), endpoint.timeoutMs);
        socket.setSoTimeout(endpoint.timeoutMs);
        return socket;
    }

    private Endpoint endpoint(PluginCall call, int defaultTimeout) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        if (host == null || host.trim().isEmpty() || host.matches(".*\\s+.*") || port == null || port < 1 || port > 65535) return null;
        return new Endpoint(host.trim(), port, boundedTimeout(call.getInt("timeoutMs"), defaultTimeout));
    }

    private int boundedTimeout(Integer timeout, int fallback) {
        return Math.min(Math.max(timeout == null ? fallback : timeout, 100), 30000);
    }

    private int elapsed(long started) {
        return (int) (SystemClock.elapsedRealtime() - started);
    }

    private void resolveMapped(PluginCall call, Exception error) {
        if (error instanceof SocketTimeoutException) resolveError(call, "timeout", "Connexion à l'imprimante expirée.");
        else if (error instanceof ConnectException) resolveError(call, "refused", "Connexion refusée par l'imprimante.");
        else if (error instanceof NoRouteToHostException || error instanceof UnknownHostException) resolveError(call, "unreachable", "Imprimante inaccessible sur ce réseau.");
        else if (error instanceof SecurityException) resolveError(call, "local-network-denied", "Accès au réseau local non autorisé.");
        else resolveError(call, "unreachable", "Connexion réseau impossible.");
    }

    private void resolveError(PluginCall call, String code, String message) {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("code", code);
        result.put("message", message);
        call.resolve(result);
    }

    private String subnetPrefix(String value) {
        if (value == null) return null;
        String clean = value.trim().replaceFirst("/24$", "");
        String[] parts = clean.split("\\.", -1);
        if (parts.length != 3 && parts.length != 4) return null;
        int[] octets = new int[parts.length];
        try {
            for (int i = 0; i < parts.length; i++) {
                octets[i] = Integer.parseInt(parts[i]);
                if (octets[i] < 0 || octets[i] > 255) return null;
            }
        } catch (NumberFormatException error) { return null; }
        if (parts.length == 4 && octets[3] != 0) return null;
        return octets[0] + "." + octets[1] + "." + octets[2];
    }

    private String wifiIPv4() {
        WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi == null || wifi.getConnectionInfo() == null) return null;
        int ip = wifi.getConnectionInfo().getIpAddress();
        if (ip == 0) return null;
        return (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + "." + ((ip >> 24) & 0xff);
    }

    private static final class Endpoint {
        final String host;
        final int port;
        final int timeoutMs;

        Endpoint(String host, int port, int timeoutMs) {
            this.host = host;
            this.port = port;
            this.timeoutMs = timeoutMs;
        }
    }
}

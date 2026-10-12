package com.kiwios.printersocket;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "KiwiPrinterSocket")
public class KiwiPrinterSocketPlugin extends Plugin {
    private static final ExecutorService SOCKETS = Executors.newFixedThreadPool(32);
    private static final String SECURE_PREFS = "kiwi_secure_v1";
    private static final String KEY_ALIAS = "com.kiwios.pro.secure";

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

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = secureKey(call);
        if (key == null) { resolveError(call, "bad-args", "Clé sécurisée invalide."); return; }
        JSObject result = new JSObject();
        try { result.put("value", decrypt(securePrefs().getString(key, null))); call.resolve(result); }
        catch (Exception error) { securePrefs().edit().remove(key).apply(); call.resolve(result); }
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = secureKey(call), value = call.getString("value");
        if (key == null || value == null) { resolveError(call, "bad-args", "Valeur sécurisée invalide."); return; }
        try { securePrefs().edit().putString(key, encrypt(value)).apply(); call.resolve(); }
        catch (Exception error) { resolveError(call, "secure-store", "Stockage sécurisé indisponible."); }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = secureKey(call);
        if (key == null) { resolveError(call, "bad-args", "Clé sécurisée invalide."); return; }
        securePrefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void deviceIdentity(PluginCall call) {
        try {
            String value = decrypt(securePrefs().getString("device-id", null));
            if (value == null || !value.startsWith("kid_")) {
                value = "kid_" + UUID.randomUUID().toString().replace("-", "").toLowerCase();
                securePrefs().edit().putString("device-id", encrypt(value)).commit();
            }
            JSObject result = new JSObject();
            result.put("id", value);
            call.resolve(result);
        } catch (Exception error) { resolveError(call, "secure-store", "Identité appareil indisponible."); }
    }

    @PluginMethod
    public void ledgerRead(PluginCall call) {
        File file = ledgerFile(call);
        if (file == null) { resolveError(call, "bad-args", "Registre invalide."); return; }
        JSObject result = new JSObject();
        try {
            if (file.exists()) {
                try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] block = new byte[8192]; int read;
                    while ((read = input.read(block)) != -1) output.write(block, 0, read);
                    result.put("value", output.toString(StandardCharsets.UTF_8.name()));
                }
            }
            call.resolve(result);
        }
        catch (Exception error) { resolveError(call, "ledger-read", "Registre d’impression indisponible."); }
    }

    @PluginMethod
    public void ledgerWrite(PluginCall call) {
        File file = ledgerFile(call); String value = call.getString("value");
        if (file == null || value == null || value.getBytes(StandardCharsets.UTF_8).length > 5000000) { resolveError(call, "bad-args", "Registre invalide."); return; }
        try {
            file.getParentFile().mkdirs();
            try (FileOutputStream output = new FileOutputStream(file, false)) { output.write(value.getBytes(StandardCharsets.UTF_8)); output.getFD().sync(); }
            call.resolve();
        }
        catch (Exception error) { resolveError(call, "ledger-write", "Registre d’impression indisponible."); }
    }

    @PluginMethod
    public void checkBiometrics(PluginCall call) {
        JSObject res = new JSObject();
        res.put("isAvailable", false);
        res.put("biometryType", "none");
        call.resolve(res);
    }

    @PluginMethod
    public void authenticateBiometric(PluginCall call) {
        JSObject res = new JSObject();
        res.put("authenticated", false);
        res.put("fallback", true);
        call.resolve(res);
    }

    private static final int INVOICE_MAX_BYTES = 2_000_000;
    private static final int SHARE_MAX_BYTES = 25 * 1024 * 1024;
    private static final long PRINT_LOAD_TIMEOUT_MS = 20_000L;
    private static final long SHARE_RETENTION_MS = 60L * 60L * 1000L;
    // Off-screen renderers stay strongly reachable until the print framework
    // calls onFinish on their adapter; a collected WebView prints blank pages.
    private final Set<WebView> printRenderers = Collections.newSetFromMap(new IdentityHashMap<>());

    /**
     * Android counterpart of the iOS A4 export. An off-screen WebView lays the
     * document out and the system print dialog takes it from there: "Save as
     * PDF" and every installed printer. Resolves once the job is handed to the
     * system, which says the dialog was presented, never that the user saved or
     * printed anything.
     */
    @PluginMethod
    public void exportInvoice(PluginCall call) {
        printDocument(call);
    }

    /** Same arguments and behaviour as exportInvoice, for any document a page asks to print. */
    @PluginMethod
    public void printHtml(PluginCall call) {
        printDocument(call);
    }

    /**
     * Writes base64 data to a private cache folder and opens the system share
     * sheet on it through the app's FileProvider. Resolves once the sheet is
     * presented; what the user does with it is theirs.
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String encoded = call.getString("data");
        // Refuse an oversized payload before decoding it (base64 is 4/3 of the bytes).
        if (encoded == null || encoded.isEmpty() || encoded.length() > SHARE_MAX_BYTES / 3L * 4L + 1_048_576L) {
            call.reject("invalid-file", "invalid-file");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(encoded, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("invalid-file", "invalid-file");
            return;
        }
        if (bytes.length == 0 || bytes.length > SHARE_MAX_BYTES) {
            call.reject("invalid-file", "invalid-file");
            return;
        }
        String name = shareFileName(call.getString("name"));
        String mime = shareMime(call.getString("mime"), name);
        final Uri uri;
        try {
            File root = new File(getContext().getCacheDir(), "kiwi-share");
            pruneShares(root);
            File folder = new File(root, UUID.randomUUID().toString());
            if (!folder.mkdirs()) throw new IOException("kiwi-share folder");
            File file = new File(folder, name);
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (Exception error) {
            call.reject("share-write-failed", "share-write-failed");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newRawUri(name, uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getBridge().executeOnMainThread(() -> {
            Activity activity = getActivity();
            if (activity == null || activity.isFinishing()) { call.reject("no-presenter", "no-presenter"); return; }
            try {
                activity.startActivity(chooser);
            } catch (ActivityNotFoundException error) {
                call.reject("no-share-target", "no-share-target");
                return;
            }
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("presented", true);
            call.resolve(result);
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void printDocument(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty() || html.getBytes(StandardCharsets.UTF_8).length > INVOICE_MAX_BYTES) {
            call.reject("invalid-invoice", "invalid-invoice");
            return;
        }
        String jobName = printJobName(call.getString("name"));
        Uri base = documentBase(call.getString("baseUrl"));
        getBridge().executeOnMainThread(() -> {
            Activity activity = getActivity();
            if (activity == null || activity.isFinishing()) { call.reject("no-presenter", "no-presenter"); return; }
            WebView renderer = new WebView(activity);
            renderer.getSettings().setJavaScriptEnabled(true);
            renderer.getSettings().setAllowFileAccess(false);
            renderer.getSettings().setAllowContentAccess(false);
            printRenderers.add(renderer);
            Handler main = new Handler(Looper.getMainLooper());
            boolean[] settled = { false };
            Runnable timeout = () -> {
                if (settled[0]) return;
                settled[0] = true;
                releaseRenderer(renderer);
                call.reject("render-timeout", "render-timeout");
            };
            renderer.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    // With a base URL, relative images, fonts and CSS resolve to
                    // https://localhost/<path>: serve them from the bundled web.
                    return base == null ? null : bundledAsset(request.getUrl());
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (settled[0]) return;
                    settled[0] = true;
                    main.removeCallbacks(timeout);
                    // A beat for late layout (web fonts, decoded images) before pagination.
                    main.postDelayed(() -> handToPrintManager(call, activity, renderer, jobName), 150);
                }
            });
            main.postDelayed(timeout, PRINT_LOAD_TIMEOUT_MS);
            renderer.loadDataWithBaseURL(base == null ? null : base.toString(), html, "text/html", "utf-8", null);
        });
    }

    private void handToPrintManager(PluginCall call, Activity activity, WebView renderer, String jobName) {
        PrintManager manager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
        if (manager == null || activity.isFinishing()) {
            releaseRenderer(renderer);
            call.reject("print-unavailable", "print-unavailable");
            return;
        }
        PrintAttributes attributes = new PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
            .build();
        try {
            PrintDocumentAdapter adapter = renderer.createPrintDocumentAdapter(jobName);
            manager.print(jobName, new ReleasingPrintAdapter(adapter, () -> releaseRenderer(renderer)), attributes);
        } catch (RuntimeException error) {
            releaseRenderer(renderer);
            call.reject("print-failed", "print-failed");
            return;
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("presented", true);
        call.resolve(result);
    }

    private void releaseRenderer(WebView renderer) {
        if (!printRenderers.remove(renderer)) return;
        renderer.stopLoading();
        renderer.destroy();
    }

    private WebResourceResponse bundledAsset(Uri url) {
        if (url == null || !"localhost".equalsIgnoreCase(url.getHost())) return null;
        String scheme = url.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
        String path = url.getPath();
        if (path == null) return null;
        while (path.startsWith("/")) path = path.substring(1);
        if (path.isEmpty() || path.endsWith("/")) return null;
        for (String segment : path.split("/")) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) return null;
        }
        String mime = mimeForPath(path);
        if (mime == null) mime = "application/octet-stream";
        try {
            // Capacitor copies the web bundle to assets/public/.
            InputStream input = getContext().getAssets().open("public/" + path);
            return new WebResourceResponse(mime, isTextMime(mime) ? "utf-8" : null, input);
        } catch (IOException missing) {
            return null;
        }
    }

    private static Uri documentBase(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        Uri uri = Uri.parse(raw.trim());
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
        return uri.getHost() == null ? null : uri;
    }

    private static String printJobName(String raw) {
        StringBuilder clean = new StringBuilder();
        if (raw != null) {
            for (int i = 0; i < raw.length() && clean.length() < 80; i++) {
                char c = raw.charAt(i);
                if (Character.isLetterOrDigit(c) || c == '-' || c == '_') clean.append(c);
            }
        }
        return clean.length() == 0 ? "Facture" : clean.toString();
    }

    /** Letters, digits, '-', '_' and '.' only; at most 120 characters, extension kept; never a path. */
    static String shareFileName(String raw) {
        StringBuilder clean = new StringBuilder();
        if (raw != null) {
            for (int i = 0; i < raw.length(); i++) {
                char c = raw.charAt(i);
                if (Character.isLetterOrDigit(c) || c == '-' || c == '_' || c == '.') clean.append(c);
            }
        }
        String name = clean.toString();
        while (name.startsWith(".")) name = name.substring(1);
        String base = name;
        String extension = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0 && dot < name.length() - 1 && name.length() - dot <= 16) {
            base = name.substring(0, dot);
            extension = name.substring(dot);
        }
        if (base.isEmpty()) base = "Kiwi";
        int room = 120 - extension.length();
        if (base.length() > room) base = base.substring(0, room);
        return base + extension;
    }

    private static String shareMime(String requested, String name) {
        if (requested != null && requested.matches("^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,127}$")) {
            return requested.toLowerCase(Locale.ROOT);
        }
        String guessed = mimeForPath(name);
        return guessed == null ? "application/octet-stream" : guessed;
    }

    private static String mimeForPath(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot == path.length() - 1) return null;
        String extension = path.substring(dot + 1).toLowerCase(Locale.ROOT);
        switch (extension) {
            case "html": case "htm": return "text/html";
            case "css": return "text/css";
            case "js": case "mjs": return "text/javascript";
            case "json": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "avif": return "image/avif";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "pdf": return "application/pdf";
            case "csv": return "text/csv";
            case "txt": return "text/plain";
            default: return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        }
    }

    private static boolean isTextMime(String mime) {
        return mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
    }

    // Shared files cannot be deleted when the receiving app is done with them
    // (it never says); anything older than an hour is gone by the next share.
    private static void pruneShares(File root) {
        File[] folders = root.listFiles();
        if (folders == null) return;
        long cutoff = System.currentTimeMillis() - SHARE_RETENTION_MS;
        for (File folder : folders) {
            if (folder.lastModified() >= cutoff) continue;
            File[] files = folder.listFiles();
            if (files != null) for (File file : files) file.delete();
            folder.delete();
        }
    }

    /** Delegates to the WebView's adapter and frees the renderer when the job is done. */
    private static final class ReleasingPrintAdapter extends PrintDocumentAdapter {
        private final PrintDocumentAdapter inner;
        private final Runnable release;

        ReleasingPrintAdapter(PrintDocumentAdapter inner, Runnable release) {
            this.inner = inner;
            this.release = release;
        }

        @Override
        public void onStart() {
            inner.onStart();
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
            inner.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal, WriteResultCallback callback) {
            inner.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            try {
                inner.onFinish();
            } finally {
                release.run();
            }
        }
    }

    private File ledgerFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null || !name.matches("^[a-z0-9-]{1,96}$")) return null;
        return new File(new File(getContext().getFilesDir(), "kiwi-print"), name + ".json");
    }

    private String secureKey(PluginCall call) {
        String key = call.getString("key");
        return key != null && key.matches("^[a-z0-9-]{1,64}$") ? key : null;
    }

    private SharedPreferences securePrefs() {
        return getContext().getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey(), new SecureRandom());
        byte[] iv = cipher.getIV(), encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] joined = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, joined, 0, iv.length);
        System.arraycopy(encrypted, 0, joined, iv.length, encrypted.length);
        return Base64.encodeToString(joined, Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        if (encoded == null) return null;
        byte[] joined = Base64.decode(encoded, Base64.NO_WRAP);
        if (joined.length < 29) throw new IllegalArgumentException("ciphertext");
        byte[] iv = new byte[12], encrypted = new byte[joined.length - 12];
        System.arraycopy(joined, 0, iv, 0, 12);
        System.arraycopy(joined, 12, encrypted, 0, encrypted.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
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

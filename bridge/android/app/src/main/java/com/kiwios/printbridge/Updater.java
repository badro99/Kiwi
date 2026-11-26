package com.kiwios.printbridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/* 1.0.8 · mise à jour sans personne. Le pont télécharge l'APK que le serveur
   propose, vérifie taille et empreinte (UpdatePolicy), puis l'installe par
   PackageInstaller quand le comptoir est calme. Sur Android 12+, avec
   « Installer des applis inconnues » autorisé, rien ne s'affiche : Android
   remplace l'app, MY_PACKAGE_REPLACED relance le service (BootReceiver),
   l'association est gardée. Si Android demande quand même une confirmation,
   UpdateReceiver pose une notification « Touchez pour installer ». Après trois
   essais, la notification de 1.0.7 (télécharger à la main) reprend. */
final class Updater {
    static final String ACTION_INSTALL_STATUS = "com.kiwios.printbridge.INSTALL_STATUS";
    static final String EXTRA_VERSION = "version";
    static final String UPDATE_CHANNEL = "kiwi_print_bridge_update";
    static final int UPDATE_NOTIFICATION_ID = 1708;

    private final Context ctx;
    private final ExecutorService downloader = Executors.newSingleThreadExecutor();
    private volatile boolean downloading;
    private volatile String fallbackShown = "";

    Updater(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        cleanup(RelayClient.VERSION);
    }

    private SharedPreferences prefs() { return BridgeStore.prefs(ctx); }
    private File dir() { File d = new File(ctx.getFilesDir(), "updates"); d.mkdirs(); return d; }
    private File apk(String version) { return new File(dir(), "kiwi-print-bridge-" + version + ".apk"); }

    /* Les APK d'une version déjà installée (ou plus ancienne) ne servent plus. */
    private void cleanup(String running) {
        File[] files = dir().listFiles();
        if (files == null) return;
        for (File f : files) {
            String v = f.getName().replace("kiwi-print-bridge-", "").replace(".apk", "").replace(".part", "");
            if (!RelayClient.newer(v, running)) f.delete();
        }
    }

    /* Appelé par la boucle du service après chaque poll réussi. */
    void consider(UpdatePolicy.Offer offer, boolean quiet) {
        long now = System.currentTimeMillis();
        SharedPreferences p = prefs();
        if (!offer.version.equals(p.getString("updVersion", ""))) {
            p.edit().putString("updVersion", offer.version).putInt("updAttempts", 0).putLong("updLastAt", 0L).putLong("updDownloadAt", 0L).apply();
        }
        File file = apk(offer.version);
        if (!UpdatePolicy.verified(file, offer)) {
            if (!downloading && UpdatePolicy.mayDownload(now, p.getLong("updDownloadAt", 0L))) {
                downloading = true;
                p.edit().putLong("updDownloadAt", now).apply();
                downloader.execute(() -> { try { download(offer, file); } finally { downloading = false; } });
            }
            return;
        }
        int attempts = p.getInt("updAttempts", 0);
        if (attempts >= UpdatePolicy.MAX_ATTEMPTS) { fallback(offer.version, offer.url); return; }
        if (!quiet || !UpdatePolicy.mayAttempt(now, p.getLong("updLastAt", 0L), attempts)) return;
        p.edit().putInt("updAttempts", attempts + 1).putLong("updLastAt", now).apply();
        try { install(offer, file); }
        catch (Exception e) {
            p.edit().putString("updError", String.valueOf(e.getMessage())).apply();
            if (attempts + 1 >= UpdatePolicy.MAX_ATTEMPTS) fallback(offer.version, offer.url);
        }
    }

    private void download(UpdatePolicy.Offer offer, File file) {
        File part = new File(file.getPath() + ".part");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(UpdatePolicy.downloadUrl(offer, System.currentTimeMillis())).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "kiwi-print-bridge-android/" + RelayClient.VERSION);
            if (c.getResponseCode() != 200) return;
            long total = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) >= 0) {
                    total += n;
                    if (total > offer.size) return;
                    out.write(buf, 0, n);
                }
            }
            if (UpdatePolicy.verified(part, offer) && part.renameTo(file)) return;
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
            if (part.exists()) part.delete();
        }
    }

    /* L'APK passe dans la session octet par octet sous une nouvelle empreinte :
       un fichier changé entre la vérification et l'installation est abandonné. */
    private void install(UpdatePolicy.Offer offer, File file) throws Exception {
        PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
        for (PackageInstaller.SessionInfo old : installer.getMySessions()) {
            try { installer.abandonSession(old.getSessionId()); } catch (Exception ignored) {}
        }
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        params.setSize(file.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(id);
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new FileInputStream(file); OutputStream out = session.openWrite("base.apk", 0, file.length())) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) >= 0) { md.update(buf, 0, n); out.write(buf, 0, n); }
                session.fsync(out);
            }
            if (!offer.sha256.equals(UpdatePolicy.hex(md.digest()))) throw new Exception("apk changed before install");
            Intent status = new Intent(ctx, UpdateReceiver.class).setAction(ACTION_INSTALL_STATUS).putExtra(EXTRA_VERSION, offer.version);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(ctx, id, status, flags).getIntentSender());
            session.close();
        } catch (Exception e) {
            try { session.abandon(); } catch (Exception ignored) {}
            throw e;
        }
    }

    /* La voie de 1.0.7 : une notification qu'on touche pour télécharger l'APK,
       une fois par version. */
    void fallback(String version, String url) {
        if (version.equals(fallbackShown)) return;
        fallbackShown = version;
        PendingIntent open = PendingIntent.getActivity(ctx, 2, new Intent(Intent.ACTION_VIEW, Uri.parse(url)),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        notify(ctx, "Kiwi Print Bridge " + version + " disponible",
                "Touchez pour télécharger, puis installez par-dessus. L’association est gardée.", open);
    }

    static void notify(Context c, String title, String text, PendingIntent action) {
        try {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel(UPDATE_CHANNEL, "Mises à jour", NotificationManager.IMPORTANCE_DEFAULT));
            }
            nm.notify(UPDATE_NOTIFICATION_ID, new Notification.Builder(c, UPDATE_CHANNEL)
                    .setSmallIcon(com.kiwios.printbridge.R.drawable.ic_kiwi)
                    .setContentTitle(title).setContentText(text)
                    .setContentIntent(action).setAutoCancel(true).build());
        } catch (Throwable ignored) {}
    }

    void shutdown() { downloader.shutdownNow(); }
}

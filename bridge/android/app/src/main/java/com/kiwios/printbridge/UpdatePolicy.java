package com.kiwios.printbridge;

import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

/* 1.0.8 · le pont se met à jour seul. Tout ce qui décide est ici, sans import
   Android, pour que android-bridge-jvm-test l'exécute sur la JVM :
   · l'offre du serveur n'est retenue que si elle est plus récente, vient de
     kiwi-os.com et porte une empreinte sha256 et une taille ;
   · le fichier téléchargé doit avoir exactement cette taille et cette empreinte ;
   · l'installation n'a lieu qu'au calme : aucun ticket depuis 10 minutes
     (le soir, la nuit, un creux de l'après-midi) ;
   · trois essais au plus par version, à une heure d'écart, puis la
     notification de 1.0.7 (télécharger et installer à la main). */
final class UpdatePolicy {
    static final long QUIET_MS = 10 * 60_000L;
    static final long RETRY_MS = 60 * 60_000L;
    static final long DOWNLOAD_RETRY_MS = 15 * 60_000L;
    static final int MAX_ATTEMPTS = 3;
    static final long MAX_APK_BYTES = 20L * 1024 * 1024;

    private UpdatePolicy() {}

    static final class Offer {
        final String version, url, sha256;
        final long size;
        Offer(String version, String url, String sha256, long size) {
            this.version = version; this.url = url; this.sha256 = sha256; this.size = size;
        }
    }

    static Offer offer(JSONObject response, String current) {
        JSONObject u = response == null ? null : response.optJSONObject("update");
        if (u == null) return null;
        String version = u.optString("version"), url = u.optString("url");
        String sha = u.optString("sha256").toLowerCase(Locale.ROOT);
        long size = u.optLong("size", 0L);
        if (!RelayClient.newer(version, current) || !url.startsWith("https://kiwi-os.com/")) return null;
        if (!sha.matches("[0-9a-f]{64}") || size <= 0 || size > MAX_APK_BYTES) return null;
        return new Offer(version, url, sha, size);
    }

    /* Aucun ticket depuis 10 minutes, et aucun dans le poll en cours. */
    static boolean quiet(long now, long lastJobAt, int jobsInPoll) {
        return jobsInPoll == 0 && now - lastJobAt >= QUIET_MS;
    }

    static boolean mayAttempt(long now, long lastAttemptAt, int attempts) {
        return attempts < MAX_ATTEMPTS && (attempts == 0 || now - lastAttemptAt >= RETRY_MS);
    }

    static boolean mayDownload(long now, long lastDownloadAt) {
        return lastDownloadAt == 0 || now - lastDownloadAt >= DOWNLOAD_RETRY_MS;
    }

    /* Une adresse neuve à chaque téléchargement : un cache qui aurait gardé
       l'ancien APK sous l'adresse fixe ne le resert pas. */
    static String downloadUrl(Offer o, long now) {
        return o.url + (o.url.contains("?") ? "&" : "?") + "v=" + o.version + "&t=" + now;
    }

    static String hex(byte[] digest) {
        StringBuilder b = new StringBuilder(digest.length * 2);
        for (byte x : digest) b.append(String.format(Locale.ROOT, "%02x", x & 0xff));
        return b.toString();
    }

    static String sha256(InputStream in) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) >= 0) md.update(buf, 0, n);
        return hex(md.digest());
    }

    static boolean verified(File f, Offer o) {
        if (f == null || o == null || !f.isFile() || f.length() != o.size) return false;
        try (InputStream in = new FileInputStream(f)) { return o.sha256.equals(sha256(in)); }
        catch (Exception e) { return false; }
    }
}

package com.kiwios.printbridge;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class BridgeService extends Service {
    static final String ACTION_STATUS = "com.kiwios.printbridge.STATUS";
    static final String EXTRA_STATUS = "status";
    private static final String CHANNEL = "kiwi_print_bridge";
    private static final int NOTIFICATION_ID = 1707;
    private static final String UPDATE_CHANNEL = "kiwi_print_bridge_update";
    private static final int UPDATE_NOTIFICATION_ID = 1708;
    private final LoopWatchdog watchdog = new LoopWatchdog(System.currentTimeMillis());
    private ScheduledExecutorService guard;
    private volatile String offeredUpdate = "";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean running;
    private int unauthorized;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, notification("Connexion à Kiwi…"));
        acquireLocks();
        String warmIp = BridgeStore.warmIp(this);
        int warmPort = BridgeStore.warmPort(this);
        long warmAt = BridgeStore.warmAt(this);
        RelayClient.resumePrinterWarm(warmIp, warmPort, warmAt);
        guard = Executors.newSingleThreadScheduledExecutor();
        guard.scheduleWithFixedDelay(this::checkLoop, 15, 15, TimeUnit.SECONDS);
    }

    /* Le chien de garde (LoopWatchdog) : 75 s sans battement, on coupe la prise
       de l'imprimante ; 150 s, on relance le processus par une alarme. */
    private void checkLoop() {
        try {
            switch (watchdog.check(System.currentTimeMillis())) {
                case ABORT_IO:
                    RelayClient.abortPrinter();
                    publish("Imprimante bloquée · connexion coupée, reprise…");
                    break;
                case RESTART:
                    restartProcess();
                    break;
                default:
                    break;
            }
        } catch (Throwable ignored) {}
    }

    private void restartProcess() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            PendingIntent again = PendingIntent.getForegroundService(this, 1, new Intent(this, BridgeService.class),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 3000, again);
        } catch (Throwable ignored) {}
        // START_STICKY relance aussi le service si l'alarme est retardée.
        releaseLocks();
        android.os.Process.killProcess(android.os.Process.myPid());
    }

    /* Le serveur propose la nouvelle version : une notification qu'on touche pour
       télécharger l'APK, une fois par version. */
    private void offerUpdate(JSONObject response) {
        String url = RelayClient.updateUrl(response);
        if (url == null) return;
        String version = RelayClient.updateVersion(response);
        if (version.equals(offeredUpdate)) return;
        offeredUpdate = version;
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel c = new NotificationChannel(UPDATE_CHANNEL, "Mises à jour", NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(c);
            }
            PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(Intent.ACTION_VIEW, Uri.parse(url)),
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            nm.notify(UPDATE_NOTIFICATION_ID, new Notification.Builder(this, UPDATE_CHANNEL)
                    .setSmallIcon(com.kiwios.printbridge.R.drawable.ic_kiwi)
                    .setContentTitle("Kiwi Print Bridge " + version + " disponible")
                    .setContentText("Touchez pour télécharger, puis installez par-dessus. L’association est gardée.")
                    .setContentIntent(open).setAutoCancel(true).build());
        } catch (Throwable ignored) {}
    }

    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kiwi:printbridge");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "kiwi:printbridge");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) { running = true; worker.execute(this::loop); }
        return START_STICKY;
    }

    private void loop() {
        while (running) {
            watchdog.beat(System.currentTimeMillis());
            String token = BridgeStore.token(this);
            if (token.isEmpty()) { publish("Non associé"); sleep(3000); continue; }
            try {
                JSONObject response = RelayClient.request("GET", "/api/print/jobs", token, null);
                int status = response.optInt("_status");
                if (status == 401) {
                    unauthorized++;
                    if (unauthorized >= 3) { BridgeStore.clearPair(this); publish("Association révoquée · associez à nouveau le pont"); }
                    sleep(2000); continue;
                }
                unauthorized = 0;
                if (status != 200 || !response.optBoolean("ok")) throw new Exception(response.optString("error", "HTTP " + status));
                offerUpdate(response);
                JSONArray jobs = RelayClient.jobs(response);
                int count = jobs == null ? 0 : jobs.length();
                publish("En ligne · " + BridgeStore.merchant(this) + (count > 0 ? " · impression…" : ""));
                // Une imprimante qui vient d'échouer n'est pas réessayée pour les
                // tickets suivants du même lot : ils repartent tout de suite au
                // serveur (« failed », rien n'est sorti), qui les remet en file,
                // au lieu d'attendre chacun leur tour et de dépasser le bail.
                java.util.Set<String> deadTargets = new java.util.HashSet<>();
                for (int i = 0; i < count; i++) {
                    JSONObject job = jobs.getJSONObject(i);
                    boolean ok = false, uncertain = false; int bytes = 0; String error = "";
                    JSONObject target = job.optJSONObject("target");
                    String key = target == null ? "" : target.optString("ip") + ":" + target.optInt("port", 9100);
                    if (!key.isEmpty() && deadTargets.contains(key)) {
                        error = "printer-unreachable " + key + " · skipped after a failure in the same batch";
                    } else {
                        try {
                            bytes = RelayClient.print(job);
                            ok = true;
                            if (target != null && !target.optString("ip").isEmpty()) {
                                BridgeStore.saveWarmTarget(this, target.optString("ip"), target.optInt("port", 9100));
                            }
                        }
                        catch (RelayClient.PrinterException e) { error = readable(e); uncertain = e.uncertain; if (!key.isEmpty()) deadTargets.add(key); }
                        catch (Exception e) { error = readable(e); }
                    }
                    try { RelayClient.ack(token, job.optString("id"), ok, bytes, error, uncertain); }
                    catch (Exception ignored) { /* le serveur conserve le claim ; ne jamais réimprimer à l'aveugle */ }
                    watchdog.beat(System.currentTimeMillis());
                    publish(ok ? "Imprimé · " + BridgeStore.merchant(this) : "Échec d’impression · " + error);
                }
                sleep(count > 0 ? 250 : RelayClient.nextPollMs(response));
            } catch (Exception e) {
                publish("Hors ligne · " + readable(e));
                // Stay conservative while offline, but do not leave a newly
                // queued ticket behind a five-second blind window after the
                // bounded three-second poll timeout.
                sleep(2000);
            } finally {
                try { RelayClient.keepPrinterWarm(); } catch (Throwable ignored) {}
            }
        }
    }

    private String readable(Exception e) {
        String m = e.getMessage(); return (m == null || m.trim().isEmpty()) ? e.getClass().getSimpleName() : m;
    }
    private void publish(String text) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(text));
        sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra(EXTRA_STATUS, text));
    }
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(com.kiwios.printbridge.R.drawable.ic_kiwi)
                .setContentTitle("Kiwi Print Bridge").setContentText(text).setContentIntent(open).setOngoing(true).build();
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel c = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
            c.setDescription(getString(R.string.service_running));
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }
    private void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }
    private void releaseLocks() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        wakeLock = null;
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) {}
        wifiLock = null;
    }
    @Override public void onDestroy() {
        running = false;
        worker.shutdownNow();
        if (guard != null) guard.shutdownNow();
        releaseLocks();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}

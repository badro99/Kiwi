package com.kiwios.printbridge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class BridgeService extends Service {
    static final String ACTION_STATUS = "com.kiwios.printbridge.STATUS";
    static final String EXTRA_STATUS = "status";
    private static final String CHANNEL = "kiwi_print_bridge";
    private static final int NOTIFICATION_ID = 1707;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean running;
    private int unauthorized;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, notification("Connexion à Kiwi…"));
        String warmIp = BridgeStore.warmIp(this);
        int warmPort = BridgeStore.warmPort(this);
        long warmAt = BridgeStore.warmAt(this);
        RelayClient.resumePrinterWarm(warmIp, warmPort, warmAt);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) { running = true; worker.execute(this::loop); }
        return START_STICKY;
    }

    private void loop() {
        while (running) {
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
                JSONArray jobs = RelayClient.jobs(response);
                int count = jobs == null ? 0 : jobs.length();
                publish("En ligne · " + BridgeStore.merchant(this) + (count > 0 ? " · impression…" : ""));
                for (int i = 0; i < count; i++) {
                    JSONObject job = jobs.getJSONObject(i);
                    boolean ok = false; int bytes = 0; String error = "";
                    try {
                        bytes = RelayClient.print(job);
                        ok = true;
                        JSONObject target = job.optJSONObject("target");
                        if (target != null && !target.optString("ip").isEmpty()) {
                            BridgeStore.saveWarmTarget(this, target.optString("ip"), target.optInt("port", 9100));
                        }
                    }
                    catch (Exception e) { error = readable(e); }
                    try { RelayClient.ack(token, job.optString("id"), ok, bytes, error); }
                    catch (Exception ignored) { /* le serveur conserve le claim ; ne jamais réimprimer à l'aveugle */ }
                    publish(ok ? "Imprimé · " + BridgeStore.merchant(this) : "Échec d’impression · " + error);
                }
                RelayClient.keepPrinterWarm();
                sleep(count > 0 ? 250 : 1000);
            } catch (Exception e) {
                publish("Hors ligne · " + readable(e));
                // Stay conservative while offline, but do not leave a newly
                // queued ticket behind a five-second blind window after the
                // bounded three-second poll timeout.
                sleep(2000);
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
    @Override public void onDestroy() { running = false; worker.shutdownNow(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}

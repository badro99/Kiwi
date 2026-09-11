package com.kiwios.printbridge;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends AppCompatActivity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private TextView status;
    private final BroadcastReceiver updates = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { status.setText(i.getStringExtra(BridgeService.EXTRA_STATUS)); }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state); setContentView(R.layout.activity_main);
        status = findViewById(R.id.status);
        EditText code = findViewById(R.id.code), ip = findViewById(R.id.printerIp), port = findViewById(R.id.printerPort);
        Button pair = findViewById(R.id.pair), unpair = findViewById(R.id.unpair), test = findViewById(R.id.test);
        pair.setOnClickListener(v -> {
            String digits = code.getText().toString().replaceAll("\\D", "");
            if (digits.length() != 6) { status.setText("Saisissez les 6 chiffres affichés dans Kiwi."); return; }
            pair.setEnabled(false); status.setText("Association en cours…");
            worker.execute(() -> {
                try {
                    String name = Build.MANUFACTURER + " " + Build.MODEL;
                    JSONObject r = RelayClient.pair(digits, name.trim());
                    if (!r.optBoolean("ok")) throw new Exception(r.optString("error", "Association refusée"));
                    BridgeStore.savePair(this, r.getString("token"), r.optString("merchant"), r.optString("bridgeId"));
                    startBridge(); runOnUiThread(() -> { status.setText("Associé à " + r.optString("merchant")); code.setText(""); pair.setEnabled(true); });
                } catch (Exception e) { runOnUiThread(() -> { status.setText("Échec : " + e.getMessage()); pair.setEnabled(true); }); }
            });
        });
        unpair.setOnClickListener(v -> { BridgeStore.clearPair(this); stopService(new Intent(this, BridgeService.class)); status.setText("Non associé"); });
        test.setOnClickListener(v -> worker.execute(() -> {
            try {
                JSONObject target = new JSONObject().put("ip", ip.getText().toString().trim()).put("port", Integer.parseInt(port.getText().toString()));
                String stamp = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE).format(new Date());
                byte[] ticket = ("\u001b@\u001ba\u0001KIWI PRINT BRIDGE\n\u001ba\u0000\nImprimante connectee\n" + stamp + "\n\n\n\u001dV\u0000").getBytes(StandardCharsets.ISO_8859_1);
                JSONObject job = new JSONObject().put("target", target).put("dataB64", android.util.Base64.encodeToString(ticket, android.util.Base64.NO_WRAP));
                int n = RelayClient.print(job); runOnUiThread(() -> status.setText("Ticket test imprimé · " + n + " octets"));
            } catch (Exception e) { runOnUiThread(() -> status.setText("Test impossible : " + e.getMessage())); }
        }));
        requestNotifications();
        requestIgnoreBatteryOptimizations();
        if (!BridgeStore.token(this).isEmpty()) { status.setText("Associé à " + BridgeStore.merchant(this)); startBridge(); }
    }

    private void startBridge() { ContextCompat.startForegroundService(this, new Intent(this, BridgeService.class)); }
    private void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 40);
    }
    private void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            } catch (Exception ignored) {}
        }
    }
    @Override protected void onStart() {
        super.onStart();
        IntentFilter f = new IntentFilter(BridgeService.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(updates, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(updates, f);
    }
    @Override protected void onStop() { unregisterReceiver(updates); super.onStop(); }
    @Override protected void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}

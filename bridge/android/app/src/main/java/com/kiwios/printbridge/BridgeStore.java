package com.kiwios.printbridge;

import android.content.Context;
import android.content.SharedPreferences;

final class BridgeStore {
    private static final String FILE = "kiwi_bridge";
    static final String RELAY = "https://kiwi-os.com";
    private BridgeStore() {}
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(FILE, Context.MODE_PRIVATE); }
    static String token(Context c) { return prefs(c).getString("token", ""); }
    static String merchant(Context c) { return prefs(c).getString("merchant", ""); }
    static void savePair(Context c, String token, String merchant, String bridgeId) {
        prefs(c).edit().putString("token", token).putString("merchant", merchant).putString("bridgeId", bridgeId).apply();
    }
    static void clearPair(Context c) {
        prefs(c).edit().remove("token").remove("merchant").remove("bridgeId").apply();
    }
    static void saveWarmTarget(Context c, String ip, int port) {
        prefs(c).edit().putString("warmIp", ip).putInt("warmPort", port).putLong("warmAt", System.currentTimeMillis()).apply();
    }
    static String warmIp(Context c) { return prefs(c).getString("warmIp", ""); }
    static int warmPort(Context c) { return prefs(c).getInt("warmPort", 9100); }
    static long warmAt(Context c) { return prefs(c).getLong("warmAt", 0L); }
}

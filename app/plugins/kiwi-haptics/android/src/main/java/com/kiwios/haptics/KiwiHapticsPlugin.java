package com.kiwios.haptics;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android half of KiwiHaptics (spec §15). It plays exactly the waveforms of
 * the stock {@code @capacitor/haptics} 8.0.2 ({@code HapticsImpactType},
 * {@code HapticsNotificationType}, {@code HapticsSelectionType}), keeps the same
 * rule that a selection tick is silent until {@code selectionStart}, and
 * resolves {@code play} with {@code {t: SystemClock.uptimeMillis() / 1000}}
 * read right after the vibrator call returned, so Android latency is traced
 * the same way as iOS (reported, not gated).
 *
 * The stock plugin has no SOFT style; the prepared mode adds one here, lighter
 * than LIGHT. There is nothing to prepare on Android, so {@code prepare} only
 * resolves.
 */
@CapacitorPlugin(name = "KiwiHaptics")
public class KiwiHapticsPlugin extends Plugin {
    private Vibrator vibrator;
    private boolean selectionStarted = false;

    // timings, amplitudes, pre-API-26 pattern. Copied from the stock plugin.
    private static final long[] LIGHT_T = { 0, 50 };
    private static final int[] LIGHT_A = { 0, 110 };
    private static final long[] LIGHT_OLD = { 0, 20 };
    private static final long[] MEDIUM_T = { 0, 43 };
    private static final int[] MEDIUM_A = { 0, 180 };
    private static final long[] MEDIUM_OLD = { 0, 43 };
    private static final long[] HEAVY_T = { 0, 60 };
    private static final int[] HEAVY_A = { 0, 255 };
    private static final long[] HEAVY_OLD = { 0, 61 };
    // Prepared mode only: lighter and shorter than LIGHT.
    private static final long[] SOFT_T = { 0, 40 };
    private static final int[] SOFT_A = { 0, 70 };
    private static final long[] SOFT_OLD = { 0, 14 };

    private static final long[] SUCCESS_T = { 0, 35, 65, 21 };
    private static final int[] SUCCESS_A = { 0, 250, 0, 180 };
    private static final long[] SUCCESS_OLD = { 0, 35, 65, 21 };
    private static final long[] WARNING_T = { 0, 30, 40, 30, 50, 60 };
    private static final int[] WARNING_A = { 255, 255, 255, 255, 255, 255 };
    private static final long[] WARNING_OLD = { 0, 30, 40, 30, 50, 60 };
    private static final long[] ERROR_T = { 0, 27, 45, 50 };
    private static final int[] ERROR_A = { 0, 120, 0, 250 };
    private static final long[] ERROR_OLD = { 0, 27, 45, 50 };

    private static final long[] SELECTION_T = { 0, 100 };
    private static final int[] SELECTION_A = { 0, 100 };
    private static final long[] SELECTION_OLD = { 0, 70 };

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager != null ? manager.getDefaultVibrator() : null;
        } else {
            vibrator = legacyVibrator(context);
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator legacyVibrator(Context context) {
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String kind = call.getString("kind", "impact");
        String style = call.getString("style", "");
        boolean prepared = "prepared".equals(call.getString("mode"));
        if (style == null) style = "";
        style = style.toUpperCase();
        if ("notification".equals(kind)) {
            switch (style) {
                case "WARNING": perform(WARNING_T, WARNING_A, WARNING_OLD); break;
                case "ERROR": perform(ERROR_T, ERROR_A, ERROR_OLD); break;
                default: perform(SUCCESS_T, SUCCESS_A, SUCCESS_OLD);
            }
        } else if ("selection".equals(kind)) {
            switch (style.toLowerCase()) {
                case "start": selectionStarted = true; break;
                case "changed": if (selectionStarted) perform(SELECTION_T, SELECTION_A, SELECTION_OLD); break;
                default: selectionStarted = false; // "end"
            }
        } else {
            switch (style) {
                case "LIGHT": perform(LIGHT_T, LIGHT_A, LIGHT_OLD); break;
                case "MEDIUM": perform(MEDIUM_T, MEDIUM_A, MEDIUM_OLD); break;
                // The stock plugin falls back to HEAVY for any other style. SOFT
                // is Kiwi's own and only exists in prepared mode; in stock mode it
                // plays LIGHT, like iOS.
                case "SOFT":
                    if (prepared) perform(SOFT_T, SOFT_A, SOFT_OLD); else perform(LIGHT_T, LIGHT_A, LIGHT_OLD);
                    break;
                case "RIGID": perform(LIGHT_T, LIGHT_A, LIGHT_OLD); break;
                default: perform(HEAVY_T, HEAVY_A, HEAVY_OLD);
            }
        }
        call.resolve(now());
    }

    @PluginMethod
    public void clock(PluginCall call) {
        call.resolve(now());
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        call.resolve();
    }

    private JSObject now() {
        JSObject result = new JSObject();
        result.put("t", SystemClock.uptimeMillis() / 1000.0);
        return result;
    }

    private void perform(long[] timings, int[] amplitudes, long[] oldPattern) {
        if (vibrator == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
        } else {
            vibratePre26(oldPattern);
        }
    }

    @SuppressWarnings("deprecation")
    private void vibratePre26(long[] pattern) {
        vibrator.vibrate(pattern, -1);
    }
}

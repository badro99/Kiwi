package com.kiwios.dynamictype;

import android.content.res.Configuration;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android half of KiwiDynamicType: the system text size is
 * {@code Configuration.fontScale} (1.0 by default). Same contract as iOS:
 * {@code getDynamicTypeScale()} resolves {@code {scale, category}} and the
 * plugin emits {@code dynamicTypeChange} with the same shape when the user
 * changes the text size. The activity declares {@code fontScale} in
 * {@code android:configChanges}, so a change reaches
 * {@link #handleOnConfigurationChanged} instead of recreating the till.
 *
 * {@code hostTextZoom} reports the WebView text zoom MainActivity applies from
 * the same scale (85 to 135 %): on Android the host already scales every font
 * size, so a page must not multiply by {@code scale} a second time.
 */
@CapacitorPlugin(name = "KiwiDynamicType")
public class KiwiDynamicTypePlugin extends Plugin {
    private float lastScale = -1f;

    @Override
    public void load() {
        super.load();
        lastScale = currentFontScale();
    }

    @PluginMethod
    public void getDynamicTypeScale(PluginCall call) {
        call.resolve(payload(currentFontScale()));
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        float scale = newConfig != null && newConfig.fontScale > 0f ? newConfig.fontScale : 1f;
        if (Math.abs(scale - lastScale) < 0.001f) return;
        lastScale = scale;
        notifyListeners("dynamicTypeChange", payload(scale));
    }

    /** Same rule as kiwiTextZoom in MainActivity.kt: font scale in percent, clamped to 85..135. */
    public static int textZoomFor(float fontScale) {
        float scale = fontScale > 0f ? fontScale : 1f;
        return Math.max(85, Math.min(135, Math.round(scale * 100f)));
    }

    private float currentFontScale() {
        float scale = getContext().getResources().getConfiguration().fontScale;
        return scale > 0f ? scale : 1f;
    }

    private static JSObject payload(float fontScale) {
        double scale = Math.round(fontScale * 100.0) / 100.0;
        JSObject result = new JSObject();
        result.put("scale", scale);
        result.put("category", "android-font-scale");
        result.put("fontScale", scale);
        result.put("hostTextZoom", textZoomFor(fontScale));
        return result;
    }
}

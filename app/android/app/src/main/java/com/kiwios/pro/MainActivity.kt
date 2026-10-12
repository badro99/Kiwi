package com.kiwios.pro

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.res.Configuration
import android.os.Bundle
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.WebView
import android.widget.EditText
import android.widget.FrameLayout
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.absolutePadding
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.PointOfSale
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.RestaurantMenu
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.TableRestaurant
import androidx.compose.material.icons.outlined.TakeoutDining
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient
import com.getcapacitor.WebViewListener
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import org.json.JSONObject

// Brand tokens, mirrored from assets/tokens.css. Never a new accent here.
private val KiwiInk = Color(0xFF0A0F0D)    // --ink
private val KiwiMint = Color(0xFF7DF2B0)   // --mint (accent, on ink only)
private val KiwiPaper = Color(0xFFF7F5F0)  // --paper
private val KiwiAtlas = Color(0xFF0B6E4F)  // --atlas (accent ink on paper)

/* Height of the tab capsule above the navigation bar: a 58dp row plus 7dp of
 * padding above and below. The overlay adds the part of the navigation bar that
 * actually overlaps the content, so it neither clips under three-button
 * navigation nor wastes space under the gesture handle. */
private const val TAB_CONTENT_DP = 72f

/* Android WebView already multiplies every font size by the system font scale.
 * We own that number instead of inheriting it unbounded (Android 14 allows 2x),
 * with the same 0.85 to 1.35 range the web and iOS Dynamic Type use. Keep in
 * step with KiwiDynamicTypePlugin.textZoomFor, which reports it to the web. */
internal fun kiwiTextZoom(fontScale: Float): Int {
    val scale = if (fontScale > 0f) fontScale else 1f
    return (scale * 100f).roundToInt().coerceIn(85, 135)
}

private fun kiwiLanguage(raw: String?): String? {
    val code = raw?.trim()?.lowercase(Locale.ROOT)?.take(2).orEmpty()
    return if (code == "fr" || code == "en" || code == "ar") code else null
}

private data class HostField(val id: String, val label: String, val value: String, val input: String, val secure: Boolean)
private data class HostChoice(val id: String, val title: String, val subtitle: String, val selected: Boolean, val group: String)
private data class HostAction(val id: String, val label: String, val style: String, val enabled: Boolean)
private data class HostSummary(val label: String, val value: String, val muted: Boolean)
private data class HostTab(val id: String, val label: String)
private data class HostContext(
    val screen: String = "launch", val locale: String = "fr", val rtl: Boolean = false,
    val kind: String = "account", val progress: Int = 0, val progressTotal: Int = 0,
    val eyebrow: String = "", val title: String = "", val message: String = "",
    val status: String = "", val statusKind: String = "", val accountLabel: String = "",
    val role: String = "", val selected: String = "", val fields: List<HostField> = emptyList(),
    val choices: List<HostChoice> = emptyList(), val summary: List<HostSummary> = emptyList(),
    val actions: List<HostAction> = emptyList(), val tabs: List<HostTab> = emptyList()
)

class MainActivity : BridgeActivity() {
    // Avoid Activity/View `context` shadowing inside Compose lambdas.
    private var hostContext by mutableStateOf(HostContext())
    private var revision by mutableIntStateOf(0)
    private lateinit var nativeOverlay: ComposeView

    // Root window insets (system bars + display cutout), px.
    private var systemInsets: Insets = Insets.NONE
    // The part of the navigation bar that overlaps the content area, px. Zero
    // while the system still lays content out between the bars (Android 14 and
    // older here); the bar's full size once the window is edge to edge. One
    // value sizes the overlay and pads the Compose capsule, so they cannot disagree.
    private var tabBarInset by mutableStateOf(Insets.NONE)
    private var lastPublishedInsets = ""
    // Language of the page, read on every load and on every host message.
    private var webLanguage: String? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val host = bridge ?: return
        val webView = host.webView ?: return
        webView.addJavascriptInterface(ShellJavascriptBridge(), "KiwiShellHost")
        // Same file chooser, permissions and console handling as Capacitor's
        // client; only alert/confirm/prompt change, to speak the page's language.
        webView.webChromeClient = KiwiChromeClient(host) { dialogLanguage() }
        webView.settings.textZoom = kiwiTextZoom(resources.configuration.fontScale)
        host.addWebViewListener(object : WebViewListener() {
            override fun onPageLoaded(webView: WebView?) {
                readPageLanguage()
                publishHostInsets(force = true)
            }
        })

        nativeOverlay = ComposeView(this).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                MaterialTheme {
                    CompositionLocalProvider(LocalLayoutDirection provides (if (hostContext.rtl) LayoutDirection.Rtl else LayoutDirection.Ltr)) {
                        when {
                            hostContext.screen == "launch" -> LaunchSurface()
                            hostContext.screen == "setup" -> SetupSurface(hostContext, revision, ::sendAction)
                            hostContext.tabs.isNotEmpty() -> NativeTabs(hostContext, tabBarInset, ::sendAction)
                        }
                    }
                }
            }
        }
        // targetSdk 36 is edge to edge from Android 15: any inset change (rotation,
        // gesture/three-button switch) re-measures the bars; the insets go on,
        // untouched, to Compose inside the overlay.
        ViewCompat.setOnApplyWindowInsetsListener(nativeOverlay) { view, insets ->
            view.post { refreshBarInsets() }
            insets
        }
        webView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> publishHostInsets() }
        val content = findViewById<FrameLayout>(android.R.id.content)
        content.addView(nativeOverlay)
        content.addOnLayoutChangeListener { view, l, t, r, b, oldL, oldT, oldR, oldB ->
            if (l != oldL || t != oldT || r != oldR || b != oldB) view.post { refreshBarInsets() }
        }
        applyOverlayLayout()
        ViewCompat.requestApplyInsets(nativeOverlay)
        webView.post { requestState() }
        webView.postDelayed({ requestState() }, 350)
        webView.postDelayed({ requestState() }, 1200)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        // BridgeActivity forwards this to plugins: KiwiDynamicType emits
        // dynamicTypeChange from it when the system font scale moves.
        super.onConfigurationChanged(newConfig)
        bridge?.webView?.settings?.textZoom = kiwiTextZoom(newConfig.fontScale)
    }

    private inner class ShellJavascriptBridge {
        @JavascriptInterface fun postMessage(raw: String) {
            runOnUiThread {
                val url = bridge?.webView?.url.orEmpty()
                if (!url.startsWith("https://localhost/") && !url.startsWith("http://localhost/")) return@runOnUiThread
                hostContext = parseContext(raw)
                kiwiLanguage(hostContext.locale)?.let { webLanguage = it }
                revision += 1
                applyOverlayLayout()
                publishHostInsets(force = true)
            }
        }
    }

    private fun tabsVisible(): Boolean =
        hostContext.screen != "launch" && hostContext.screen != "setup" && hostContext.tabs.isNotEmpty()

    private fun tabOverlayHeightPx(): Int =
        (TAB_CONTENT_DP * resources.displayMetrics.density).roundToInt() + tabBarInset.bottom

    /* Root insets measured against the content area: right both edge to edge
     * (bars drawn over the content) and when content still sits between them. */
    private fun refreshBarInsets() {
        val root = window?.decorView ?: return
        val rootInsets = ViewCompat.getRootWindowInsets(root) ?: return
        val content = findViewById<View>(android.R.id.content) ?: return
        if (content.width == 0 || content.height == 0) return
        val at = IntArray(2)
        content.getLocationInWindow(at)
        val nav = rootInsets.getInsets(WindowInsetsCompat.Type.navigationBars())
        val overlap = Insets.of(
            max(0, nav.left - at[0]),
            0,
            max(0, nav.right - (root.width - at[0] - content.width)),
            max(0, nav.bottom - (root.height - at[1] - content.height))
        )
        systemInsets = rootInsets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        if (overlap != tabBarInset) {
            tabBarInset = overlap
            applyOverlayLayout()
        }
        publishHostInsets()
    }

    private fun applyOverlayLayout() {
        if (!::nativeOverlay.isInitialized) return
        val height = when {
            hostContext.screen == "launch" || hostContext.screen == "setup" -> ViewGroup.LayoutParams.MATCH_PARENT
            tabsVisible() -> tabOverlayHeightPx()
            else -> 0
        }
        nativeOverlay.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height, Gravity.BOTTOM)
        nativeOverlay.bringToFront()
    }

    /* Mirrors KiwiNativeShell.publishSafeAreaInsets on iOS: the web reads
     * --kiwi-host-safe-* and --kiwi-host-tab-height (CSS px) from the root style.
     * Capacitor may pad the WebView inside the bars or let it run under them, so
     * each safe value is the part of a bar that overlaps the WebView, and the tab
     * height is the part of the overlay (pinned to the content bottom) over it. */
    private fun publishHostInsets(force: Boolean = false) {
        val webView = bridge?.webView ?: return
        val url = webView.url.orEmpty()
        if (!url.startsWith("https://localhost/") && !url.startsWith("http://localhost/")) return
        val root = window?.decorView ?: return
        if (webView.width == 0 || webView.height == 0 || root.width == 0 || root.height == 0) return
        val content = findViewById<View>(android.R.id.content) ?: return
        val origin = IntArray(2)
        webView.getLocationInWindow(origin)
        val at = IntArray(2)
        content.getLocationInWindow(at)
        val webBottom = origin[1] + webView.height
        val contentBottom = at[1] + content.height
        val top = max(0, systemInsets.top - origin[1])
        val left = max(0, systemInsets.left - origin[0])
        val right = max(0, systemInsets.right - (root.width - origin[0] - webView.width))
        val bottom = max(0, systemInsets.bottom - (root.height - webBottom))
        val tab = if (tabsVisible()) max(0, min(webBottom, contentBottom) - max(origin[1], contentBottom - tabOverlayHeightPx())) else 0
        val density = resources.displayMetrics.density
        fun css(px: Int) = String.format(Locale.US, "%.2fpx", px / density)
        val script = "(function(s){s.setProperty('--kiwi-host-safe-top','${css(top)}');" +
            "s.setProperty('--kiwi-host-safe-right','${css(right)}');" +
            "s.setProperty('--kiwi-host-safe-bottom','${css(bottom)}');" +
            "s.setProperty('--kiwi-host-safe-left','${css(left)}');" +
            "s.setProperty('--kiwi-host-tab-height','${css(tab)}')})(document.documentElement.style)"
        if (!force && script == lastPublishedInsets) return
        lastPublishedInsets = script
        webView.evaluateJavascript(script, null)
    }

    private fun readPageLanguage() {
        bridge?.webView?.evaluateJavascript(
            "(function(){var l=document.documentElement.lang||'';try{l=l||localStorage.getItem('kiwiLang')||''}catch(e){}return l})()"
        ) { value -> kiwiLanguage(value?.trim('"'))?.let { webLanguage = it } }
    }

    // The page speaks fr/en/ar; until it says which, follow the device, then fr.
    private fun dialogLanguage(): String =
        webLanguage ?: kiwiLanguage(Locale.getDefault().language) ?: "fr"

    private fun requestState() {
        bridge?.webView?.evaluateJavascript("window.KiwiNativeHostRequestState&&window.KiwiNativeHostRequestState()", null)
    }

    private fun sendAction(action: String, id: String = "", values: Map<String, String> = emptyMap()) {
        val payload = JSONObject(values).put("action", action)
        if (id.isNotEmpty()) payload.put("id", id)
        val encoded = Base64.encodeToString(payload.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        bridge?.webView?.evaluateJavascript("window.KiwiNativeHostAction&&window.KiwiNativeHostAction(JSON.parse(atob('$encoded')))", null)
    }

    private fun parseContext(raw: String): HostContext = runCatching {
        val json = JSONObject(raw)
        fun fields(name: String): List<HostField> = json.optJSONArray(name)?.let { array ->
            (0 until array.length()).map { array.getJSONObject(it) }.map { HostField(it.optString("id"), it.optString("label"), it.optString("value"), it.optString("input"), it.optBoolean("secure")) }
        } ?: emptyList()
        fun choices(name: String): List<HostChoice> = json.optJSONArray(name)?.let { array ->
            (0 until array.length()).map { array.getJSONObject(it) }.map { HostChoice(it.optString("id"), it.optString("title"), it.optString("subtitle"), it.optBoolean("selected"), it.optString("group")) }
        } ?: emptyList()
        fun actions(name: String): List<HostAction> = json.optJSONArray(name)?.let { array ->
            (0 until array.length()).map { array.getJSONObject(it) }.map { HostAction(it.optString("id"), it.optString("label"), it.optString("style"), it.optBoolean("enabled", true)) }
        } ?: emptyList()
        val summary = json.optJSONArray("summary")?.let { array -> (0 until array.length()).map { array.getJSONObject(it) }.map { HostSummary(it.optString("label"), it.optString("value"), it.optBoolean("muted")) } } ?: emptyList()
        val tabs = json.optJSONArray("tabs")?.let { array -> (0 until array.length()).map { array.getJSONObject(it) }.map { HostTab(it.optString("id"), it.optString("label")) } } ?: emptyList()
        HostContext(json.optString("screen", "launch"), json.optString("locale", "fr"), json.optBoolean("rtl"), json.optString("kind", "account"), json.optInt("progress"), json.optInt("progressTotal"), json.optString("eyebrow"), json.optString("title"), json.optString("message"), json.optString("status"), json.optString("statusKind"), json.optString("accountLabel"), json.optString("role"), json.optString("selected"), fields("fields"), choices("choices"), summary, actions("actions"), tabs)
    }.getOrElse { HostContext() }
}

/* Capacitor's BridgeWebChromeClient hard-codes "OK" and "Cancel". This subclass
 * replaces only the three JS dialogs; file chooser, camera/mic permission
 * requests, geolocation and console logging stay the base class's. Every path
 * out of a dialog resolves its JsResult exactly once, or the page stays frozen
 * inside confirm(). */
private class KiwiChromeClient(
    private val kiwiBridge: Bridge,
    private val language: () -> String
) : BridgeWebChromeClient(kiwiBridge) {

    private fun labels(): Pair<String, String> = when (language()) {
        "ar" -> "إلغاء" to "موافق"
        "en" -> "Cancel" to "OK"
        else -> "Annuler" to "OK"
    }

    private fun present(view: WebView, message: String?, input: EditText?, onConfirm: () -> Unit, onCancel: () -> Unit, withCancel: Boolean) {
        var settled = false
        fun confirm() { if (!settled) { settled = true; onConfirm() } }
        fun cancel() { if (!settled) { settled = true; onCancel() } }
        val (cancelLabel, okLabel) = labels()
        val builder = AlertDialog.Builder(view.context)
            .setMessage(message.orEmpty())
            .setPositiveButton(okLabel) { dialog, _ -> confirm(); dialog.dismiss() }
            .setOnCancelListener { cancel() }
            // Any other way out (activity torn down, dialog dismissed) still settles.
            .setOnDismissListener { cancel() }
        if (withCancel) builder.setNegativeButton(cancelLabel) { dialog, _ -> cancel(); dialog.dismiss() }
        if (input != null) {
            val pad = (20 * view.resources.displayMetrics.density).roundToInt()
            builder.setView(FrameLayout(view.context).apply {
                setPadding(pad, pad / 2, pad, 0)
                addView(input)
            })
        }
        val dialog = builder.create()
        // The back key may cancel; a stray tap beside the dialog may not.
        dialog.setCancelable(true)
        dialog.setCanceledOnTouchOutside(false)
        dialog.show()
        if (language() == "ar") dialog.window?.decorView?.layoutDirection = View.LAYOUT_DIRECTION_RTL
    }

    private fun finishing(): Boolean = kiwiBridge.activity?.isFinishing ?: true

    override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
        if (finishing()) { result.cancel(); return true }
        present(view, message, null, { result.confirm() }, { result.cancel() }, withCancel = false)
        return true
    }

    override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
        if (finishing()) { result.cancel(); return true }
        present(view, message, null, { result.confirm() }, { result.cancel() }, withCancel = true)
        return true
    }

    override fun onJsPrompt(view: WebView, url: String?, message: String?, defaultValue: String?, result: JsPromptResult): Boolean {
        if (finishing()) { result.cancel(); return true }
        val input = EditText(view.context).apply {
            setSingleLine(true)
            setText(defaultValue.orEmpty())
            setSelectAllOnFocus(true)
        }
        present(view, message, input, { result.confirm(input.text.toString().trim()) }, { result.cancel() }, withCancel = true)
        return true
    }
}

@Composable private fun LaunchSurface() {
    Box(Modifier.fillMaxSize().background(KiwiInk), contentAlignment = Alignment.Center) { KiwiBrandIcon(132.dp, 30.dp) }
}

@Composable private fun KiwiBrandIcon(size: Dp, corner: Dp) {
    Image(
        painter = painterResource(R.drawable.kiwi_brand_icon),
        contentDescription = "Kiwi Pro",
        modifier = Modifier.size(size).clip(RoundedCornerShape(corner))
    )
}

@Composable private fun SetupSurface(context: HostContext, revision: Int, send: (String, String, Map<String, String>) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("9100") }
    var paper by remember { mutableStateOf("80") }
    val passwordFocus = remember { FocusRequester() }
    val portFocus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(revision) {
        context.fields.firstOrNull { it.id == "email" }?.value?.takeIf { email.isEmpty() }?.let { email = it }
        context.fields.firstOrNull { it.id == "host" }?.value?.takeIf { it.isNotEmpty() }?.let { host = it }
        context.fields.firstOrNull { it.id == "port" }?.value?.takeIf { it.isNotEmpty() }?.let { port = it }
        context.choices.firstOrNull { it.group == "paper" && it.selected }?.id?.let { paper = it }
    }
    fun perform(action: HostAction) {
        focusManager.clearFocus()
        when (action.id) {
            "login" -> { send(action.id, "", mapOf("email" to email, "password" to password)); password = "" }
            "printer-test" -> send(action.id, "", mapOf("host" to host, "port" to port, "paper" to paper))
            else -> send(action.id, "", emptyMap())
        }
    }
    // Same as iOS: the keyboard's Go key runs the step's action only when its button is enabled.
    fun submit(id: String) { context.actions.firstOrNull { it.id == id && it.enabled }?.let { perform(it) } }
    // Ink runs under the bars; the content stays clear of them and of the keyboard.
    LazyColumn(modifier = Modifier.fillMaxSize().background(KiwiInk).systemBarsPadding().displayCutoutPadding().imePadding().padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Spacer(Modifier.height(18.dp)); KiwiBrandIcon(76.dp, 18.dp) }
        if (context.progressTotal > 0) item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                repeat(context.progressTotal) { index -> Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(if (index < context.progress) KiwiMint else KiwiPaper.copy(alpha = .2f))) }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp)).background(KiwiPaper).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (context.eyebrow.isNotEmpty()) Text(context.eyebrow.uppercase(), color = KiwiInk.copy(alpha = .58f), fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                Text(context.title, color = KiwiInk, fontSize = 32.sp, lineHeight = 35.sp, fontWeight = FontWeight.Bold)
                if (context.message.isNotEmpty()) Text(context.message, color = KiwiInk.copy(alpha = .66f), fontSize = 16.sp, lineHeight = 22.sp)
                if (context.kind == "account" && context.fields.isNotEmpty()) {
                    NativeField(context.fields.firstOrNull { it.id == "email" }?.label ?: "Email", email, { email = it }, false, KeyboardType.Email, ImeAction.Next,
                        KeyboardActions(onNext = { passwordFocus.requestFocus() }))
                    NativeField(context.fields.firstOrNull { it.id == "password" }?.label ?: "Password", password, { password = it }, true, KeyboardType.Password, ImeAction.Go,
                        KeyboardActions(onGo = { submit("login") }), Modifier.focusRequester(passwordFocus))
                }
                if (context.kind == "printer") {
                    NativeField(context.fields.firstOrNull { it.id == "host" }?.label ?: "IP", host, { host = it }, false, KeyboardType.Decimal, ImeAction.Next,
                        KeyboardActions(onNext = { portFocus.requestFocus() }))
                    NativeField(context.fields.firstOrNull { it.id == "port" }?.label ?: "Port", port, { port = it }, false, KeyboardType.Number, ImeAction.Go,
                        KeyboardActions(onGo = { submit("printer-test") }), Modifier.focusRequester(portFocus))
                }
                context.choices.forEach { choice -> ChoiceRow(choice, paper) { selected ->
                    when (choice.group) {
                        "role" -> send("select-role", selected, emptyMap())
                        "store" -> send("select-store", selected, emptyMap())
                        "paper" -> { paper = selected; send("select-paper", selected, emptyMap()) }
                        "printer" -> { host = selected; send("select-printer", selected, emptyMap()) }
                    }
                } }
                context.summary.forEach { item -> Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) { Text(item.label, color = KiwiInk, fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f)); Text(item.value, color = KiwiInk.copy(alpha = if (item.muted) .42f else .72f)) } }
                if (context.status.isNotEmpty()) Text(context.status, color = KiwiInk.copy(alpha = .72f), modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(KiwiInk.copy(alpha = .05f)).padding(14.dp))
                context.actions.forEach { action ->
                    Button(onClick = { perform(action) }, enabled = action.enabled, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(17.dp), colors = ButtonDefaults.buttonColors(containerColor = if (action.style == "primary") KiwiInk else Color.Transparent, contentColor = if (action.style == "primary") KiwiPaper else KiwiInk, disabledContainerColor = KiwiInk.copy(alpha = .08f), disabledContentColor = KiwiInk.copy(alpha = .4f))) { Text(action.label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable private fun NativeField(label: String, value: String, change: (String) -> Unit, secure: Boolean, keyboard: KeyboardType, ime: ImeAction, actions: KeyboardActions, modifier: Modifier = Modifier) {
    OutlinedTextField(value = value, onValueChange = change, label = { Text(label) }, singleLine = true, visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None, keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ime), keyboardActions = actions, modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
}

@Composable private fun ChoiceRow(choice: HostChoice, paper: String, select: (String) -> Unit) {
    val selected = choice.selected || (choice.group == "paper" && paper == choice.id)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (selected) KiwiMint.copy(alpha = .12f) else KiwiInk.copy(alpha = .035f)).border(1.dp, if (selected) KiwiMint.copy(alpha = .8f) else KiwiInk.copy(alpha = .08f), RoundedCornerShape(18.dp)).clickable { select(choice.id) }.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
        // Mint is an accent for ink surfaces; on paper the selected glyph takes atlas.
        Icon(choiceIcon(choice.id, choice.group), contentDescription = null, tint = if (selected) KiwiAtlas else KiwiInk.copy(alpha = .62f), modifier = Modifier.size(27.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) { Text(choice.title, color = KiwiInk, fontWeight = FontWeight.SemiBold); if (choice.subtitle.isNotEmpty()) Text(choice.subtitle, color = KiwiInk.copy(alpha = .56f), fontSize = 13.sp) }
        if (selected) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = KiwiAtlas, modifier = Modifier.size(22.dp))
    }
}

@Composable private fun NativeTabs(context: HostContext, inset: Insets, send: (String, String, Map<String, String>) -> Unit) {
    // Fills the overlay, whose height is TAB_CONTENT_DP + inset.bottom: the same
    // inset pads the capsule, so the row always lands just above the bar.
    val density = LocalDensity.current
    val pad = with(density) { Triple(inset.left.toDp(), inset.right.toDp(), inset.bottom.toDp()) }
    Surface(modifier = Modifier.fillMaxSize(), color = KiwiPaper, shadowElevation = 14.dp) {
        Row(Modifier.fillMaxWidth().absolutePadding(left = pad.first, right = pad.second, bottom = pad.third).padding(horizontal = 10.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            context.tabs.forEach { tab ->
                val active = context.selected == tab.id
                Column(Modifier.weight(1f).height(58.dp).clip(RoundedCornerShape(18.dp)).background(if (active) KiwiInk else Color.Transparent).clickable { send("navigate", tab.id, emptyMap()) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(choiceIcon(tab.id, "tab"), contentDescription = null, tint = if (active) KiwiMint else KiwiInk.copy(alpha = .58f), modifier = Modifier.size(21.dp))
                    Text(tab.label, color = if (active) KiwiMint else KiwiInk.copy(alpha = .58f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/* One Material icon per id the web sends: setup roles and paper widths
 * (native-shell.js), caisse tabs (salle/vrap/waitlist), owner tabs
 * (accueil/transactions/rapport/clients) and team tabs (tables/menu/
 * notifications/profil), plus the "more" drawer. Mirrors symbol(_:) on iOS. */
private fun choiceIcon(id: String, group: String = ""): ImageVector = when (id) {
    "caisse" -> Icons.Outlined.PointOfSale
    "equipe" -> Icons.Outlined.Groups
    "cuisine" -> Icons.Outlined.Restaurant
    "dashboard" -> Icons.Outlined.Assessment
    "80", "58" -> Icons.Outlined.Receipt
    "salle" -> Icons.Outlined.TableRestaurant
    "vrap" -> Icons.Outlined.TakeoutDining
    "waitlist" -> Icons.Outlined.People
    "accueil" -> Icons.Outlined.Home
    "transactions" -> Icons.Outlined.ReceiptLong
    "rapport" -> Icons.Outlined.Description
    "clients" -> Icons.Outlined.Group
    "tables" -> Icons.Outlined.TableRestaurant
    "menu" -> Icons.Outlined.RestaurantMenu
    "notifications" -> Icons.Outlined.Notifications
    "profil" -> Icons.Outlined.AccountCircle
    "more" -> Icons.Outlined.MoreHoriz
    else -> when (group) {
        "printer" -> Icons.Outlined.Print
        "tab" -> Icons.Outlined.Circle
        else -> Icons.Outlined.Storefront
    }
}

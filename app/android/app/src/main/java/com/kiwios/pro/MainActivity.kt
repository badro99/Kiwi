package com.kiwios.pro

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Base64
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.PointOfSale
import androidx.compose.material.icons.outlined.Restaurant
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.getcapacitor.BridgeActivity
import org.json.JSONObject

private val KiwiInk = Color(0xFF0A0F0D)
private val KiwiMint = Color(0xFF00FFAE)
private val KiwiPaper = Color(0xFFF7F5F0)

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

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = bridge?.webView ?: return
        webView.addJavascriptInterface(ShellJavascriptBridge(), "KiwiShellHost")

        nativeOverlay = ComposeView(this).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                MaterialTheme {
                    when {
                        hostContext.screen == "launch" -> LaunchSurface()
                        hostContext.screen == "setup" -> SetupSurface(hostContext, revision, ::sendAction)
                        hostContext.tabs.isNotEmpty() -> NativeTabs(hostContext, ::sendAction)
                    }
                }
            }
        }
        findViewById<FrameLayout>(android.R.id.content).addView(nativeOverlay)
        applyOverlayLayout()
        webView.post { requestState() }
        webView.postDelayed({ requestState() }, 350)
        webView.postDelayed({ requestState() }, 1200)
    }

    private inner class ShellJavascriptBridge {
        @JavascriptInterface fun postMessage(raw: String) {
            runOnUiThread {
                val url = bridge?.webView?.url.orEmpty()
                if (!url.startsWith("https://localhost/") && !url.startsWith("http://localhost/")) return@runOnUiThread
                hostContext = parseContext(raw)
                revision += 1
                applyOverlayLayout()
            }
        }
    }

    private fun applyOverlayLayout() {
        if (!::nativeOverlay.isInitialized) return
        val height = when {
            hostContext.screen == "launch" || hostContext.screen == "setup" -> ViewGroup.LayoutParams.MATCH_PARENT
            hostContext.tabs.isNotEmpty() -> (104 * resources.displayMetrics.density).toInt()
            else -> 0
        }
        nativeOverlay.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height, Gravity.BOTTOM)
        nativeOverlay.bringToFront()
    }

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

@Composable private fun LaunchSurface() {
    Box(Modifier.fillMaxSize().background(KiwiInk), contentAlignment = Alignment.Center) { KiwiWordmark() }
}

@Composable private fun KiwiWordmark() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.width(42.dp).height(15.dp).clip(RoundedCornerShape(5.dp)).background(KiwiMint.copy(alpha = .55f)))
            Box(Modifier.width(52.dp).height(15.dp).clip(RoundedCornerShape(5.dp)).background(KiwiMint))
        }
        Text("kiwi", color = KiwiPaper, fontSize = 43.sp, fontWeight = FontWeight.Black)
        Text("PRO", color = KiwiMint, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, modifier = Modifier.border(1.dp, KiwiMint.copy(alpha = .55f), CircleShape).padding(horizontal = 10.dp, vertical = 6.dp))
    }
}

@Composable private fun SetupSurface(context: HostContext, revision: Int, send: (String, String, Map<String, String>) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("9100") }
    var paper by remember { mutableStateOf("80") }
    LaunchedEffect(revision) {
        context.fields.firstOrNull { it.id == "email" }?.value?.takeIf { email.isEmpty() }?.let { email = it }
        context.fields.firstOrNull { it.id == "host" }?.value?.takeIf { it.isNotEmpty() }?.let { host = it }
        context.fields.firstOrNull { it.id == "port" }?.value?.takeIf { it.isNotEmpty() }?.let { port = it }
        context.choices.firstOrNull { it.group == "paper" && it.selected }?.id?.let { paper = it }
    }
    LazyColumn(modifier = Modifier.fillMaxSize().background(KiwiInk).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Spacer(Modifier.height(18.dp)); KiwiWordmark() }
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
                    NativeField(context.fields.firstOrNull { it.id == "email" }?.label ?: "Email", email, { email = it }, false, KeyboardType.Email, ImeAction.Next)
                    NativeField(context.fields.firstOrNull { it.id == "password" }?.label ?: "Password", password, { password = it }, true, KeyboardType.Password, ImeAction.Done)
                }
                if (context.kind == "printer") {
                    NativeField(context.fields.firstOrNull { it.id == "host" }?.label ?: "IP", host, { host = it }, false, KeyboardType.Decimal, ImeAction.Next)
                    NativeField(context.fields.firstOrNull { it.id == "port" }?.label ?: "Port", port, { port = it }, false, KeyboardType.Number, ImeAction.Done)
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
                    Button(onClick = {
                        when (action.id) {
                            "login" -> { send(action.id, "", mapOf("email" to email, "password" to password)); password = "" }
                            "printer-test" -> send(action.id, "", mapOf("host" to host, "port" to port, "paper" to paper))
                            else -> send(action.id, "", emptyMap())
                        }
                    }, enabled = action.enabled, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(17.dp), colors = ButtonDefaults.buttonColors(containerColor = if (action.style == "primary") KiwiInk else Color.Transparent, contentColor = if (action.style == "primary") KiwiPaper else KiwiInk, disabledContainerColor = KiwiInk.copy(alpha = .08f), disabledContentColor = KiwiInk.copy(alpha = .4f))) { Text(action.label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable private fun NativeField(label: String, value: String, change: (String) -> Unit, secure: Boolean, keyboard: KeyboardType, ime: ImeAction) {
    OutlinedTextField(value = value, onValueChange = change, label = { Text(label) }, singleLine = true, visualTransformation = if (secure) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ime), modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
}

@Composable private fun ChoiceRow(choice: HostChoice, paper: String, select: (String) -> Unit) {
    val selected = choice.selected || (choice.group == "paper" && paper == choice.id)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (selected) KiwiMint.copy(alpha = .12f) else Color.White.copy(alpha = .55f)).border(1.dp, if (selected) KiwiMint.copy(alpha = .8f) else KiwiInk.copy(alpha = .08f), RoundedCornerShape(18.dp)).clickable { select(choice.id) }.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(choiceIcon(choice.id), contentDescription = null, tint = if (selected) KiwiMint else KiwiInk.copy(alpha = .62f), modifier = Modifier.size(27.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) { Text(choice.title, color = KiwiInk, fontWeight = FontWeight.SemiBold); if (choice.subtitle.isNotEmpty()) Text(choice.subtitle, color = KiwiInk.copy(alpha = .56f), fontSize = 13.sp) }
        if (selected) Text("✓", color = KiwiInk, fontWeight = FontWeight.Bold)
    }
}

@Composable private fun NativeTabs(context: HostContext, send: (String, String, Map<String, String>) -> Unit) {
    Surface(color = KiwiPaper, shadowElevation = 14.dp) {
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 10.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            context.tabs.forEach { tab ->
                val active = context.selected == tab.id
                Column(Modifier.weight(1f).height(58.dp).clip(RoundedCornerShape(18.dp)).background(if (active) KiwiInk else Color.Transparent).clickable { send("navigate", tab.id, emptyMap()) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(choiceIcon(tab.id), contentDescription = null, tint = if (active) KiwiMint else KiwiInk.copy(alpha = .58f), modifier = Modifier.size(21.dp))
                    Text(tab.label, color = if (active) KiwiMint else KiwiInk.copy(alpha = .58f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

private fun choiceIcon(id: String): ImageVector = when (id) {
    "caisse" -> Icons.Outlined.PointOfSale
    "equipe", "waitlist" -> Icons.Outlined.Groups
    "cuisine" -> Icons.Outlined.Restaurant
    "dashboard" -> Icons.Outlined.Assessment
    "salle" -> Icons.Outlined.TableRestaurant
    "vrap" -> Icons.Outlined.TakeoutDining
    "more" -> Icons.Outlined.MoreHoriz
    else -> Icons.Outlined.Storefront
}

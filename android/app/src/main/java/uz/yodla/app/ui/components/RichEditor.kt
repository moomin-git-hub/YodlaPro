package uz.yodla.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Color as AColor
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.yodla.app.R
import uz.yodla.app.data.Files
import uz.yodla.app.ui.theme.LocalDark

/** Handle for the caller to replace the editor content (e.g. after an AI suggestion). */
class RichEditorState { internal var web: WebView? = null
    fun setHtml(html: String) { web?.evaluateJavascript("setHtml(${quote(html)})", null) }
    internal fun doneBusy() { web?.evaluateJavascript("doneBusy()", null) }
}

/**
 * JS string literal for card text. `</` and `<!--` are escaped so text like `</script><script>…` can never close the
 * inline <script> it is embedded in (MathView); U+2028/2029 are escaped because they end a JS line.
 */
internal fun quote(s: String) = kotlinx.serialization.json.JsonPrimitive(s).toString()
    .replace("</", "<\\/").replace("<!--", "<\\!--").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

/**
 * Noji-style WYSIWYG editor (bold, italic, underline, strike, heading, lists, sub/sup, colours, highlight,
 * LaTeX formulas, code, links, images, AI). Runs in a WebView; value is sanitized HTML.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun RichEditor(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    big: Boolean = false,
    error: Boolean = false,
    state: RichEditorState = remember { RichEditorState() },
    onAi: (suspend (String) -> Unit)? = null,
) {
    val ctx = LocalContext.current
    val dark = LocalDark.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var heightPx by remember { mutableIntStateOf(0) }
    val change by rememberUpdatedState(onChange)
    val ai by rememberUpdatedState(onAi)
    val initial = remember { value }
    val main = remember { Handler(Looper.getMainLooper()) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            runCatching { Files.importImage(ctx, uri, 1000) }.onSuccess { state.web?.evaluateJavascript("insertImage(${quote(it)})", null) }
        }
    }
    val labels = buildJsonObject {
        if (onAi != null) put("ai", "AI")
        put("ai_answer", stringResource(R.string.ai_answer)); put("ai_question", stringResource(R.string.ai_question)); put("ai_example", stringResource(R.string.ai_example))
        put("ai_explanation", stringResource(R.string.ai_explanation)); put("ai_improve", stringResource(R.string.ai_improve)); put("done", stringResource(R.string.done)); put("image", stringResource(R.string.image))
    }
    val setup = buildJsonObject {
        put("labels", labels); put("ai", onAi != null); put("dark", dark); put("placeholder", placeholder); put("big", big); put("error", error)
    }.toString()

    AndroidView(
        factory = { c ->
            WebView(c).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                setBackgroundColor(AColor.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.allowFileAccess = true // offline card images are file:// URIs in app storage
                @Suppress("DEPRECATION") settings.allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION") settings.allowUniversalAccessFromFileURLs = false
                settings.domStorageEnabled = false
                isVerticalScrollBarEnabled = false
                addJavascriptInterface(object {
                    @JavascriptInterface fun onChange(html: String) { main.post { change(html) } }
                    @JavascriptInterface fun onHeight(px: Int) { main.post { heightPx = px } }
                    @JavascriptInterface fun pickImage() { main.post { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } }
                    @JavascriptInterface fun ai(action: String) {
                        main.post { scope.launch { try { ai?.invoke(action) } finally { state.doneBusy() } } }
                    }
                }, "Android")
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        view.evaluateJavascript("setup($setup); setHtml(${quote(initial)})", null)
                    }
                }
                loadUrl("file:///android_asset/katex/editor.html")
                state.web = this
            }
        },
        update = { it.evaluateJavascript("if(window.setError) setError($error)", null) },
        modifier = modifier.fillMaxWidth().height(with(density) { if (heightPx > 0) heightPx.dp else 150.dp }),
    )
}

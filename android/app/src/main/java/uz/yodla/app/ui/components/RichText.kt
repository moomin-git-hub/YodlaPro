package uz.yodla.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Color as AColor
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import uz.yodla.app.ui.theme.Brand
import uz.yodla.app.data.isHtml
import uz.yodla.app.ui.theme.LocalDark

private val mathRe = Regex("""\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]""")
private val fenceRe = Regex("```([\\w+#-]*)\\n?([\\s\\S]*?)```")

fun hasMath(s: String) = mathRe.containsMatchIn(s)


/**
 * Card content renderer: **bold**, *italic*, `code`, ```fenced code``` (syntax colored), [links](url),
 * LaTeX ($…$, $$…$$) via bundled KaTeX, and cloze markers (⟦hint⟧ hidden, ⟪answer⟫ highlighted).
 */
@Composable
fun RichText(text: String, modifier: Modifier = Modifier, size: TextUnit = 16.sp, weight: FontWeight = FontWeight.Normal, center: Boolean = false, color: Color = MaterialTheme.colorScheme.onSurface, family: FontFamily? = null) {
    if (hasMath(text) || isHtml(text)) { MathView(text, modifier, size, weight, center, color); return }
    Column(modifier.fillMaxWidth(), horizontalAlignment = if (center) androidx.compose.ui.Alignment.CenterHorizontally else androidx.compose.ui.Alignment.Start) {
        var last = 0
        val parts = mutableListOf<Pair<Boolean, String>>()
        val langs = mutableListOf<String>()
        for (m in fenceRe.findAll(text)) {
            if (m.range.first > last) parts += false to text.substring(last, m.range.first)
            parts += true to m.groupValues[2].trimEnd(); langs += m.groupValues[1]
            last = m.range.last + 1
        }
        if (last < text.length) parts += false to text.substring(last)
        var li = 0
        parts.forEach { (code, s) ->
            if (code) CodeBlock(s, langs[li++])
            else if (s.isNotBlank()) Text(
                inline(s.trim('\n'), color), style = MaterialTheme.typography.bodyLarge.copy(fontSize = size, lineHeight = size * 1.35f, fontWeight = weight, color = color, fontFamily = family),
                textAlign = if (center) TextAlign.Center else TextAlign.Start,
            )
        }
    }
}

fun inline(s: String, base: Color): AnnotatedString = buildAnnotatedString {
    val re = Regex("""\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)|`([^`]+)`|\[([^\]]+)]\((https?://[^)\s]+)\)|(https?://[^\s)]+)|⟦([^⟧]*)⟧|⟪([^⟫]*)⟫""")
    var i = 0
    for (m in re.findAll(s)) {
        append(s.substring(i, m.range.first))
        val g = m.groupValues
        when {
            g[1].isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(g[1]) }
            g[2].isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[2]) }
            g[3].isNotEmpty() -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = base.copy(alpha = 0.08f))) { append(" ${g[3]} ") }
            g[4].isNotEmpty() -> withLink(LinkAnnotation.Url(g[5], TextLinkStyles(SpanStyle(color = Brand, textDecoration = TextDecoration.Underline)))) { append(g[4]) }
            g[6].isNotEmpty() -> withLink(LinkAnnotation.Url(g[6], TextLinkStyles(SpanStyle(color = Brand, textDecoration = TextDecoration.Underline)))) { append(g[6]) }
            m.value.startsWith("⟦") -> withStyle(SpanStyle(color = Brand, fontWeight = FontWeight.ExtraBold, background = Brand.copy(alpha = 0.12f))) { append(" [${g[7]}] ") }
            m.value.startsWith("⟪") -> withStyle(SpanStyle(color = Brand, fontWeight = FontWeight.ExtraBold, textDecoration = TextDecoration.Underline)) { append(g[8]) }
        }
        i = m.range.last + 1
    }
    append(s.substring(i))
}

private val KEYWORDS = setOf(
    "fun", "val", "var", "class", "object", "interface", "return", "if", "else", "for", "while", "when", "in", "is", "as", "null", "true", "false",
    "function", "const", "let", "async", "await", "import", "from", "export", "default", "new", "this", "def", "self", "None", "True", "False",
    "public", "private", "protected", "static", "void", "int", "string", "bool", "float", "double", "char", "struct", "enum", "try", "catch",
    "finally", "throw", "throws", "package", "lambda", "yield", "with", "pass", "break", "continue", "select", "where", "and", "or", "not", "typeof",
)

@Composable
fun CodeBlock(code: String, lang: String = "") {
    val dark = LocalDark.current
    val bg = if (dark) Color(0xFF0F0E1C) else Color(0xFF1E1B2E)
    val hl = buildAnnotatedString {
        val re = Regex("""(//[^\n]*|#[^\n]*|/\*[\s\S]*?\*/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b""")
        var i = 0
        for (m in re.findAll(code)) {
            append(code.substring(i, m.range.first))
            val g = m.groupValues
            when {
                g[1].isNotEmpty() -> withStyle(SpanStyle(color = Color(0xFF7C7A95), fontStyle = FontStyle.Italic)) { append(g[1]) }
                g[2].isNotEmpty() -> withStyle(SpanStyle(color = Color(0xFF9EE6A1))) { append(g[2]) }
                g[3].isNotEmpty() -> withStyle(SpanStyle(color = Color(0xFFFFB86C))) { append(g[3]) }
                g[4] in KEYWORDS -> withStyle(SpanStyle(color = Color(0xFFC792EA), fontWeight = FontWeight.Bold)) { append(g[4]) }
                else -> withStyle(SpanStyle(color = Color(0xFFE6E6F0))) { append(g[4]) }
            }
            i = m.range.last + 1
        }
        append(code.substring(i))
    }
    Column(Modifier.padding(vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(bg)) {
        if (lang.isNotBlank()) Text(lang, Modifier.padding(start = 12.dp, top = 8.dp), color = Color(0xFF8F8BB0), fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(hl, Modifier.horizontalScroll(rememberScrollState()).padding(12.dp), color = Color(0xFFE6E6F0), fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 19.sp, softWrap = false)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MathView(text: String, modifier: Modifier, size: TextUnit, weight: FontWeight, center: Boolean, color: Color) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    var h by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    val main = androidx.compose.runtime.remember { android.os.Handler(android.os.Looper.getMainLooper()) }
    val html = remember(text, size, color, center, weight) {
        fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        val body = (if (isHtml(text)) text else {
            var b = esc(text)
            b = fenceRe.replace(b) { "<pre>" + it.groupValues[2] + "</pre>" }
            b.replace(Regex("""\*\*(.+?)\*\*"""), "<b>$1</b>").replace("\n", "<br>")
        }).replace(Regex("⟦([^⟧]*)⟧"), "<span class=c>[$1]</span>").replace(Regex("⟪([^⟫]*)⟫"), "<u class=a>$1</u>")
        val c = String.format("#%06X", 0xFFFFFF and color.toArgb())
        """<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="katex.min.css">
        <script src="purify.min.js"></script><script src="katex.min.js"></script><script src="auto-render.min.js"></script>
        <style>body{margin:0;padding:2px;background:transparent;color:$c;font-family:sans-serif;font-size:${size.value}px;line-height:1.4;font-weight:${weight.weight};text-align:${if (center) "center" else "left"};word-wrap:break-word}
        b,strong{font-weight:800}h1,h2,h3,h4{font-size:1.2em;margin:.2em 0}ul,ol{text-align:left;display:inline-block;padding-left:1.3em;margin:.2em 0}
        img{max-width:100%;max-height:240px;border-radius:12px}a{color:#6D4AFF}code{font-family:monospace;background:rgba(127,127,127,.15);padding:.1em .3em;border-radius:5px;font-size:.88em}
        pre{background:#1E1B2E;color:#E6E6F0;padding:10px;border-radius:10px;text-align:left;overflow-x:auto;font-size:13px}pre code{background:none}
        .c{color:#6D4AFF;font-weight:800;background:rgba(109,74,255,.12);border-radius:5px;padding:0 3px}.a{color:#6D4AFF;font-weight:800}.katex-display{overflow-x:auto;overflow-y:hidden}</style></head>
        <body><div id=r></div><script>
        var r=document.getElementById('r');
        r.innerHTML=DOMPurify.sanitize(${uz.yodla.app.ui.components.quote(body)},{ALLOWED_TAGS:['b','strong','i','em','u','s','strike','del','p','div','br','h1','h2','h3','h4','ul','ol','li','sub','sup','span','code','pre','a','img','mark','font','blockquote','hr'],ALLOWED_ATTR:['href','src','alt','style','color','class']});
        renderMathInElement(r,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}],throwOnError:false});
        function rep(){Android.h(Math.ceil(document.body.getBoundingClientRect().height)+4)}
        new ResizeObserver(rep).observe(document.body);document.querySelectorAll('img').forEach(function(i){i.onload=rep});rep();
        </script></body></html>"""
    }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                setBackgroundColor(AColor.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.allowFileAccess = true // offline card images are file:// URIs in app storage
                @Suppress("DEPRECATION") settings.allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION") settings.allowUniversalAccessFromFileURLs = false
                isVerticalScrollBarEnabled = false
                addJavascriptInterface(object { @android.webkit.JavascriptInterface fun h(px: Int) { main.post { h = px } } }, "Android")
                webViewClient = object : android.webkit.WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, req: android.webkit.WebResourceRequest): Boolean {
                        runCatching { view.context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)) }
                        return true
                    }
                }
            }
        },
        update = { if (it.tag != html) { it.tag = html; it.loadDataWithBaseURL("file:///android_asset/katex/", html, "text/html", "utf-8", null) } },
        modifier = modifier.fillMaxWidth().then(if (h > 0) Modifier.height(with(density) { h.dp }) else Modifier.heightIn(min = 24.dp)),
    )
}

package uz.yodla.app

import android.content.Context
import android.speech.tts.TextToSpeech
import uz.yodla.app.data.Cloze
import java.util.Locale

/** Native text-to-speech with per-deck language and script-based auto detection. */
class Speaker(private val ctx: Context) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var pending: Pair<String, String>? = null

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        pending?.let { (t, l) -> pending = null; speak(t, l) }
    }

    fun speak(raw: String, lang: String = "") {
        val text = uz.yodla.app.data.htmlToPlain(Cloze.plain(raw)).replace(Regex("""\$+[^$]*\$+"""), " ").replace(Regex("[*`#⟦⟧⟪⟫]"), "").trim()
        if (text.isEmpty()) return
        if (tts == null) tts = TextToSpeech(ctx.applicationContext, this)
        if (!ready) { pending = text to lang; return }
        val t = tts ?: return
        val loc = if (lang.isNotBlank()) Locale.forLanguageTag(lang) else detect(text)
        if (t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE) t.language = loc
        t.setSpeechRate(0.95f)
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "yodla")
    }

    fun stop() { tts?.stop() }

    companion object {
        fun detect(text: String): Locale = when {
            Regex("[\\u0400-\\u04FF]").containsMatchIn(text) -> Locale("ru", "RU")
            Regex("[\\u0600-\\u06FF]").containsMatchIn(text) -> Locale("ar")
            Regex("[\\u3040-\\u30ff]").containsMatchIn(text) -> Locale.JAPANESE
            Regex("[\\uac00-\\ud7af]").containsMatchIn(text) -> Locale.KOREAN
            Regex("[\\u4e00-\\u9fff]").containsMatchIn(text) -> Locale.CHINESE
            Regex("[ğüşıöç]", RegexOption.IGNORE_CASE).containsMatchIn(text) -> Locale("tr", "TR")
            Regex("[ñáéíóú¿¡]", RegexOption.IGNORE_CASE).containsMatchIn(text) -> Locale("es", "ES")
            else -> Locale.US
        }
        val LANGS = listOf("" to "Auto", "en-US" to "English", "uz-UZ" to "O'zbek", "ru-RU" to "Русский", "tr-TR" to "Türkçe", "es-ES" to "Español",
            "fr-FR" to "Français", "de-DE" to "Deutsch", "ar" to "العربية", "zh-CN" to "中文", "ja-JP" to "日本語", "ko-KR" to "한국어", "hi-IN" to "हिन्दी")
    }
}

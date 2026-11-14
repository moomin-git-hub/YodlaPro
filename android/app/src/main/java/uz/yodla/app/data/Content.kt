package uz.yodla.app.data

import kotlinx.serialization.Serializable

@Serializable data class Mask(val id: String, val x: Float, val y: Float, val w: Float, val h: Float)

/** Image occlusion: all masks of the note + which one this card asks about. mode "all" = hide all, guess one; "one" = hide only target. */
@Serializable data class Occlusion(val masks: List<Mask> = emptyList(), val t: String = "", val mode: String = "all")

@Serializable data class ClozeExtra(val c: Int = 1)

/** Per-deck card style (Noji "Card Styles"). */
@Serializable data class CardStyle(val bg: String = "default", val font: String = "sans", val size: String = "m")

object Cloze {
    val regex = Regex("""\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}""", RegexOption.DOT_MATCHES_ALL)
    fun indices(text: String) = regex.findAll(text).map { it.groupValues[1].toInt() }.toSortedSet().toList()
    /** Front: target cloze becomes [...] (or [hint]); other clozes show their text. */
    fun front(text: String, idx: Int) = regex.replace(text) { m ->
        if (m.groupValues[1].toInt() == idx) "⟦" + (m.groupValues[3].ifBlank { "…" }) + "⟧" else m.groupValues[2]
    }
    /** Back: target cloze shown and marked so the renderer can highlight it. */
    fun back(text: String, idx: Int) = regex.replace(text) { m ->
        if (m.groupValues[1].toInt() == idx) "⟪" + m.groupValues[2] + "⟫" else m.groupValues[2]
    }
    fun plain(text: String) = regex.replace(text) { it.groupValues[2] }
    fun nextIndex(text: String) = (indices(text).maxOrNull() ?: 0) + 1
}

fun Card.cloze(): ClozeExtra = runCatching { Json0.decodeFromString<ClozeExtra>(extra) }.getOrDefault(ClozeExtra())
fun Card.occlusion(): Occlusion = runCatching { Json0.decodeFromString<Occlusion>(extra) }.getOrDefault(Occlusion())
fun Deck.cardStyle(): CardStyle = if (style.isBlank()) CardStyle() else runCatching { Json0.decodeFromString<CardStyle>(style) }.getOrDefault(CardStyle())

/** Text shown when listing / searching a card. */
fun Card.questionText(): String = when (type) {
    CardType.CLOZE -> htmlToPlain(Cloze.front(front, cloze().c).replace(Regex("⟦([^⟧]*)⟧"), "[$1]"))
    CardType.OCCLUSION -> htmlToPlain(front).ifBlank { "🖼 #" + (occlusion().masks.indexOfFirst { it.id == occlusion().t } + 1) }
    else -> htmlToPlain(front).ifBlank { if (front.contains("<img", true)) "🖼" else "" }
}
fun Card.answerText(): String = when (type) {
    CardType.CLOZE -> htmlToPlain(Cloze.plain(front)).let { if (back.isNotBlank()) "$it\n${htmlToPlain(back)}" else it }
    else -> htmlToPlain(back)
}
/** True when an editor value has no text and no image. */
fun isBlankRich(s: String) = htmlToPlain(s).isBlank() && !s.contains("<img", true)

private val htmlRe = Regex("</?(b|i|u|s|strong|em|p|div|br|h[1-6]|ul|ol|li|sub|sup|span|code|pre|a|img|mark|font)\\b", RegexOption.IGNORE_CASE)
fun isHtml(s: String) = htmlRe.containsMatchIn(s)

/** Strip HTML for list previews, search and TTS. */
fun htmlToPlain(s: String): String = if (!isHtml(s)) s else s
    .replace(Regex("(?i)<(br|/p|/div|/li|/h\\d)[^>]*>"), " ").replace(Regex("<[^>]+>"), "")
    .replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
    .replace(Regex("\\s+"), " ").trim()

/** What the learner should type for this card (type-answer mode); blank = typing not offered. */
fun Card.typedTarget(): String = when (type) {
    CardType.CLOZE -> Cloze.regex.findAll(front).filter { it.groupValues[1].toInt() == cloze().c }.joinToString(" ") { htmlToPlain(it.groupValues[2]) }
    CardType.REVERSE -> htmlToPlain(front)
    CardType.OCCLUSION -> ""
    else -> htmlToPlain(back)
}.trim()

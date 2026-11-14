package uz.yodla.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.io.File
import kotlin.math.max

@Serializable data class PublicCard(val front: String, val back: String, val example: String? = null, val explanation: String? = null)
@Serializable data class PublicDeck(
    val id: String, val title: String, val description: String = "", val category: String = "general", val cover: String = "📘",
    val color: String = "violet", val author: String = "", val language: String = "", val saves: Int = 0,
    val cards: List<PublicCard> = emptyList(), val cardCount: Int = 0,
)
@Serializable private data class CatalogFile(val decks: List<PublicDeck>)

val CATEGORIES = listOf(
    "general" to "✨", "languages" to "🗣️", "science" to "🔬", "history" to "🏛️", "geography" to "🌍", "tech" to "💻",
    "math" to "➗", "business" to "🏨", "medicine" to "🩺", "exam" to "🎓", "arts" to "🎨", "other" to "📦",
)
val DECK_COLORS = listOf("violet", "blue", "green", "orange", "pink", "slate", "lime", "red")
val EMOJIS = listOf("📘", "🧠", "🗣️", "🇬🇧", "🇺🇿", "🇷🇺", "🔬", "🧪", "🌍", "🏛️", "💻", "➗", "🏨", "✈️", "🩺", "🎓", "🎨", "🎵", "⚽", "💡", "📈", "🍳", "🕌", "📜")

class Remote(private val ctx: Context, private val repo: Repo) {
    val builtIn: List<PublicDeck> by lazy {
        val txt = ctx.assets.open("catalog.json").bufferedReader().use { it.readText() }
        Json0.decodeFromString<CatalogFile>(txt).decks.map { it.copy(cardCount = it.cards.size) }
    }

    suspend fun publicDecks(): List<PublicDeck> {
        if (!repo.api.configured()) return builtIn
        return try {
            val arr = repo.api.request("GET", "/public-decks", auth = false).jsonArray
            arr.map { e ->
                val o = e.jsonObject
                fun s(k: String) = o[k]?.jsonPrimitive?.contentOrNull.orEmpty()
                PublicDeck(s("id"), s("title"), s("description"), s("category").ifBlank { "general" }, s("cover").ifBlank { "📘" }, s("color").ifBlank { "violet" },
                    s("author"), s("language"), o["saves"]?.jsonPrimitive?.intOrNull ?: 0, emptyList(), o["card_count"]?.jsonPrimitive?.intOrNull ?: 0)
            } + builtIn
        } catch (_: ApiException) { builtIn }
    }

    suspend fun publicCards(d: PublicDeck): List<PublicCard> {
        if (d.cards.isNotEmpty() || !repo.api.configured()) return d.cards
        return runCatching { Json0.decodeFromJsonElement<List<PublicCard>>(repo.api.request("GET", "/public-decks/${d.id}/cards", auth = false)) }.getOrDefault(emptyList())
    }

    suspend fun addToLibrary(p: PublicDeck, cards: List<PublicCard>): Deck {
        val deck = repo.saveDeck(repo.newDeck(p.title).copy(description = p.description, category = p.category, cover = p.cover, color = p.color, sourcePublicId = p.id))
        repo.addCards(deck.id, cards.map { DraftCard(it.front, it.back, it.example.orEmpty(), it.explanation.orEmpty(), type = if (Cloze.indices(it.front).isNotEmpty()) CardType.CLOZE else CardType.BASIC) })
        return deck
    }

    suspend fun publish(deck: Deck, cards: List<Card>): String {
        val body = buildJsonObject {
            put("title", deck.title); put("description", deck.description); put("category", deck.category); put("cover", deck.cover); put("color", deck.color)
            put("cards", JsonArray(cards.filter { it.type != CardType.OCCLUSION }.distinctBy { it.noteId }.map { c ->
                buildJsonObject { put("front", c.front); put("back", c.back); put("example", c.example); put("explanation", c.explanation) }
            }))
        }
        return repo.api.request("POST", "/public-decks", body).jsonObject["id"]!!.jsonPrimitive.content
    }

    // ---------------- AI ----------------
    suspend fun aiStatus(): Boolean = repo.cloud && runCatching { repo.api.request("GET", "/ai/status").jsonObject["ok"]?.jsonPrimitive?.booleanOrNull == true }.getOrDefault(false)

    suspend fun generate(topic: String?, text: String?, count: Int, language: String, format: String, detail: String, instructions: String): List<DraftCard> {
        val body = buildJsonObject {
            topic?.let { put("topic", it) }; text?.let { put("text", it.take(60_000)) }
            put("count", count); put("language", language); put("format", format); put("detail", detail); put("instructions", instructions.take(500))
        }
        val arr = repo.api.request("POST", "/ai/generate", body).jsonObject["cards"]!!.jsonArray
        return arr.mapNotNull { e ->
            val o = e.jsonObject
            fun s(k: String) = o[k]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val front = s("front"); val back = s("back")
            val isCloze = Cloze.indices(front).isNotEmpty()
            if (front.isBlank() || (back.isBlank() && !isCloze)) null
            else DraftCard(front, back, s("example"), s("explanation"), type = if (isCloze) CardType.CLOZE else CardType.BASIC)
        }
    }

    /** Card-editor ✨ helper: answer / question / example / explanation / improve. */
    suspend fun assist(front: String, back: String, action: String, language: String = ""): Triple<String, String, String> {
        val o = repo.api.request("POST", "/ai/assist", buildJsonObject { put("front", front); put("back", back); put("action", action); if (language.isNotBlank()) put("language", language) }).jsonObject
        fun s(k: String) = o[k]?.jsonPrimitive?.contentOrNull.orEmpty()
        return Triple(s("text"), s("front"), s("back"))
    }

    companion object {
        /** Offline extraction of "term — definition" lines (no AI). */
        fun quickExtract(text: String, max: Int = 200): List<DraftCard> {
            val out = mutableListOf<DraftCard>()
            val seps = listOf(Regex("""\s+[—–]\s+"""), Regex("""\s+-\s+"""), Regex("""\s*:\s+"""), Regex("\t"), Regex("""\s*=\s*"""))
            for (raw in text.lines()) {
                val line = raw.replace(Regex("""^\s*([-*•●▪]|\d+[.)])\s*"""), "").trim()
                if (line.length !in 3..400) continue
                for (s in seps) {
                    val parts = line.split(s)
                    if (parts.size >= 2 && parts[0].isNotBlank() && parts[0].length <= 120 && parts.drop(1).joinToString(" ").trim().length > 1) {
                        out += DraftCard(parts[0].trim(), parts.drop(1).joinToString(" — ").trim()); break
                    }
                }
                if (out.size >= max) break
            }
            if (out.isEmpty()) {
                val sentences = Regex("""[^.!?]+[.!?]""").findAll(text.replace(Regex("""\s+"""), " ")).map { it.value.trim() }
                val re = Regex("""^(.{2,80}?)\s+(is|are|was|were|means|refers to|—)\s+(.{5,300})$""", RegexOption.IGNORE_CASE)
                for (s in sentences) {
                    val m = re.find(s) ?: continue
                    val plural = m.groupValues[2].lowercase() in listOf("are", "were")
                    out += DraftCard("What ${if (plural) "are" else "is"} ${m.groupValues[1].replace(Regex("^(the|a|an)\\s+", RegexOption.IGNORE_CASE), "")}?", m.groupValues[3].trimEnd('.', '!', '?'))
                    if (out.size >= max) break
                }
            }
            return out
        }
    }
}

object Files {
    /** Read text from a PDF (up to 80 pages) or plain-text file. */
    suspend fun extractText(ctx: Context, uri: Uri): String = withContext(Dispatchers.IO) {
        val type = ctx.contentResolver.getType(uri).orEmpty()
        val name = uri.lastPathSegment.orEmpty().lowercase()
        if (type == "application/pdf" || name.endsWith(".pdf")) {
            PDFBoxResourceLoader.init(ctx)
            ctx.contentResolver.openInputStream(uri)!!.use { input ->
                PDDocument.load(input).use { doc ->
                    PDFTextStripper().apply { startPage = 1; endPage = minOf(doc.numberOfPages, 80) }.getText(doc)
                }
            }.replace(Regex("""[ \t]+"""), " ").trim()
        } else ctx.contentResolver.openInputStream(uri)!!.use { it.bufferedReader().readText() }.trim()
    }

    fun readText(ctx: Context, uri: Uri) = ctx.contentResolver.openInputStream(uri)!!.use { it.bufferedReader().readText() }

    /** Copy + downscale a picked image into app storage; returns a file:// URI (uploaded on next sync). */
    suspend fun importImage(ctx: Context, uri: Uri, maxSide: Int = 1280): String = withContext(Dispatchers.IO) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        var bmp = ctx.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: error("bad image")
        val rotation = runCatching { ctx.contentResolver.openInputStream(uri)!!.use { ExifInterface(it).rotationDegrees } }.getOrDefault(0)
        val scale = minOf(1f, maxSide.toFloat() / max(bmp.width, bmp.height))
        if (scale < 1f || rotation != 0) {
            val m = Matrix().apply { postScale(scale, scale); postRotate(rotation.toFloat()) }
            bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
        val dir = File(ctx.filesDir, "images").apply { mkdirs() }
        val f = File(dir, uid() + ".jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 84, it) }
        Uri.fromFile(f).toString()
    }

    fun parseDelimited(text: String): List<List<String>> {
        val first = text.lineSequence().firstOrNull { it.isNotBlank() && !it.startsWith("#") }.orEmpty()
        val delim = when { '\t' in first -> '\t'; ';' in first && ',' !in first -> ';'; else -> ',' }
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>(); val cell = StringBuilder(); var q = false; var i = 0
        fun endRow() { row.add(cell.toString()); cell.clear(); if (row.any { it.isNotBlank() } && !row[0].startsWith("#")) rows += row; row = mutableListOf() }
        while (i < text.length) {
            val ch = text[i]
            if (q) { if (ch == '"') { if (text.getOrNull(i + 1) == '"') { cell.append('"'); i++ } else q = false } else cell.append(ch) }
            else when {
                ch == '"' && cell.isEmpty() -> q = true
                ch == delim -> { row.add(cell.toString()); cell.clear() }
                ch == '\n' || ch == '\r' -> { if (ch == '\r' && text.getOrNull(i + 1) == '\n') i++; endRow() }
                else -> cell.append(ch)
            }
            i++
        }
        endRow()
        return rows
    }

    fun parseImport(text: String): List<DraftCard> {
        val s = text.trim()
        if (s.isEmpty()) return emptyList()
        if ((s.startsWith("{") && !s.startsWith("{{")) || s.startsWith("[")) runCatching {
            val el = Json0.parseToJsonElement(s)
            val arr = (el as? JsonArray) ?: el.jsonObject["cards"]!!.jsonArray
            arr.mapNotNull { e ->
                val o = e.jsonObject
                fun g(vararg k: String) = k.firstNotNullOfOrNull { o[it]?.jsonPrimitive?.contentOrNull }.orEmpty().trim()
                val f = g("front", "question", "q"); val b = g("back", "answer", "a")
                if (f.isBlank() || b.isBlank()) null else DraftCard(f, b, g("example"), g("explanation"), type = if (Cloze.indices(f).isNotEmpty()) CardType.CLOZE else CardType.BASIC)
            }
        }.getOrNull()?.let { return it }
        val rows = parseDelimited(s)
        val header = rows.firstOrNull()?.firstOrNull()?.trim()?.lowercase() in setOf("question", "front", "savol", "вопрос", "term")
        val strip = { x: String -> x.replace(Regex("(?i)<br\\s*/?>"), "\n").replace(Regex("<[^>]+>"), "").trim() }
        return (if (header) rows.drop(1) else rows).mapNotNull { r ->
            val f = strip(r.getOrElse(0) { "" }); val b = strip(r.getOrElse(1) { "" })
            if (f.isBlank() || b.isBlank()) null else DraftCard(f, b, r.getOrElse(2) { "" }.trim(), r.getOrElse(3) { "" }.trim(),
                type = if (Cloze.indices(f).isNotEmpty()) CardType.CLOZE else CardType.BASIC)
        }
    }

    fun csvEscape(s: String) = if (Regex("[\",\n;]").containsMatchIn(s)) "\"" + s.replace("\"", "\"\"") + "\"" else s
}

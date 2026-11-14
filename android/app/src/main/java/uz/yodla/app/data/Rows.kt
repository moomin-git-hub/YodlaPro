package uz.yodla.app.data

import kotlinx.serialization.json.*
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Mapping between local entities and the server's snake_case rows (same wire format as the web app). */
object Rows {
    private fun fmt() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    fun iso(ts: Long): String = fmt().format(ts)
    fun parseTs(v: JsonElement?): Long? {
        val p = (v as? JsonPrimitive) ?: return null
        if (p is JsonNull) return null
        p.longOrNull?.let { return it }
        val s = p.content
        return runCatching {
            val norm = s.replace(Regex("""(\.\d{3})\d*"""), "$1").let { if (!Regex("""\.\d{3}""").containsMatchIn(it)) it.replace("Z", ".000Z") else it }
                .replace(Regex("""\+00(:00)?$"""), "Z")
            fmt().parse(norm)?.time
        }.getOrNull()
    }

    private fun JsonObject.s(k: String, d: String = "") = this[k]?.let { if (it is JsonNull) null else it.jsonPrimitive.content } ?: d
    private fun JsonObject.sn(k: String) = this[k]?.let { if (it is JsonNull) null else it.jsonPrimitive.content }
    private fun JsonObject.b(k: String) = this[k]?.jsonPrimitive?.booleanOrNull ?: false
    private fun JsonObject.i(k: String, d: Int = 0) = this[k]?.jsonPrimitive?.doubleOrNull?.toInt() ?: d
    private fun JsonObject.d(k: String, d: Double = 0.0) = this[k]?.jsonPrimitive?.doubleOrNull ?: d
    private fun JsonObject.t(k: String) = parseTs(this[k]) ?: System.currentTimeMillis()

    fun deck(d: Deck) = buildJsonObject {
        put("id", d.id); put("title", d.title); put("description", d.description); put("category", d.category)
        put("folder_id", d.folderId); put("parent_id", d.parentId); put("cover", d.cover); put("color", d.color); put("image", d.image)
        put("source_public_id", d.sourcePublicId); put("archived", d.archived); put("preset", d.preset); put("algorithm", d.algorithm); put("style", d.style)
        put("tts_front", d.ttsFront); put("tts_back", d.ttsBack); put("sort_order", d.sortOrder)
        put("created_at", iso(d.createdAt)); put("updated_at", iso(d.updatedAt))
    }
    fun deck(o: JsonObject) = Deck(
        id = o.s("id"), title = o.s("title"), description = o.s("description"), category = o.s("category", "general"),
        folderId = o.sn("folder_id"), parentId = o.sn("parent_id"), cover = o.s("cover", "📘"), color = o.s("color", "violet"), image = o.s("image"),
        sourcePublicId = o.sn("source_public_id"), archived = o.b("archived"), preset = o.s("preset", Presets.STANDARD), algorithm = o.s("algorithm", Algo.FSRS), style = o.s("style"),
        ttsFront = o.s("tts_front"), ttsBack = o.s("tts_back"), sortOrder = o.i("sort_order"), createdAt = o.t("created_at"), updatedAt = o.t("updated_at"),
    )

    fun card(c: Card) = buildJsonObject {
        put("id", c.id); put("deck_id", c.deckId); put("note_id", c.noteId); put("card_type", c.type)
        put("front", c.front); put("back", c.back); put("example", c.example); put("explanation", c.explanation)
        put("image", c.image); put("extra", c.extra); put("difficult", c.difficult); put("bookmarked", c.bookmarked); put("frozen", c.frozen)
        put("reps", c.reps); put("lapses", c.lapses); put("ease", c.ease); put("interval", c.interval)
        put("due", iso(c.due)); put("last_review", c.lastReview?.let { iso(it) }); put("status", c.status); put("step", c.step); put("stability", c.stability); put("difficulty", c.difficulty)
        put("created_at", iso(c.createdAt)); put("updated_at", iso(c.updatedAt))
    }
    fun card(o: JsonObject) = Card(
        id = o.s("id"), deckId = o.s("deck_id"), noteId = o.sn("note_id") ?: o.s("id"), type = o.s("card_type", CardType.BASIC),
        front = o.s("front"), back = o.s("back"), example = o.s("example"), explanation = o.s("explanation"), image = o.s("image"), extra = o.s("extra"),
        difficult = o.b("difficult"), bookmarked = o.b("bookmarked"), frozen = o.b("frozen"),
        reps = o.i("reps"), lapses = o.i("lapses"), ease = o.d("ease", 2.5), interval = o.d("interval"), due = o.t("due"),
        lastReview = parseTs(o["last_review"]), status = o.s("status", Status.NEW), step = o.i("step"), stability = o.d("stability"), difficulty = o.d("difficulty"), createdAt = o.t("created_at"), updatedAt = o.t("updated_at"),
    )

    fun folder(f: Folder) = buildJsonObject {
        put("id", f.id); put("name", f.name); put("color", f.color); put("emoji", f.emoji); put("created_at", iso(f.createdAt)); put("updated_at", iso(f.updatedAt))
    }
    fun folder(o: JsonObject) = Folder(o.s("id"), o.s("name"), o.s("color", "violet"), o.s("emoji", "📁"), o.t("created_at"), o.t("updated_at"))

    fun review(r: ReviewLog) = buildJsonObject {
        put("id", r.id); put("card_id", r.cardId); put("deck_id", r.deckId); put("rating", r.rating); put("ts", iso(r.ts))
        put("duration_ms", r.durationMs); put("prev_status", r.prevStatus); put("prev_interval", r.prevInterval); put("new_interval", r.newInterval)
    }
    fun review(o: JsonObject) = ReviewLog(o.s("id"), o.s("card_id"), o.s("deck_id"), o.i("rating", 3), o.t("ts"), o.d("duration_ms").toLong(), o.s("prev_status", Status.NEW), o.d("prev_interval"), o.d("new_interval"))

    fun session(s: StudySession) = buildJsonObject {
        put("id", s.id); put("deck_id", s.deckId); put("started_at", iso(s.startedAt)); put("ended_at", iso(s.endedAt))
        put("duration_ms", s.durationMs); put("cards_reviewed", s.cardsReviewed); put("correct", s.correct)
    }
    fun session(o: JsonObject) = StudySession(o.s("id"), o.sn("deck_id"), o.t("started_at"), o.t("ended_at"), o.d("duration_ms").toLong(), o.i("cards_reviewed"), o.i("correct"))

    fun up(table: String, row: JsonObject) = buildJsonObject { put("t", "up"); put("table", table); put("row", row) }.toString()
    fun del(table: String, id: String) = buildJsonObject { put("t", "del"); put("table", table); put("id", id) }.toString()
}

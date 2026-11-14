package uz.yodla.app.data

import android.content.Context
import androidx.room.withTransaction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

data class AppData(
    val decks: List<Deck> = emptyList(),
    val cards: List<Card> = emptyList(),
    val folders: List<Folder> = emptyList(),
    val reviews: List<ReviewLog> = emptyList(),
    val sessions: List<StudySession> = emptyList(),
    val saved: Set<String> = emptySet(),
    val settings: Settings = Settings(),
    val session: Session = Session(),
    val pending: Int = 0,
    val loaded: Boolean = false,
) {
    fun deck(id: String?) = decks.firstOrNull { it.id == id }
    fun cardsOf(deckId: String) = cards.filter { it.deckId == deckId }
}

data class DraftCard(val front: String, val back: String, val example: String = "", val explanation: String = "", val image: String = "", val type: String = CardType.BASIC)

fun uid() = UUID.randomUUID().toString()
fun now() = System.currentTimeMillis()

class Repo(val ctx: Context, val db: YodlaDb = YodlaDb.create(ctx)) {
    val dao = db.dao()
    val prefs = Prefs(ctx)
    val api = Api { prefs.sessionNow() }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    var onChange: () -> Unit = {}   // set by the app to schedule a background sync

    private val tables = combine(dao.decks(), dao.cards(), dao.folders(), dao.reviews(), dao.sessions()) { d, c, f, r, s -> AppData(d, c, f, r, s) }
    val data: StateFlow<AppData> = combine(tables, dao.saved(), prefs.settings, prefs.session, dao.outboxCount()) { t, sv, st, ses, n ->
        t.copy(saved = sv.map { it.publicDeckId }.toSet(), settings = st, session = ses, pending = n, loaded = true)
    }.stateIn(scope, SharingStarted.Eagerly, AppData())

    val cloud get() = data.value.session.user?.mode == "cloud"

    private suspend fun enqueue(vararg ops: String) {
        if (prefs.sessionNow().user?.mode != "cloud") return
        dao.enqueue(ops.map { OutboxOp(json = it) })
        onChange()
    }
    private suspend fun enqueueAll(ops: List<String>) {
        if (ops.isEmpty() || prefs.sessionNow().user?.mode != "cloud") return
        dao.enqueue(ops.map { OutboxOp(json = it) })
        onChange()
    }

    fun presetFor(deck: Deck?): SrsConfig {
        val s = data.value.settings
        val id = deck?.preset ?: s.defaultPreset
        return if (id == Presets.CUSTOM) s.customPreset else Presets.builtIn(id) ?: SrsConfig()
    }

    // ---------------- decks & folders ----------------
    suspend fun saveDeck(d: Deck): Deck {
        val deck = d.copy(updatedAt = now())
        dao.upsertDecks(listOf(deck)); enqueue(Rows.up("decks", Rows.deck(deck))); return deck
    }
    fun newDeck(title: String) = Deck(id = uid(), title = title, preset = data.value.settings.defaultPreset, algorithm = data.value.settings.defaultAlgorithm, createdAt = now(), updatedAt = now())

    /** Deck id + all subdeck ids below it (any depth). */
    fun tree(id: String, decks: List<Deck> = data.value.decks): List<String> {
        val out = mutableListOf(id)
        var i = 0
        while (i < out.size) { val p = out[i++]; decks.forEach { if (it.parentId == p && it.id !in out) out += it.id } }
        return out
    }

    /** Deletes the deck together with its subdecks and all their cards. */
    suspend fun deleteDeck(id: String) {
        val ids = tree(id, dao.allDecks())
        db.withTransaction { ids.forEach { dao.deleteCardsOfDeck(it); dao.deleteDeck(it) } }
        enqueueAll(ids.reversed().map { Rows.del("decks", it) })
    }

    suspend fun duplicateDeck(id: String): Deck? {
        val src = dao.deck(id) ?: return null
        val copy = src.copy(id = uid(), title = src.title + " (2)", sourcePublicId = null, createdAt = now(), updatedAt = now())
        saveDeck(copy)
        val noteMap = mutableMapOf<String, String>()
        val cards = dao.cardsOf(id).map { c -> fresh(c.copy(id = uid(), deckId = copy.id, noteId = noteMap.getOrPut(c.noteId) { uid() })) }
        dao.upsertCards(cards); enqueueAll(cards.map { Rows.up("flashcards", Rows.card(it)) })
        return copy
    }

    suspend fun saveFolder(f: Folder): Folder {
        val x = f.copy(updatedAt = now()); dao.upsertFolders(listOf(x)); enqueue(Rows.up("folders", Rows.folder(x))); return x
    }
    suspend fun deleteFolder(id: String) {
        val moved = dao.allDecks().filter { it.folderId == id }.map { it.copy(folderId = null, updatedAt = now()) }
        db.withTransaction { dao.upsertDecks(moved); dao.deleteFolder(id) }
        enqueueAll(moved.map { Rows.up("decks", Rows.deck(it)) } + Rows.del("folders", id))
    }

    // ---------------- cards ----------------
    private fun fresh(c: Card) = c.copy(reps = 0, lapses = 0, ease = presetFor(data.value.deck(c.deckId)).startEase, interval = 0.0, due = now(), lastReview = null, status = Status.NEW, step = 0, stability = 0.0, difficulty = 0.0, createdAt = now(), updatedAt = now())

    fun blankCard(deckId: String, noteId: String = uid(), t: Long = now()) = Card(id = uid(), deckId = deckId, noteId = noteId, front = "", back = "", due = t, createdAt = t, updatedAt = t)

    suspend fun addCards(deckId: String, drafts: List<DraftCard>): List<Card> {
        val t = now()
        val out = mutableListOf<Card>()
        drafts.forEachIndexed { i, d ->
            val noteId = uid()
            if (d.type == CardType.CLOZE && Cloze.indices(d.front).isNotEmpty()) {
                Cloze.indices(d.front).forEach { n ->
                    out += blankCard(deckId, noteId, t + i).copy(type = CardType.CLOZE, front = d.front.trim(), back = d.back.trim(), example = d.example.trim(), explanation = d.explanation.trim(), image = d.image, extra = Json0.encodeToString(ClozeExtra.serializer(), ClozeExtra(n)))
                }
            } else out += blankCard(deckId, noteId, t + i).copy(front = d.front.trim(), back = d.back.trim(), example = d.example.trim(), explanation = d.explanation.trim(), image = d.image)
        }
        dao.upsertCards(out); enqueueAll(out.map { Rows.up("flashcards", Rows.card(it)) })
        return out
    }

    /**
     * Save a note (one or several sibling cards). Existing siblings keep their review progress;
     * removed cloze numbers / masks delete their cards.
     */
    suspend fun saveNote(template: Card, reversed: Boolean? = null): List<Card> {
        val t = now()
        val existing = dao.note(template.noteId)
        val keep = mutableListOf<Card>()
        when (template.type) {
            CardType.CLOZE -> Cloze.indices(template.front).forEach { n ->
                val ex = existing.firstOrNull { it.type == CardType.CLOZE && it.cloze().c == n }
                keep += (ex ?: blankCard(template.deckId, template.noteId, t + n)).copy(
                    type = CardType.CLOZE, deckId = template.deckId, front = template.front, back = template.back, example = template.example,
                    explanation = template.explanation, image = template.image, extra = Json0.encodeToString(ClozeExtra.serializer(), ClozeExtra(n)),
                    difficult = template.difficult, bookmarked = template.bookmarked, frozen = template.frozen, updatedAt = t)
            }
            CardType.OCCLUSION -> {
                val occ = template.occlusion()
                occ.masks.forEachIndexed { i, m ->
                    val ex = existing.firstOrNull { it.type == CardType.OCCLUSION && it.occlusion().t == m.id }
                    keep += (ex ?: blankCard(template.deckId, template.noteId, t + i)).copy(
                        type = CardType.OCCLUSION, deckId = template.deckId, front = template.front, back = template.back, example = template.example,
                        explanation = template.explanation, image = template.image, extra = Json0.encodeToString(Occlusion.serializer(), occ.copy(t = m.id)),
                        difficult = template.difficult, bookmarked = template.bookmarked, frozen = template.frozen, updatedAt = t)
                }
            }
            else -> {
                // basic note = forward card + optional reverse card (answer → question) sharing the same content
                val fwd = existing.firstOrNull { it.type == CardType.BASIC } ?: existing.firstOrNull { it.id == template.id && it.type != CardType.REVERSE }
                fun fill(c: Card, type: String) = c.copy(type = type, deckId = template.deckId, front = template.front.trim(), back = template.back.trim(),
                    example = template.example.trim(), explanation = template.explanation.trim(), image = template.image, extra = "",
                    difficult = template.difficult, bookmarked = template.bookmarked, frozen = template.frozen, updatedAt = t)
                keep += fill(fwd ?: template.copy(id = if (existing.any { it.id == template.id }) uid() else template.id), CardType.BASIC)
                val rev = existing.firstOrNull { it.type == CardType.REVERSE }
                val wantRev = reversed ?: (rev != null)
                if (wantRev) keep += fill(rev ?: blankCard(template.deckId, template.noteId, t + 1), CardType.REVERSE)
            }
        }
        val keepIds = keep.map { it.id }.toSet()
        val removed = existing.filter { it.id !in keepIds }.map { it.id }
        db.withTransaction { if (removed.isNotEmpty()) dao.deleteCards(removed); dao.upsertCards(keep) }
        enqueueAll(removed.map { Rows.del("flashcards", it) } + keep.map { Rows.up("flashcards", Rows.card(it)) })
        return keep
    }

    suspend fun updateCards(ids: Collection<String>, fn: (Card) -> Card) {
        val set = ids.toSet()
        val changed = dao.allCards().filter { it.id in set }.map { fn(it).copy(updatedAt = now()) }
        dao.upsertCards(changed); enqueueAll(changed.map { Rows.up("flashcards", Rows.card(it)) })
    }
    suspend fun updateCard(id: String, fn: (Card) -> Card) = updateCards(listOf(id), fn)
    fun noteOf(card: Card) = data.value.cards.filter { it.noteId == card.noteId }
    fun hasReverse(card: Card) = noteOf(card).any { it.type == CardType.REVERSE }

    /** Add or remove the reverse sibling of a basic note. */
    suspend fun setReversed(card: Card, on: Boolean) {
        val base = noteOf(card).firstOrNull { it.type == CardType.BASIC } ?: return
        saveNote(base, reversed = on)
    }

    /** Copy a whole note (all its cards) as a new note with fresh progress. */
    suspend fun duplicateNote(card: Card): List<Card> {
        val noteId = uid()
        val copies = noteOf(card).map { fresh(it.copy(id = uid(), noteId = noteId)) }
        dao.upsertCards(copies); enqueueAll(copies.map { Rows.up("flashcards", Rows.card(it)) })
        return copies
    }

    suspend fun deleteCards(ids: List<String>) { dao.deleteCards(ids); enqueueAll(ids.map { Rows.del("flashcards", it) }) }
    suspend fun moveCards(ids: List<String>, deckId: String) = updateCards(ids) { it.copy(deckId = deckId) }
    suspend fun resetProgress(ids: List<String>) = updateCards(ids) { fresh(it).copy(createdAt = it.createdAt) }
    /** Swap question and answer (basic cards only). */
    suspend fun reverseCards(ids: List<String>) = updateCards(ids) { if (it.type == CardType.BASIC && it.back.isNotBlank()) it.copy(front = it.back, back = it.front) else it }

    fun duplicateOf(deckId: String, front: String, exceptNote: String?): Card? {
        val norm = front.trim().lowercase()
        if (norm.isEmpty()) return null
        val plain = htmlToPlain(norm)
        return data.value.cards.firstOrNull { it.deckId == deckId && it.noteId != exceptNote && htmlToPlain(it.front.trim().lowercase()) == plain }
    }

    // ---------------- reviewing ----------------
    /** Answers a card; returns the card as it was before (for undo). */
    suspend fun review(cardId: String, rating: Int, durationMs: Long): Card? {
        val c = dao.card(cardId) ?: return null
        val deck = dao.deck(c.deckId)
        val s = Srs.schedule(c, rating, algoFor(deck), presetFor(deck))
        val next = c.copy(status = s.status, step = s.step, ease = s.ease, interval = s.interval, due = s.due, reps = s.reps, lapses = s.lapses, stability = s.stability, difficulty = s.difficulty, lastReview = now(), updatedAt = now())
        val log = ReviewLog(uid(), cardId, c.deckId, rating, now(), durationMs.coerceAtMost(120_000), c.status, c.interval, s.interval)
        db.withTransaction { dao.upsertCards(listOf(next)); dao.upsertReviews(listOf(log)) }
        enqueue(Rows.up("flashcards", Rows.card(next)), Rows.up("review_logs", Rows.review(log)))
        return c
    }
    suspend fun undoReview(prev: Card) {
        val last = dao.allReviews().filter { it.cardId == prev.id }.maxByOrNull { it.ts }
        val restored = prev.copy(updatedAt = now())
        db.withTransaction { dao.upsertCards(listOf(restored)); last?.let { dao.deleteReview(it.id) } }
        enqueueAll(listOfNotNull(Rows.up("flashcards", Rows.card(restored)), last?.let { Rows.del("review_logs", it.id) }))
    }
    suspend fun addSession(s: StudySession) {
        if (s.cardsReviewed == 0) return
        dao.upsertSessions(listOf(s)); enqueue(Rows.up("study_sessions", Rows.session(s)))
    }

    fun algoFor(deck: Deck?): String = deck?.algorithm ?: Algo.FSRS

    /**
     * Today's study queue for a deck (incl. subdecks), folder, "all", "difficult" or "bookmarks".
     * Reviews due today + new cards (per-deck preset limits, one new card per note per day),
     * learning cards wait for their step time. Fast-review decks: every card, no schedule.
     */
    fun buildQueue(target: String, practice: Boolean, now: Long = now()): StudyQueue {
        val d = data.value
        val active = d.decks.filter { !it.archived }.map { it.id }.toSet()
        val pool = when (target) {
            "all" -> d.cards.filter { it.deckId in active }
            "difficult" -> d.cards.filter(Srs::isHard)
            "bookmarks" -> d.cards.filter { it.bookmarked }
            else -> {
                val scope = if (target.startsWith("folder:")) d.decks.filter { it.folderId == target.removePrefix("folder:") && it.parentId == null }.flatMap { tree(it.id) }.toSet()
                    else tree(target).toSet()
                d.cards.filter { it.deckId in scope }
            }
        }.filter { !it.frozen }
        val shuffle = d.settings.shuffle
        fun <T> mix(l: List<T>) = if (shuffle) l.shuffled() else l
        if (practice) return StudyQueue(mix(pool.sortedBy { it.createdAt }).map { QItem(it.id, QItem.MODE_PRACTICE) })

        val today = Srs.startOfDay(now)
        val eod = Srs.endOfToday(now)
        val todayLogs = d.reviews.filter { it.ts >= today }
        val touchedNotes = d.cards.filter { c -> todayLogs.any { it.cardId == c.id } }.map { it.noteId }.toMutableSet()
        val due = mutableListOf<Card>(); val fresh = mutableListOf<Card>(); val learning = mutableListOf<Learn>(); val fast = mutableListOf<Card>()
        pool.groupBy { it.deckId }.forEach { (deckId, cards) ->
            val deck = d.deck(deckId)
            if (algoFor(deck) == Algo.FAST) {
                // fast review is on demand: only when the deck (or its folder) is studied directly
                if (target !in setOf("all", "difficult", "bookmarks")) fast += cards.sortedBy { it.createdAt }
                return@forEach
            }
            val cfg = presetFor(deck)
            val logs = todayLogs.filter { it.deckId == deckId }
            val newRoom = (cfg.newPerDay - logs.count { it.prevStatus == Status.NEW }).coerceAtLeast(0)
            val revRoom = (cfg.maxReviewsPerDay - logs.count { it.prevStatus == Status.REVIEW }).coerceAtLeast(0)
            cards.filter { (it.status == Status.LEARNING || it.status == Status.RELEARNING) && it.due <= eod }.forEach { learning += Learn(it.id, it.due) }
            due += cards.filter { it.status == Status.REVIEW && it.due <= eod }.sortedBy { it.due }.take(revRoom)
            fresh += cards.filter { it.status == Status.NEW }.sortedBy { it.createdAt }.filter { touchedNotes.add(it.noteId) }.take(newRoom)
        }
        val r = mix(due.sortedBy { it.due }); val n = mix(fresh)
        val out = mutableListOf<QItem>()
        var i = 0; var j = 0
        while (i < r.size || j < n.size) {
            if (i < r.size) out += QItem(r[i++].id)
            if (i < r.size) out += QItem(r[i++].id)
            if (j < n.size) out += QItem(n[j++].id)
        }
        out += mix(fast).map { QItem(it.id, QItem.MODE_FAST) }
        if (target == "difficult" || target == "bookmarks") {
            val inQ = (out.map { it.id } + learning.map { it.id }).toSet()
            out += mix(pool.filter { it.id !in inQ }).map { QItem(it.id, QItem.MODE_PRACTICE) }
        }
        return StudyQueue(out, learning)
    }

    /** Cards available right now or later today (for counters): reviews + learning + new within limits. */
    fun todayCount(target: String) = buildQueue(target, false).let { q -> q.main.count { it.scheduled } + q.learn.size }

    // ---------------- settings ----------------
    fun updateSettings(fn: (Settings) -> Settings) = scope.launch {
        val s = prefs.updateSettings { fn(it).copy(updatedAt = now()) }
        enqueue(buildJsonObject {
            put("t", "up"); put("table", "user_settings")
            put("row", buildJsonObject { put("data", Json0.encodeToJsonElement(Settings.serializer(), s)); put("updated_at", Rows.iso(now())) })
        }.toString())
    }

    suspend fun toggleSaved(pid: String) {
        if (pid in data.value.saved) {
            dao.deleteSaved(pid)
            enqueue(Rows.del("saved_public_decks", pid))
        } else {
            dao.upsertSaved(listOf(SavedPublic(pid)))
            enqueue(buildJsonObject { put("t", "up"); put("table", "saved_public_decks"); put("row", buildJsonObject { put("public_deck_id", pid) }) }.toString())
            if (cloud) runCatching { api.request("POST", "/public-decks/$pid/save") }
        }
    }

    // ---------------- backup ----------------
    suspend fun exportBackup(): String = buildJsonObject {
        put("app", "yodla"); put("version", 2); put("exportedAt", Rows.iso(now()))
        put("data", buildJsonObject {
            put("decks", JsonArray(dao.allDecks().map { camel(Rows.deck(it)) }))
            put("cards", JsonArray(dao.allCards().map { camel(Rows.card(it)) }))
            put("reviews", JsonArray(dao.allReviews().map { camel(Rows.review(it)) }))
            put("sessions", JsonArray(dao.allSessions().map { camel(Rows.session(it)) }))
            put("folders", JsonArray(dao.allFolders().map { camel(Rows.folder(it)) }))
            put("savedPublic", JsonArray(dao.allSaved().map { JsonPrimitive(it.publicDeckId) }))
            put("settings", Json0.encodeToJsonElement(Settings.serializer(), prefs.settingsNow()))
        })
    }.toString()

    /** Accepts Android and web backups (camelCase), merges by id. Returns (decks, cards). */
    suspend fun importBackup(text: String): Pair<Int, Int> {
        val root = Json0.parseToJsonElement(text).jsonObject
        val d = (root["data"] ?: root).jsonObject
        fun arr(k: String) = (d[k] as? JsonArray)?.map { snake(it.jsonObject) } ?: emptyList()
        val decks = arr("decks").map { Rows.deck(it) }
        val cards = arr("cards").map { o -> Rows.card(o).let { c -> if (c.noteId.isBlank()) c.copy(noteId = c.id) else c } }
        val reviews = arr("reviews").map { Rows.review(it) }
        val sessions = arr("sessions").map { Rows.session(it) }
        val folders = arr("folders").map { Rows.folder(it) }
        require(decks.isNotEmpty() || cards.isNotEmpty()) { "empty" }
        db.withTransaction {
            dao.upsertFolders(folders); dao.upsertDecks(decks); dao.upsertCards(cards); dao.upsertReviews(reviews); dao.upsertSessions(sessions)
            (d["savedPublic"] as? JsonArray)?.let { a -> dao.upsertSaved(a.map { SavedPublic(it.jsonPrimitive.content) }) }
        }
        enqueueAll(folders.map { Rows.up("folders", Rows.folder(it)) } + decks.map { Rows.up("decks", Rows.deck(it)) } +
            cards.map { Rows.up("flashcards", Rows.card(it)) } + reviews.map { Rows.up("review_logs", Rows.review(it)) } + sessions.map { Rows.up("study_sessions", Rows.session(it)) })
        return decks.size to cards.size
    }

    suspend fun wipeLocal() = db.withTransaction {
        dao.clearCards(); dao.clearDecks(); dao.clearFolders(); dao.clearReviews(); dao.clearSessions(); dao.clearSaved(); dao.clearOutbox()
    }
    suspend fun wipeAll() {
        val ops = dao.allDecks().map { Rows.del("decks", it.id) } + dao.allReviews().map { Rows.del("review_logs", it.id) } +
            dao.allSessions().map { Rows.del("study_sessions", it.id) } + dao.allFolders().map { Rows.del("folders", it.id) }
        db.withTransaction { dao.clearCards(); dao.clearDecks(); dao.clearFolders(); dao.clearReviews(); dao.clearSessions() }
        enqueueAll(ops)
    }

    /** Queue every local row for upload (used when a guest profile signs in). */
    suspend fun enqueueEverything() {
        enqueueAll(dao.allFolders().map { Rows.up("folders", Rows.folder(it)) } + dao.allDecks().map { Rows.up("decks", Rows.deck(it)) } +
            dao.allCards().map { Rows.up("flashcards", Rows.card(it)) } + dao.allReviews().map { Rows.up("review_logs", Rows.review(it)) } +
            dao.allSessions().map { Rows.up("study_sessions", Rows.session(it)) })
    }

    private fun camel(o: JsonObject) = JsonObject(o.mapKeys { (k, _) -> k.replace(Regex("_([a-z])")) { it.groupValues[1].uppercase() } })
    private fun snake(o: JsonObject): JsonObject {
        val m = o.mapKeys { (k, _) -> k.replace(Regex("[A-Z]")) { "_" + it.value.lowercase() } }.toMutableMap()
        m["card_type"]?.let { } ?: m["type"]?.let { m["card_type"] = it }
        return JsonObject(m)
    }
}

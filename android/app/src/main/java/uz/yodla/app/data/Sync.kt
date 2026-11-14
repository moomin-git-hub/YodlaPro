package uz.yodla.app.data

import android.net.Uri
import androidx.room.withTransaction
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import java.io.File

/** Offline outbox → server, and full pull. Images stored locally are uploaded to Neon Object Storage first. */
class SyncManager(private val repo: Repo) {
    private val lock = Mutex()
    var lastError: String = ""; private set
    var lastSync: Long = 0; private set

    suspend fun sync(pull: Boolean = true): Boolean = lock.withLock {
        val s = repo.prefs.sessionNow()
        if (s.user?.mode != "cloud" || s.token == null) return true
        try {
            flushLocked()
            if (pull && repo.dao.pending() == 0) pullLocked()
            lastError = ""; lastSync = now()
            true
        } catch (e: ApiException) {
            lastError = if (e.status == 0) "" else e.code
            if (e.status == 401) repo.prefs.updateSession { it.copy(token = null) }
            false
        }
    }

    private suspend fun flushLocked() {
        while (true) {
            val batch = repo.dao.peek(300)
            if (batch.isEmpty()) return
            val ops = batch.map { op ->
                val o = Json0.parseToJsonElement(op.json).jsonObject
                val fixed = uploadInlineImages(o)
                if (fixed !== o) repo.dao.rewrite(op.seq, fixed.toString())
                fixed
            }
            repo.api.request("POST", "/sync", buildJsonObject { put("ops", JsonArray(ops)) })
            repo.dao.ack(batch.last().seq)
        }
    }

    /** Replace file:// images in an outgoing row with URLs from the server's object storage. */
    private suspend fun uploadInlineImages(op: JsonObject): JsonObject {
        val row = op["row"] as? JsonObject ?: return op
        val img = (row["image"] as? JsonPrimitive)?.contentOrNull ?: return op
        if (!img.startsWith("file:")) return op
        val f = File(Uri.parse(img).path ?: return op)
        if (!f.exists()) return op
        val url = try {
            repo.api.request("POST", "/images", bytes = f.readBytes(), contentType = if (f.name.endsWith(".png")) "image/png" else "image/jpeg").jsonObject["url"]!!.jsonPrimitive.content
        } catch (e: ApiException) {
            if (e.status == 0 || e.status == 401) throw e
            return op // storage unavailable: keep local image, don't block sync
        }
        // update local rows that still point at this file
        val id = (row["id"] as? JsonPrimitive)?.content
        when ((op["table"] as JsonPrimitive).content) {
            "flashcards" -> repo.dao.allCards().filter { it.image == img }.takeIf { it.isNotEmpty() }?.let { l -> repo.dao.upsertCards(l.map { it.copy(image = url) }) }
            "decks" -> repo.dao.allDecks().filter { it.image == img || it.id == id && it.image == img }.takeIf { it.isNotEmpty() }?.let { l -> repo.dao.upsertDecks(l.map { it.copy(image = url) }) }
        }
        return JsonObject(op + ("row" to JsonObject(row + ("image" to JsonPrimitive(url)))))
    }

    private suspend fun pullLocked() {
        val r = repo.api.request("GET", "/sync").jsonObject
        fun rows(k: String) = (r[k] as? JsonArray)?.map { it.jsonObject } ?: emptyList()
        val decks = rows("decks").map(Rows::deck)
        val cards = rows("flashcards").map(Rows::card)
        val reviews = rows("review_logs").map(Rows::review)
        val sessions = rows("study_sessions").map(Rows::session)
        val folders = rows("folders").map(Rows::folder)
        val saved = rows("saved_public_decks").map { SavedPublic(it["public_deck_id"]!!.jsonPrimitive.content) }
        val dao = repo.dao
        repo.db.withTransaction {
            if (dao.pending() > 0) return@withTransaction // local changes arrived meanwhile; next sync will pull
            dao.clearCards(); dao.clearDecks(); dao.clearFolders(); dao.clearReviews(); dao.clearSessions(); dao.clearSaved()
            dao.upsertFolders(folders); dao.upsertDecks(decks); dao.upsertCards(cards); dao.upsertReviews(reviews); dao.upsertSessions(sessions); dao.upsertSaved(saved)
        }
        rows("user_settings").firstOrNull()?.get("data")?.let { el ->
            val remote = runCatching { Json0.decodeFromJsonElement(Settings.serializer(), el) }.getOrNull()
            val local = repo.prefs.settingsNow()
            if (remote != null && remote.updatedAt > local.updatedAt) repo.prefs.replaceSettings(remote.copy(lang = remote.lang.ifBlank { local.lang }))
        }
    }
}

/** Account handling against the Yodla server; "guest" profiles stay on the device. */
class AuthManager(private val repo: Repo, private val sync: SyncManager) {
    private fun user(o: JsonObject, mode: String = "cloud") = AuthUser(
        o["id"]!!.jsonPrimitive.content, o["email"]?.jsonPrimitive?.content.orEmpty(), o["name"]?.jsonPrimitive?.content.orEmpty(),
        o["createdAt"]?.jsonPrimitive?.longOrNull ?: 0, mode)

    private suspend fun startSession(res: JsonElement) {
        val o = res.jsonObject
        val wasGuest = repo.prefs.sessionNow().user?.guest == true
        repo.prefs.updateSession { it.copy(token = o["token"]!!.jsonPrimitive.content, user = user(o["user"]!!.jsonObject)) }
        if (wasGuest) repo.enqueueEverything() else repo.wipeLocal()
        sync.sync()
    }

    suspend fun signUp(email: String, password: String, name: String) =
        startSession(repo.api.request("POST", "/auth/signup", buildJsonObject { put("email", email.trim()); put("password", password); put("name", name.trim()) }, auth = false))

    suspend fun signIn(email: String, password: String) =
        startSession(repo.api.request("POST", "/auth/login", buildJsonObject { put("email", email.trim()); put("password", password) }, auth = false))

    suspend fun forgot(email: String) {
        val base = Api.normalizeBase(repo.prefs.sessionNow().serverUrl)
        repo.api.request("POST", "/auth/forgot", buildJsonObject { put("email", email.trim()); put("redirect", "$base/") }, auth = false)
    }

    suspend fun guest() = repo.prefs.updateSession { it.copy(token = null, user = AuthUser(uid(), "", "", now(), "guest")) }

    suspend fun refreshMe() {
        val s = repo.prefs.sessionNow()
        if (s.user?.mode != "cloud" || s.token == null) return
        try {
            val u = repo.api.request("GET", "/auth/me").jsonObject["user"]!!.jsonObject
            repo.prefs.updateSession { it.copy(user = user(u)) }
        } catch (e: ApiException) { if (e.status == 401) repo.prefs.updateSession { it.copy(token = null) } }
    }

    suspend fun updateName(name: String) {
        val s = repo.prefs.sessionNow()
        if (s.user?.mode == "cloud") repo.api.request("PATCH", "/auth/me", buildJsonObject { put("name", name.trim()) })
        repo.prefs.updateSession { it.copy(user = it.user?.copy(name = name.trim())) }
    }

    suspend fun changePassword(old: String, new: String) {
        repo.api.request("POST", "/auth/password", buildJsonObject { put("oldPassword", old); put("newPassword", new) })
    }

    /** Signs out. Cloud data stays on the server; local copy is removed. */
    suspend fun signOut() {
        if (repo.prefs.sessionNow().user?.mode == "cloud") runCatching { sync.sync(pull = false) }
        repo.wipeLocal()
        repo.prefs.updateSession { it.copy(token = null, user = null) }
    }

    suspend fun deleteAccount() {
        repo.api.request("DELETE", "/auth/me")
        repo.wipeLocal()
        repo.prefs.updateSession { it.copy(token = null, user = null) }
    }

    companion object {
        fun validEmail(s: String) = Regex("""^[^\s@]+@[^\s@]+\.[^\s@]{2,}$""").matches(s.trim())
        fun strong(p: String) = p.length >= 8 && p.any { it.isLetter() } && p.any { it.isDigit() }
    }
}

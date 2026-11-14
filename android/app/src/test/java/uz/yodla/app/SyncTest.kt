package uz.yodla.app

import android.graphics.Bitmap
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.yodla.app.data.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** End-to-end against a locally running Yodla server (skipped when YODLA_TEST_SERVER is unreachable). */
@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [34])
class SyncTest {
    private val server = System.getenv("YODLA_TEST_SERVER") ?: "http://127.0.0.1:3001"
    private fun up() = runCatching { (URL("$server/api/health").openConnection() as HttpURLConnection).apply { connectTimeout = 1500 }.responseCode == 200 }.getOrDefault(false)

    @Test fun fullRoundTrip() = runBlocking {
        assumeTrue("server not running", up())
        val repo = Graph.repo
        val ctx = ApplicationProvider.getApplicationContext<android.app.Application>()
        repo.prefs.updateSession { it.copy(serverUrl = server) }
        val email = "android${System.currentTimeMillis()}@test.uz"
        Graph.auth.signUp(email, "secret123", "Robo")
        assertNotNull(repo.prefs.sessionNow().token)

        // create content offline-style: deck + basic + cloze + occlusion with a local image
        val deck = repo.saveDeck(repo.newDeck("Anatomy").copy(preset = Presets.MEDICAL, category = "medicine"))
        repo.addCards(deck.id, listOf(DraftCard("Heart", "Pumps blood"), DraftCard("The {{c1::aorta}} is the {{c2::largest}} artery", "", type = CardType.CLOZE)))
        val img = File(ctx.filesDir, "images").apply { mkdirs() }.resolve("t.jpg")
        img.outputStream().use { Bitmap.createBitmap(64, 48, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 80, it) }
        val occ = Occlusion(listOf(Mask("m1", .1f, .1f, .2f, .1f), Mask("m2", .5f, .5f, .2f, .1f)))
        repo.saveNote(repo.blankCard(deck.id).copy(type = CardType.OCCLUSION, image = Uri.fromFile(img).toString(), extra = Json0.encodeToString(Occlusion.serializer(), occ)))
        val sub = repo.saveDeck(repo.newDeck("Heart").copy(parentId = deck.id))
        repo.addCards(sub.id, listOf(DraftCard("<b>Aorta</b> carries <i>oxygenated</i> blood", "From the <u>left ventricle</u> $\\to$ body")))
        var cards = repo.dao.cardsOf(deck.id)
        assertEquals(5, cards.size) // 1 basic + 2 cloze + 2 occlusion
        repo.review(cards.first { it.type == CardType.BASIC }.id, 3, 4000)

        assertTrue(Graph.sync.sync(pull = false))
        assertEquals(0, repo.dao.pending())
        cards = repo.dao.cardsOf(deck.id)
        val occCards = cards.filter { it.type == CardType.OCCLUSION }
        assertTrue("image uploaded: ${occCards.first().image}", occCards.all { it.image.startsWith("http") && "/api/files/" in it.image })

        // second device: wipe local, pull everything back
        repo.wipeLocal()
        assertTrue(Graph.sync.sync())
        val pulled = repo.dao.cardsOf(deck.id)
        assertEquals(5, pulled.size)
        assertEquals(Presets.MEDICAL, repo.dao.deck(deck.id)!!.preset)
        assertEquals(2, pulled.filter { it.type == CardType.CLOZE }.map { it.cloze().c }.toSet().size)
        assertEquals(setOf("m1", "m2"), pulled.filter { it.type == CardType.OCCLUSION }.map { it.occlusion().t }.toSet())
        assertEquals(1, repo.dao.allReviews().size)
        assertEquals(deck.id, repo.dao.deck(sub.id)!!.parentId)
        assertTrue(repo.dao.cardsOf(sub.id).single().front.startsWith("<b>Aorta</b>"))
        // studying the parent includes subdeck cards
        repo.data.first { it.decks.any { d -> d.id == sub.id } && it.cards.size >= 6 }
        assertTrue(repo.buildQueue(deck.id, true).main.map { it.id }.containsAll(repo.dao.cardsOf(sub.id).map { it.id }))
        assertEquals(Status.REVIEW, pulled.first { it.type == CardType.BASIC }.status) // FSRS: one Good graduates a new card (1d)

        // image URL redirects to object storage and returns bytes
        val conn = URL(occCards.first().image).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true
        assertEquals(200, conn.responseCode)

        // editing the note keeps progress and removes deleted masks
        val one = pulled.first { it.type == CardType.OCCLUSION }
        repo.saveNote(one.copy(extra = Json0.encodeToString(Occlusion.serializer(), occ.copy(masks = occ.masks.take(1)))))
        assertEquals(1, repo.dao.cardsOf(deck.id).count { it.type == CardType.OCCLUSION })
        assertTrue(Graph.sync.sync())
        assertEquals(4, repo.dao.cardsOf(deck.id).size)

        // deleting the parent removes the subdeck and its cards everywhere
        repo.deleteDeck(deck.id)
        assertTrue(Graph.sync.sync())
        assertNull(repo.dao.deck(sub.id))
        assertEquals(0, repo.dao.allCards().size)

        Graph.auth.signOut()
        assertNull(repo.prefs.sessionNow().user)
        assertEquals(0, repo.dao.allCards().size)
    }
}

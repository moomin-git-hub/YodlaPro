package uz.yodla.app

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.yodla.app.data.*

/** Daily limits, "learn more", reset and shuffle — the study session as the user experiences it. */
@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [34])
class StudyFlowTest {
    private val repo get() = Graph.repo

    private suspend fun settle(check: (AppData) -> Boolean) {
        repeat(100) { if (check(repo.data.value)) return; delay(30) }
        fail("data did not settle")
    }

    @Test fun limitsResetAndMore() = runBlocking {
        repo.updateSettings { it.copy(newPerDay = 20, shuffle = false) }.join()
        val deck = repo.saveDeck(repo.newDeck("4000 words"))
        repo.addCards(deck.id, (1..60).map { DraftCard("w$it", "t$it") })
        settle { d -> d.cards.count { it.deckId == deck.id } == 60 && d.settings.newPerDay == 20 }

        // the badge equals what the session really shows
        assertEquals(20, repo.todayCount(deck.id))
        val q = repo.buildQueue(deck.id, false)
        assertEquals(20, q.main.size)
        val firstIds = q.main.map { it.id }
        val ordered = repo.data.value.cards.filter { it.deckId == deck.id }.sortedBy { it.createdAt }.take(20).map { it.id }
        assertEquals("shuffle off → deck order", ordered, firstIds)

        // study all 20 (Good) → they are learning, no new room left
        firstIds.forEach { repo.review(it, 3, 1000) }
        settle { d -> d.reviews.size == 20 && d.cards.filter { it.id in firstIds }.none { it.status == Status.NEW } }
        val after = repo.buildQueue(deck.id, false)
        assertEquals(0, after.main.size); assertEquals(20, after.learn.size)
        assertEquals(20, repo.todayCount(deck.id))
        // "learn more" offers further words beyond today's limit, never ones already in the session
        val more = repo.moreNew(deck.id, after.learn.map { it.id }.toSet())
        assertEquals(10, more.size); assertTrue(more.none { it.id in firstIds })

        // reset progress → those cards are new again and do not use up today's limit any more
        repo.resetProgress(firstIds)
        settle { d -> d.cards.filter { it.id in firstIds }.all { it.status == Status.NEW } }
        assertEquals(20, repo.todayCount(deck.id))
        assertEquals(20, repo.buildQueue(deck.id, false).main.size)

        // raising the limit is applied immediately
        repo.updateSettings { it.copy(newPerDay = 50) }.join()
        settle { it.settings.newPerDay == 50 }
        assertEquals(50, repo.todayCount(deck.id))

        // shuffle on → random words from the whole deck, not just the first ones
        repo.updateSettings { it.copy(newPerDay = 20, shuffle = true) }.join()
        settle { it.settings.shuffle && it.settings.newPerDay == 20 }
        val picks = (1..5).map { repo.buildQueue(deck.id, false).main.map { it.id }.toSet() }
        assertTrue("shuffled picks reach beyond the first 20", picks.any { p -> p != ordered.toSet() })
        assertTrue(picks.all { it.size == 20 })
    }

    @Test fun hardAndGoodTimesAreRespected() = runBlocking {
        val deck = repo.saveDeck(repo.newDeck("Timing"))
        val cards = repo.addCards(deck.id, listOf(DraftCard("a", "1"), DraftCard("b", "2")))
        settle { d -> d.cards.count { it.deckId == deck.id } == 2 }
        val t0 = now()
        var q = repo.buildQueue(deck.id, false)
        val first = q.next(t0) as Next.Show; q = first.queue
        val fresh = repo.dao.card(first.item.id)!!
        val hardLabel = Srs.preview(fresh, 2, Algo.FSRS, repo.presetFor(deck), now())
        repo.review(first.item.id, 2, 1000) // Hard
        val u = repo.dao.card(first.item.id)!!
        assertEquals(Status.LEARNING, u.status)
        assertTrue("Hard keeps the card away for its shown time ($hardLabel)", u.due - now() >= 5 * MIN_MS)
        q = q.afterAnswer(u, Srs.endOfToday())
        val second = q.next(now()) as Next.Show
        assertNotEquals(first.item.id, second.item.id); q = second.queue
        repo.review(second.item.id, 4, 1000) // Easy → graduates, leaves today's session
        q = q.afterAnswer(repo.dao.card(second.item.id)!!, Srs.endOfToday())
        assertTrue("only the Hard card is left and it is not due yet", q.next(now() + 10_000) is Next.Wait)
        assertEquals(first.item.id, (q.next(u.due) as Next.Show).item.id)
        assertTrue(cards.isNotEmpty())
    }
}

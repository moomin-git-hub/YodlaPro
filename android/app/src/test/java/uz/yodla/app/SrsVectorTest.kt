package uz.yodla.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import uz.yodla.app.data.*

/** The Kotlin scheduler must produce exactly what the web (TypeScript) scheduler produces. */
class SrsVectorTest {
    private val root = Json.parseToJsonElement(javaClass.classLoader!!.getResource("srs_vectors.json")!!.readText()).jsonObject

    @Test fun matchesTypeScript() {
        for (v in root["vectors"]!!.jsonArray.map { it.jsonObject }) {
            val name = v["name"]!!.jsonPrimitive.content
            val algo = v["algo"]!!.jsonPrimitive.content
            val cfg = Presets.builtIn(v["preset"]!!.jsonPrimitive.content)!!
            var c = Card(id = name, deckId = "d", noteId = name, front = "", back = "", due = 1_760_000_000_000, createdAt = 0, updatedAt = 0)
            v["steps"]!!.jsonArray.forEachIndexed { i, e ->
                val o = e.jsonObject
                val now = o["now"]!!.jsonPrimitive.long
                val s = Srs.schedule(c, o["r"]!!.jsonPrimitive.int, algo, cfg, now)
                val at = "$name step $i"
                assertEquals(at, o["status"]!!.jsonPrimitive.content, s.status)
                assertEquals(at, o["step"]!!.jsonPrimitive.int, s.step)
                assertEquals(at, o["interval"]!!.jsonPrimitive.double, s.interval, 0.0)
                assertEquals(at, o["due"]!!.jsonPrimitive.long, s.due)
                assertEquals(at, o["ease"]!!.jsonPrimitive.double, s.ease, 1e-9)
                assertEquals(at, o["stability"]!!.jsonPrimitive.double, s.stability, 2e-4)
                assertEquals(at, o["difficulty"]!!.jsonPrimitive.double, s.difficulty, 2e-4)
                c = c.copy(status = s.status, step = s.step, ease = s.ease, interval = s.interval, due = s.due, reps = s.reps, lapses = s.lapses, stability = s.stability, difficulty = s.difficulty, lastReview = now)
            }
        }
        root["hash"]!!.jsonArray.forEach { val (str, h) = it.jsonArray; assertEquals(h.jsonPrimitive.double, Srs.hash01(str.jsonPrimitive.content), 0.0) }
        root["fuzz"]!!.jsonArray.forEach { val (dd, seed, r) = it.jsonArray; assertEquals(r.jsonPrimitive.double, Srs.fuzz(dd.jsonPrimitive.double, seed.jsonPrimitive.content, 36500.0), 0.0) }
        root["retr"]!!.jsonArray.forEach { val (t, st, r) = it.jsonArray; assertEquals(r.jsonPrimitive.double, Fsrs.retrievability(t.jsonPrimitive.double, st.jsonPrimitive.double), 1e-12) }
    }

    private fun card(id: String, status: String = Status.NEW, due: Long = 0) = Card(id = id, deckId = "d", noteId = id, front = "", back = "", due = due, createdAt = 0, updatedAt = 0, status = status)

    @Test fun learningCardWaitsForItsStep() {
        val t = 1_000_000_000L
        var q = StudyQueue(listOf(QItem("a"), QItem("b")))
        val first = q.next(t) as Next.Show
        assertEquals("a", first.item.id); q = first.queue
        // "a" answered Hard → due in 13 minutes
        q = q.afterAnswer(card("a", Status.LEARNING, t + 13 * MIN_MS), t + DAY_MS)
        val second = q.next(t + 5_000) as Next.Show
        assertEquals("b", second.item.id); q = second.queue
        // only "a" is left and it is not due yet → wait (it must NOT come back after 10 seconds)
        val wait = q.next(t + 10_000)
        assertTrue(wait is Next.Wait); assertEquals(t + 13 * MIN_MS, (wait as Next.Wait).until)
        assertEquals("a", (q.next(t + 13 * MIN_MS) as Next.Show).item.id)
        assertEquals("a", (q.next(t + 10_000, force = true) as Next.Show).item.id)
    }

    @Test fun dueLearningCardJumpsAheadOfNewCards() {
        val t = 5_000_000L
        val q = StudyQueue(listOf(QItem("n1"), QItem("n2")), listOf(Learn("l", t - 1)))
        assertEquals("l", (q.next(t) as Next.Show).item.id)
        assertEquals(Next.Done, StudyQueue().next(t))
    }

    @Test fun graduatedCardLeavesTheSession() {
        val q = StudyQueue().afterAnswer(card("x", Status.REVIEW, 10), 100)
        assertTrue(q.isEmpty)
    }

    @Test fun intervalsAreOrderedAndPreviewMatchesAnswer() {
        val cfg = SrsConfig()
        for (algo in listOf(Algo.FSRS, Algo.SM2)) for (ivl in listOf(1.0, 3.0, 10.0, 40.0, 200.0)) {
            val c = card("k$ivl").copy(status = Status.REVIEW, interval = ivl, due = 10 * DAY_MS, lastReview = 10 * DAY_MS - (ivl * DAY_MS).toLong(), reps = 5, stability = if (algo == Algo.FSRS) ivl else 0.0, difficulty = if (algo == Algo.FSRS) 5.0 else 0.0)
            val now = 10 * DAY_MS + 3600_000
            val (h, g, e) = listOf(2, 3, 4).map { Srs.schedule(c, it, algo, cfg, now).interval }
            assertTrue("$algo ivl=$ivl: $h < $g < $e", h < g && g < e)
            assertTrue("$algo good ≥ old for ivl=$ivl", g >= ivl)
            assertEquals(Srs.schedule(c, 3, algo, cfg, now), Srs.schedule(c, 3, algo, cfg, now))
        }
    }

    @Test fun fsrsLapseShrinksStabilityAndRaisesDifficulty() {
        val c = card("z").copy(status = Status.REVIEW, interval = 30.0, stability = 30.0, difficulty = 5.0, due = 30 * DAY_MS, lastReview = 0, reps = 6)
        val s = Srs.schedule(c, 1, Algo.FSRS, SrsConfig(), 30 * DAY_MS)
        assertEquals(Status.RELEARNING, s.status)
        assertTrue(s.stability < 30.0 / 2); assertTrue(s.difficulty > 5.0); assertEquals(1, s.lapses)
        assertEquals(30 * DAY_MS + 1 * MIN_MS, s.due) // FSRS relearning: Again → 1m
    }

    @Test fun fastReviewNeverReschedules() {
        val c = card("f").copy(status = Status.REVIEW, interval = 9.0, due = 777)
        val s = Srs.schedule(c, 1, Algo.FAST, SrsConfig(), 10_000)
        assertEquals(777, s.due); assertEquals(Status.REVIEW, s.status); assertEquals(9.0, s.interval, 0.0)
    }
}

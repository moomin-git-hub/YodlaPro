package uz.yodla.app

import org.junit.Assert.*
import org.junit.Test
import uz.yodla.app.data.*

class LogicTest {
    private fun card(status: String = Status.NEW, interval: Double = 0.0, ease: Double = 2.5, step: Int = 0) =
        Card(id = "c1", deckId = "d", noteId = "c1", front = "q", back = "a", due = 0, createdAt = 0, updatedAt = 0, status = status, interval = interval, ease = ease, step = step)

    @Test fun newCardGoodWalksLearningStepsThenGraduates() {
        val cfg = SrsConfig()
        val t = 1_000_000_000L
        val s1 = Srs.schedule(card(), 3, Algo.SM2, cfg, t)
        assertEquals(Status.LEARNING, s1.status); assertEquals(t + 10 * MIN_MS, s1.due)
        val s2 = Srs.schedule(card(Status.LEARNING, step = 1), 3, Algo.SM2, cfg, t)
        assertEquals(Status.REVIEW, s2.status); assertEquals(1.0, s2.interval, 0.0)
    }

    @Test fun easyGraduatesImmediatelyAndRaisesEase() {
        val s = Srs.schedule(card(), 4, Algo.SM2, SrsConfig(), 0)
        assertEquals(Status.REVIEW, s.status); assertTrue("fuzzed 4d", s.interval in 3.0..5.0); assertEquals(2.65, s.ease, 1e-9)
    }

    @Test fun reviewIntervalsGrowAndHardIsShorterThanEasy() {
        val c = card(Status.REVIEW, interval = 10.0)
        val hard = Srs.schedule(c, 2, Algo.SM2, SrsConfig(), 0).interval
        val good = Srs.schedule(c, 3, Algo.SM2, SrsConfig(), 0).interval
        val easy = Srs.schedule(c, 4, Algo.SM2, SrsConfig(), 0).interval
        assertTrue("$hard < $good < $easy", hard < good && good < easy)
        assertTrue(good >= 23) // 10 × 2.5 ± fuzz
    }

    @Test fun lapseGoesToRelearningAndLowersEase() {
        val s = Srs.schedule(card(Status.REVIEW, interval = 20.0), 1, Algo.SM2, SrsConfig(), 0)
        assertEquals(Status.RELEARNING, s.status); assertEquals(1, s.lapses); assertEquals(2.3, s.ease, 1e-9); assertEquals(4.0, s.interval, 0.0)
    }

    @Test fun presetsChangeBehaviour() {
        val c = card(Status.REVIEW, interval = 25.0)
        assertTrue(Srs.schedule(c, 4, Algo.SM2, Presets.builtIn(Presets.EXAM)!!, 0).interval <= 30.0)
        assertEquals(3, Presets.builtIn(Presets.LANGUAGES)!!.learningSteps.size)
        val std = Srs.schedule(c, 3, Algo.SM2, Presets.builtIn(Presets.STANDARD)!!, 0).interval
        val med = Srs.schedule(c, 3, Algo.SM2, Presets.builtIn(Presets.MEDICAL)!!, 0).interval
        assertTrue(med < std)
    }

    @Test fun clozeParsing() {
        val t = "The capital of {{c1::France}} is {{c2::Paris::city}}."
        assertEquals(listOf(1, 2), Cloze.indices(t))
        assertEquals("The capital of ⟦…⟧ is Paris.", Cloze.front(t, 1))
        assertEquals("The capital of France is ⟦city⟧.", Cloze.front(t, 2))
        assertEquals("The capital of France is ⟪Paris⟫.", Cloze.back(t, 2))
        assertEquals("The capital of France is Paris.", Cloze.plain(t))
        assertEquals(3, Cloze.nextIndex(t))
    }

    @Test fun importParsesCsvAnkiAndJson() {
        val csv = Files.parseImport("question,answer\nhola,hello\ngracias;thanks\n\"multi, comma\",\"ok\"")
        assertEquals(listOf("hola", "multi, comma"), csv.map { it.front })
        val tsv = Files.parseImport("cat\tmushuk\tThe cat sleeps\ndog\tit")
        assertEquals("The cat sleeps", tsv[0].example)
        val json = Files.parseImport("""{"cards":[{"question":"Q1","answer":"A1"},{"front":"{{c1::x}} y","back":"z"}]}""")
        assertEquals(2, json.size)
        val cloze = Files.parseImport("{{c1::Tashkent}} is the capital,note")
        assertEquals(CardType.CLOZE, cloze[0].type)
    }

    @Test fun quickExtract() {
        val out = Remote.quickExtract("Photosynthesis — turning light into energy\n• Mitochondria: powerhouse of the cell\n3) Osmosis - water movement")
        assertEquals(listOf("Photosynthesis", "Mitochondria", "Osmosis"), out.map { it.front })
    }

    @Test fun rowsRoundTrip() {
        val c = card(Status.REVIEW, 12.0).copy(type = CardType.OCCLUSION, extra = """{"masks":[],"t":"m"}""", frozen = true, due = 1_763_100_000_123, lastReview = 1_763_000_000_000)
        val back = Rows.card(Rows.card(c))
        assertEquals(c, back)
        assertEquals(1_763_100_000_000, Rows.parseTs(kotlinx.serialization.json.JsonPrimitive("2025-11-14T06:00:00Z")))
        assertEquals(1_763_100_000_000, Rows.parseTs(kotlinx.serialization.json.JsonPrimitive("2025-11-14T06:00:00.000+00:00")))
    }

    @Test fun serverUrlNormalisation() {
        assertEquals("https://yodla.onrender.com", Api.normalizeBase(" yodla.onrender.com/ "))
        assertEquals("https://x.dev", Api.normalizeBase("https://x.dev/api"))
        assertEquals("http://10.0.2.2:3000", Api.normalizeBase("http://10.0.2.2:3000"))
    }
}

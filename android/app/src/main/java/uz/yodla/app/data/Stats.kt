package uz.yodla.app.data

import kotlin.math.roundToInt

data class DeckStats(val total: Int, val new: Int, val learning: Int, val mastered: Int, val due: Int, val progress: Int)
data class DayCount(val reviews: Int, val correct: Int, val ms: Long)

object Stats {
    fun deck(cards: List<Card>): DeckStats {
        var n = 0; var l = 0; var m = 0; var d = 0
        for (c in cards) {
            when { c.status == Status.NEW -> n++; Srs.isMastered(c) -> m++; else -> l++ }
            if (Srs.isDue(c)) d++
        }
        val t = cards.size
        return DeckStats(t, n, l, m, d, if (t == 0) 0 else ((m + l * 0.5) / t * 100).roundToInt())
    }

    fun dayCounts(reviews: List<ReviewLog>): Map<Long, DayCount> =
        reviews.groupBy { Srs.startOfDay(it.ts) }.mapValues { (_, l) -> DayCount(l.size, l.count { it.rating >= 3 }, l.sumOf { it.durationMs }) }

    fun streaks(reviews: List<ReviewLog>): Pair<Int, Int> {
        val days = reviews.map { Srs.startOfDay(it.ts) }.toSortedSet()
        var cur = 0
        var t = Srs.startOfDay(now())
        if (t !in days) t = Srs.startOfDay(t - DAY_MS / 2)
        while (t in days) { cur++; t = Srs.startOfDay(t - DAY_MS / 2) }
        var best = 0; var run = 0; var prev = 0L
        for (d in days) { run = if (prev != 0L && ((d - prev) / DAY_MS.toDouble()).roundToInt() == 1) run + 1 else 1; best = maxOf(best, run); prev = d }
        return cur to best
    }

    fun totalMs(d: AppData) = maxOf(d.sessions.sumOf { it.durationMs }, d.reviews.sumOf { it.durationMs })

    fun today(d: AppData): Pair<Int, Long> {
        val s = Srs.startOfDay(now())
        val l = d.reviews.filter { it.ts >= s }
        return l.size to l.sumOf { it.durationMs }
    }

    fun forecast(cards: List<Card>, days: Int = 7): IntArray {
        val out = IntArray(days)
        val base = Srs.startOfDay(now())
        for (c in cards) {
            if (c.status == Status.NEW || c.frozen) continue
            val idx = if (c.due <= Srs.endOfToday()) 0 else ((Srs.startOfDay(c.due) - base) / DAY_MS.toDouble()).roundToInt()
            if (idx in 0 until days) out[idx]++
        }
        return out
    }

    fun lastDays(n: Int): List<Long> { val base = Srs.startOfDay(now()); return (n - 1 downTo 0).map { Srs.startOfDay(base - it * DAY_MS + DAY_MS / 2) } }

    fun newAvailable(d: AppData, repo: Repo): Int {
        val t = repo.todayInfo(d)
        return d.decks.filter { !it.archived && it.algorithm != Algo.FAST }.sumOf { deck ->
            val cfg = repo.presetFor(deck)
            val introduced = t.newIntroduced[deck.id] ?: 0
            minOf((cfg.newPerDay - introduced).coerceAtLeast(0), d.cards.count { it.deckId == deck.id && it.status == Status.NEW && !it.frozen })
        }
    }
}

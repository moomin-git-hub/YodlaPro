package uz.yodla.app.data

import kotlinx.serialization.Serializable
import java.util.Calendar
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/*
 * Yodla scheduler — 1:1 port of src/lib/srs.ts (golden vectors in test/resources/srs_vectors.json keep them identical).
 *  • fsrs — FSRS-5: Stability / Difficulty memory model, next review when recall probability hits the desired retention
 *  • sm2  — Anki-style SM-2 with ease factor, overdue bonus and interval modifier
 *  • fast — no schedule, ratings are only logged
 */

const val MIN_MS = 60_000L
const val DAY_MS = 86_400_000L
const val MASTERED_DAYS = 21.0

object Algo {
    const val FSRS = "fsrs"; const val SM2 = "sm2"; const val FAST = "fast"
    val all = listOf(FSRS, FAST, SM2)
}

@Serializable
data class SrsConfig(
    val learningSteps: List<Double> = listOf(1.0, 10.0),   // minutes
    val relearningSteps: List<Double> = listOf(10.0),      // minutes
    val graduatingDays: Double = 1.0,
    val easyDays: Double = 4.0,
    val startEase: Double = 2.5,
    val easyBonus: Double = 1.3,
    val hardFactor: Double = 1.2,
    val intervalModifier: Double = 1.0,
    val lapseFactor: Double = 0.2,
    val maxIntervalDays: Double = 36500.0,
    val newPerDay: Int = 20,
    val maxReviewsPerDay: Int = 9999,
    val desiredRetention: Double = 0.9,
)

object Presets {
    const val STANDARD = "standard"
    const val LANGUAGES = "languages"
    const val MEDICAL = "medical"
    const val EXAM = "exam"
    const val CUSTOM = "custom"
    val ids = listOf(STANDARD, LANGUAGES, MEDICAL, EXAM, CUSTOM)

    fun builtIn(id: String): SrsConfig? = when (id) {
        STANDARD -> SrsConfig()
        LANGUAGES -> SrsConfig(learningSteps = listOf(1.0, 10.0, 60.0), easyDays = 3.0, easyBonus = 1.2, intervalModifier = 0.9, newPerDay = 25, desiredRetention = 0.9)
        MEDICAL -> SrsConfig(learningSteps = listOf(1.0, 10.0, 60.0, 360.0), relearningSteps = listOf(10.0, 60.0), easyDays = 3.0, easyBonus = 1.15, intervalModifier = 0.8, maxIntervalDays = 180.0, newPerDay = 15, desiredRetention = 0.92)
        EXAM -> SrsConfig(learningSteps = listOf(1.0, 5.0, 20.0), relearningSteps = listOf(5.0), easyDays = 2.0, easyBonus = 1.2, intervalModifier = 0.7, maxIntervalDays = 30.0, newPerDay = 40, desiredRetention = 0.88)
        else -> null
    }
}

data class Scheduled(
    val status: String, val step: Int, val ease: Double, val interval: Double, val due: Long, val reps: Int, val lapses: Int,
    val stability: Double, val difficulty: Double,
)

object Fsrs {
    val W = doubleArrayOf(0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621)
    private const val DECAY = -0.5
    private const val FACTOR = 19.0 / 81.0
    fun retrievability(elapsedDays: Double, s: Double) = (1 + FACTOR * elapsedDays / s).pow(DECAY)
    fun intervalFor(s: Double, retention: Double) = s / FACTOR * (retention.pow(1 / DECAY) - 1)
    fun initS(g: Int) = W[g - 1]
    fun initD(g: Int) = (W[4] - exp(W[5] * (g - 1)) + 1).coerceIn(1.0, 10.0)
    fun nextD(d: Double, g: Int): Double {
        val delta = -W[6] * (g - 3)
        val next = d + delta * (10 - d) / 9
        return (W[7] * initD(4) + (1 - W[7]) * next).coerceIn(1.0, 10.0)
    }
    fun recallS(d: Double, s: Double, r: Double, g: Int): Double {
        val hard = if (g == 2) W[15] else 1.0
        val easy = if (g == 4) W[16] else 1.0
        return s * (1 + exp(W[8]) * (11 - d) * s.pow(-W[9]) * (exp((1 - r) * W[10]) - 1) * hard * easy)
    }
    /** Post-lapse stability, capped at S / e^(w17·w18) exactly like the official FSRS-5 (ts-fsrs 4.x). */
    fun forgetS(d: Double, s: Double, r: Double) = min(W[11] * d.pow(-W[12]) * ((s + 1).pow(W[13]) - 1) * exp((1 - r) * W[14]), s / exp(W[17] * W[18]))
    fun shortS(s: Double, g: Int): Double {
        val n = s * exp(W[17] * (g - 3 + W[18]))
        return if (g >= 3) max(n, s) else n
    }
    /** Long-term formula after ≥ 1 day, short-term (same-day) otherwise. */
    fun update(s: Double, d: Double, elapsedDays: Double, g: Int): Pair<Double, Double> {
        val ns = if (elapsedDays >= 1) {
            val r = retrievability(elapsedDays, s)
            if (g == 1) forgetS(d, s, r) else recallS(d, s, r, g)
        } else shortS(s, g)
        return max(0.01, ns) to nextD(d, g)
    }
}

object Srs {
    /** FNV-1a over UTF-16 code units → [0, 1); identical to the TypeScript version. */
    fun hash01(s: String): Double {
        var h = 0x811c9dc5.toInt()
        for (ch in s) { h = h xor ch.code; h *= 0x01000193 }
        return (h.toLong() and 0xffffffffL) / 4294967296.0
    }

    private fun jsRound(x: Double): Long = floor(x + 0.5).toLong()   // Math.round semantics

    fun fuzz(days: Double, seed: String, maxI: Double): Double {
        if (days < 2.5) return jsRound(days).toDouble()
        var delta = 1.0
        delta += 0.15 * (min(days, 7.0) - 2.5)
        if (days > 7) delta += 0.1 * (min(days, 20.0) - 7)
        if (days > 20) delta += 0.05 * (days - 20)
        val lo = max(2.0, jsRound(days - delta).toDouble())
        val hi = min(maxI, jsRound(days + delta).toDouble())
        if (hi <= lo) return min(maxI, lo)
        return lo + floor(hash01(seed) * (hi - lo + 1))
    }

    private fun orderAndFuzz(h: Double, g: Double, e: Double, seed: String, maxI: Double): Triple<Double, Double, Double> {
        var hard = h.coerceIn(1.0, maxI); var good = g.coerceIn(1.0, maxI); var easy = e.coerceIn(1.0, maxI)
        hard = min(hard, good)
        good = max(good, hard + 1)
        easy = max(easy, good + 1)
        hard = min(maxI, fuzz(hard, seed + "h", maxI))
        good = min(maxI, max(fuzz(good, seed + "g", maxI), hard + 1))
        easy = min(maxI, max(fuzz(easy, seed + "e", maxI), good + 1))
        return Triple(hard, good, easy)
    }

    private fun hardDelay(st: List<Double>, step: Int) =
        if (step == 0) (if (st.size > 1) (st[0] + st[1]) / 2 else min(st[0] * 1.5, st[0] + 1440)) else st[min(step, st.lastIndex)]

    private fun r2(x: Double) = jsRound(x * 100) / 100.0
    private fun r4(x: Double) = jsRound(x * 10000) / 10000.0

    /**
     * FSRS learning phase (Noji-style, one pass): Again → 1m, Hard → 15m, Good/Easy → leaves learning.
     * A brand-new word graduates conservatively to 1d (Good) / 4d (Easy); from then on FSRS stability decides.
     */
    const val FSRS_AGAIN_MIN = 1.0; const val FSRS_HARD_MIN = 15.0; const val FIRST_GOOD_DAYS = 1.0; const val FIRST_EASY_DAYS = 4.0
    /** A forgotten review card (Again) is relearned in the same session, 10 minutes later. */
    const val FSRS_LAPSE_MIN = 10.0

    fun schedule(card: Card, rating: Int, algo: String, cfg: SrsConfig, now: Long = System.currentTimeMillis()): Scheduled {
        val reps = card.reps + 1
        // Fast review: no schedule — the card keeps its state (so switching back to FSRS/SM-2 continues where it was).
        if (algo == Algo.FAST) return Scheduled(card.status, card.step, card.ease, card.interval, card.due, reps, card.lapses, card.stability, card.difficulty)

        val maxI = max(1.0, cfg.maxIntervalDays)
        val seed = "${card.id}:$reps"
        val elapsed = elapsedDays(card, now)
        val learn = cfg.learningSteps.ifEmpty { listOf(1.0) }
        val relearn = cfg.relearningSteps.ifEmpty { listOf(1.0) }
        val inLearning = card.status == Status.NEW || card.status == Status.LEARNING
        val inRelearning = card.status == Status.RELEARNING
        val st = if (inRelearning) relearn else learn
        var status = card.status; var step = card.step; var ease = card.ease; var interval = card.interval; var lapses = card.lapses
        var s = card.stability; var d = card.difficulty
        var due = now
        val migratedD = (11 - 2.2 * card.ease).coerceIn(1.0, 10.0)

        if (algo == Algo.FSRS) {
            if (s <= 0 || d <= 0) {
                if (card.status == Status.REVIEW && card.interval > 0) { s = max(0.5, card.interval); d = migratedD }
                else { s = Fsrs.initS(rating); d = Fsrs.initD(rating) }
                if (card.status == Status.REVIEW) Fsrs.update(s, d, elapsed, rating).let { s = it.first; d = it.second }
            } else Fsrs.update(s, d, elapsed, rating).let { s = it.first; d = it.second }
        }

        fun goodS(): Double = when {
            card.stability > 0 && card.difficulty > 0 -> Fsrs.update(card.stability, card.difficulty, elapsed, 3).first
            card.status == Status.REVIEW && card.interval > 0 -> s
            else -> Fsrs.initS(3)
        }
        /** Fuzzed graduation interval; Easy always stays at least one day above Good (also after fuzz). */
        fun gradFuzz(g: Int, goodBase: Double, easyBase: Double): Double {
            val gi = fuzz(goodBase, seed + "G", maxI)
            return if (g == 3) gi else minOf(maxI, max(fuzz(easyBase, seed + "E", maxI), gi + 1))
        }
        fun graduate(g: Int): Double {
            if (algo == Algo.FSRS) {
                val good = max(1.0, jsRound(Fsrs.intervalFor(goodS(), cfg.desiredRetention)).toDouble())
                val own = max(1.0, jsRound(Fsrs.intervalFor(s, cfg.desiredRetention)).toDouble())
                return (if (g == 4) max(own, good + 1) else own).coerceIn(1.0, maxI)
            }
            return (if (g == 4) cfg.easyDays else cfg.graduatingDays).coerceIn(1.0, maxI)
        }

        if ((inLearning || inRelearning) && algo == Algo.FSRS) {
            val lStatus = if (inRelearning) Status.RELEARNING else Status.LEARNING
            when (rating) {
                1 -> { step = 0; status = lStatus; due = now + (FSRS_AGAIN_MIN * MIN_MS).roundToLong() }
                2 -> { step = 0; status = lStatus; due = now + (FSRS_HARD_MIN * MIN_MS).roundToLong() }
                else -> {
                    interval = if (inRelearning) gradFuzz(rating, max(1.0, jsRound(Fsrs.intervalFor(goodS(), cfg.desiredRetention)).toDouble()).coerceIn(1.0, maxI), graduate(4))
                    else minOf(graduate(rating), if (rating == 4) FIRST_EASY_DAYS else FIRST_GOOD_DAYS, maxI)
                    status = Status.REVIEW; step = 0; due = now + (interval * DAY_MS).roundToLong()
                }
            }
        } else if (inLearning || inRelearning) {
            val lStatus = if (inRelearning) Status.RELEARNING else Status.LEARNING
            when {
                rating == 1 -> { step = 0; status = lStatus; due = now + (st[0] * MIN_MS).roundToLong() }
                rating == 2 -> { status = lStatus; due = now + (hardDelay(st, step) * MIN_MS).roundToLong() }
                rating == 3 && step + 1 < st.size -> { step += 1; status = lStatus; due = now + (st[step] * MIN_MS).roundToLong() }
                else -> {
                    interval = if (inRelearning) {
                        val base = max(1.0, interval).coerceIn(1.0, maxI)
                        gradFuzz(rating, base, base + 1)
                    } else {
                        if (algo == Algo.SM2 && rating == 4) ease += 0.15
                        gradFuzz(rating, graduate(3), graduate(4))
                    }
                    status = Status.REVIEW; step = 0; due = now + (interval * DAY_MS).roundToLong()
                }
            }
        } else if (rating == 1) {
            lapses += 1
            if (algo == Algo.SM2) { ease = max(1.3, ease - 0.2); interval = max(1.0, jsRound(interval * cfg.lapseFactor).toDouble()) }
            else interval = jsRound(Fsrs.intervalFor(s, cfg.desiredRetention)).toDouble().coerceIn(1.0, maxI)
            if (algo == Algo.FSRS) { status = Status.RELEARNING; step = 0; due = now + (FSRS_LAPSE_MIN * MIN_MS).roundToLong() }
            else if (cfg.relearningSteps.isNotEmpty()) { status = Status.RELEARNING; step = 0; due = now + (relearn[0] * MIN_MS).roundToLong() }
            else { status = Status.REVIEW; due = now + (interval * DAY_MS).roundToLong() }
        } else {
            val h: Double; val g: Double; val e: Double
            if (algo == Algo.FSRS) {
                val s0 = if (card.stability > 0) card.stability else max(0.5, card.interval)
                val d0 = if (card.difficulty > 0) card.difficulty else migratedD
                fun sd(gr: Int) = Fsrs.update(s0, d0, elapsed, gr).first
                h = Fsrs.intervalFor(sd(2), cfg.desiredRetention); g = Fsrs.intervalFor(sd(3), cfg.desiredRetention); e = Fsrs.intervalFor(sd(4), cfg.desiredRetention)
            } else {
                val ivl = max(1.0, interval)
                val late = max(0.0, (now - card.due) / DAY_MS.toDouble())
                h = max(ivl * cfg.hardFactor * cfg.intervalModifier, ivl + 1)
                g = (ivl + late / 2) * ease * cfg.intervalModifier
                e = (ivl + late) * ease * cfg.easyBonus * cfg.intervalModifier
            }
            val (hh, gg, ee) = orderAndFuzz(jsRound(h).toDouble(), jsRound(g).toDouble(), jsRound(e).toDouble(), seed, maxI)
            interval = when (rating) { 2 -> hh; 3 -> gg; else -> ee }
            if (algo == Algo.SM2) ease = when (rating) { 2 -> max(1.3, ease - 0.15); 4 -> ease + 0.15; else -> ease }
            status = Status.REVIEW; step = 0; due = now + (interval * DAY_MS).roundToLong()
        }
        val fs = algo == Algo.FSRS
        return Scheduled(status, step, r2(ease), interval, due, reps, lapses, if (fs) r4(s) else card.stability, if (fs) r4(d) else card.difficulty)
    }

    fun preview(card: Card, rating: Int, algo: String, cfg: SrsConfig, now: Long = System.currentTimeMillis()) =
        if (algo == Algo.FAST) "" else formatDuration(schedule(card, rating, algo, cfg, now).due - now)

    fun formatDuration(ms: Long): String {
        val m = (ms / MIN_MS.toDouble()).roundToInt()
        if (m < 60) return "${max(1, m)}m"
        val h = (m / 60.0).roundToInt()
        if (h < 24) return "${h}h"
        val d = (ms / DAY_MS.toDouble()).roundToInt()
        if (d < 60) return "${d}d" // days up to 2 months so Hard/Good/Easy never read the same
        val mo = (d / 3.0).roundToInt() / 10.0 // months, one decimal
        if (mo < 12) return (if (mo % 1.0 == 0.0) "${mo.toInt()}" else "$mo") + "mo"
        return "%.1fy".format(java.util.Locale.US, d / 365.0)
    }

    /**
     * Days since the last review, counted in CALENDAR days like FSRS does (a card reviewed at 21:00 and again
     * the next morning is 1 day, not 0.46 — otherwise the same-day formula would wrongly be used for a due review).
     * Cards with no review history in this app (imported / older data) are assumed to be reviewed on time.
     */
    fun elapsedDays(card: Card, now: Long): Double {
        card.lastReview?.let { return max(0.0, jsRound((startOfDay(now) - startOfDay(it)) / DAY_MS.toDouble()).toDouble()) }
        if (card.status == Status.REVIEW && card.interval > 0) return max(0.0, jsRound(card.interval + (startOfDay(now) - startOfDay(card.due)) / DAY_MS.toDouble()).toDouble())
        return 0.0
    }

    fun startOfDay(ts: Long): Long = Calendar.getInstance().apply {
        timeInMillis = ts; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    fun endOfToday(now: Long = System.currentTimeMillis()) = startOfDay(now) + DAY_MS - 1

    /** Counts toward "due today": any started card whose due time falls before the end of today. */
    fun isDue(c: Card, now: Long = System.currentTimeMillis()) = !c.frozen && c.status != Status.NEW && c.due <= endOfToday(now)
    fun isDueNow(c: Card, now: Long = System.currentTimeMillis()) = !c.frozen && c.status != Status.NEW && c.due <= now
    fun isMastered(c: Card) = c.status == Status.REVIEW && c.interval >= MASTERED_DAYS
    fun isHard(c: Card) = c.difficult || c.lapses >= 3 || (if (c.difficulty > 0) c.difficulty >= 8 else c.reps > 2 && c.ease < 2.0)
    fun recallProbability(c: Card, now: Long = System.currentTimeMillis()): Double? =
        if (c.stability <= 0 || c.lastReview == null) null else Fsrs.retrievability(max(0.0, (now - c.lastReview) / DAY_MS.toDouble()), c.stability)
}

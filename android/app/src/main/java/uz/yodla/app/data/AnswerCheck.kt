package uz.yodla.app.data

import java.text.Normalizer

/**
 * Type-answer checking (same rules as src/lib/answer.ts):
 * case, accents, punctuation and extra spaces are ignored; an answer like "olma, alma; apple"
 * accepts any one of its alternatives. A character diff shows what was right and what was missing.
 */
object AnswerCheck {
    data class Diff(val correct: Boolean, val typed: List<Pair<Char, Boolean>>, val expected: List<Pair<Char, Boolean>>, val target: String)

    private val punct = Regex("""[\p{P}\p{S}&&[^+#%$€£₽]]""")
    fun normalize(s: String): String = Normalizer.normalize(s.lowercase().replace('ё', 'е').replace('ʻ', '\'').replace('‘', '\'').replace('’', '\''), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "").replace(punct, " ").replace(Regex("\\s+"), " ").trim()

    fun alternatives(expected: String): List<String> =
        (listOf(expected) + expected.split(Regex("[,;/\\n]|\\s+or\\s+|\\s+yoki\\s+|\\s+или\\s+"))).map { it.trim() }.filter { it.isNotEmpty() }.distinct()

    fun check(typedRaw: String, expectedRaw: String): Diff {
        val typed = typedRaw.trim()
        val alts = alternatives(expectedRaw.trim())
        val nt = normalize(typed)
        val hit = alts.firstOrNull { normalize(it) == nt && nt.isNotEmpty() }
        // compare against the alternative that is closest to what was typed
        val target = hit ?: alts.maxByOrNull { lcs(typed.lowercase(), it.lowercase()).size * 2 - it.length } ?: expectedRaw.trim()
        val pairs = lcs(typed.lowercase(), target.lowercase())
        val tOk = BooleanArray(typed.length); val eOk = BooleanArray(target.length)
        pairs.forEach { (i, j) -> tOk[i] = true; eOk[j] = true }
        val ok = hit != null
        return Diff(ok, typed.mapIndexed { i, c -> c to (ok || tOk[i] || c.isWhitespace()) }, target.mapIndexed { j, c -> c to (ok || eOk[j] || c.isWhitespace()) }, target)
    }

    /** Matched index pairs of the longest common subsequence (inputs are short: a word or a sentence). */
    private fun lcs(a: String, b: String): List<Pair<Int, Int>> {
        if (a.isEmpty() || b.isEmpty()) return emptyList()
        val n = minOf(a.length, 300); val m = minOf(b.length, 300)
        val t = Array(n + 1) { IntArray(m + 1) }
        for (i in n - 1 downTo 0) for (j in m - 1 downTo 0) t[i][j] = if (a[i] == b[j]) t[i + 1][j + 1] + 1 else maxOf(t[i + 1][j], t[i][j + 1])
        val out = ArrayList<Pair<Int, Int>>(); var i = 0; var j = 0
        while (i < n && j < m) when {
            a[i] == b[j] -> { out += i to j; i++; j++ }
            t[i + 1][j] >= t[i][j + 1] -> i++
            else -> j++
        }
        return out
    }
}

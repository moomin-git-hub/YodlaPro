package uz.yodla.app

import org.junit.Assert.*
import org.junit.Test
import uz.yodla.app.data.AnswerCheck

class AnswerCheckTest {
    @Test fun lenientMatching() {
        assertTrue(AnswerCheck.check("Principle", "principle").correct)
        assertTrue(AnswerCheck.check("  axloq qoidalari ", "Axloq qoidalari.").correct)
        assertTrue(AnswerCheck.check("olma", "olma, apple").correct)          // one alternative is enough
        assertTrue(AnswerCheck.check("apple", "olma; apple").correct)
        assertTrue(AnswerCheck.check("cafe", "café").correct)                   // accents ignored
        assertTrue(AnswerCheck.check("ezhik", "ezhik").correct)
        assertTrue(AnswerCheck.check("ёлка", "елка").correct)
        assertTrue(AnswerCheck.check("o'zbek", "oʻzbek").correct)
        assertFalse(AnswerCheck.check("", "apple").correct)
        assertFalse(AnswerCheck.check("principal", "principle").correct)
    }

    @Test fun diffMarksMistakes() {
        val d = AnswerCheck.check("principal", "principle")
        assertEquals("principle", d.target)
        assertEquals("principal".length, d.typed.size)
        assertTrue(d.typed.take(6).all { it.second })                           // "princi" right
        assertFalse(d.typed[7].second)                                           // 'a' wrong
        assertTrue(d.expected.any { !it.second })                                // something was missed
        // the closest alternative is used for the diff
        assertEquals("apple", AnswerCheck.check("aple", "olma, apple").target)
    }
}

package uz.yodla.app

import org.junit.Assert.assertEquals
import org.junit.Test
import uz.yodla.app.data.cleanRich
import uz.yodla.app.data.htmlToPlain
import uz.yodla.app.ui.components.quote

class CleanRichTest {
    @Test fun editorSpacesAndTrailingBreaksAreRemoved() {
        assertEquals("olma", cleanRich("olma&nbsp;"))
        assertEquals("zone nazar", cleanRich("zone nazar&nbsp;<br>"))
        assertEquals("a < b", cleanRich("a &lt; b"))
        assertEquals("<b>bold</b> x", cleanRich("<b>bold</b> x<div><br></div>"))
        assertEquals("&lt;b&gt;", cleanRich("&lt;b&gt;")) // typed "<b>" literally stays text
        assertEquals("olma", htmlToPlain("olma&nbsp;")) // old saved values display cleanly
    }

    @Test fun cardTextCannotCloseTheInlineScript() {
        val q = quote("</script><script>alert(1)</script>")
        assertEquals(false, q.contains("</script>"))
    }
}

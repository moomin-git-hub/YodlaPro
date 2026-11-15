package uz.yodla.app

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performTextInput
import androidx.navigation.compose.rememberNavController
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.screens.*
import uz.yodla.app.ui.theme.YodlaTheme

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = TestApp::class, sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()
    private lateinit var deckId: String
    private lateinit var occDeck: String
    private var occNote: List<Card> = emptyList()

    @Before fun seed() { runBlocking {
        val repo = Graph.repo
        repo.prefs.updateSession { it.copy(introSeen = true, user = AuthUser("u1", "normomin@example.com", "Normo'min", 0, "cloud"), token = "t", serverUrl = "https://yodla.onrender.com") }
        repo.prefs.updateSettings { it.copy(onboarded = true, dailyGoal = 30) }
        repo.saveFolder(Folder("f1", "IELTS", "blue", "🎓", now(), now()))
        val d1 = repo.saveDeck(repo.newDeck("IELTS Academic Vocabulary").copy(cover = "🎓", color = "blue", category = "exam", folderId = "f1", description = "High-frequency academic words."))
        val d2 = repo.saveDeck(repo.newDeck("Hotel front office").copy(cover = "🏨", color = "pink", category = "business"))
        val d3 = repo.saveDeck(repo.newDeck("Physics formulas").copy(cover = "🔬", color = "green", category = "science", preset = Presets.EXAM))
        deckId = d1.id; occDeck = d3.id
        val s1 = repo.saveDeck(repo.newDeck("Words that Matter · Part I").copy(cover = "📘", color = "violet", parentId = d1.id, folderId = "f1"))
        repo.saveDeck(repo.newDeck("MY WORD exploration").copy(cover = "🧠", color = "orange", parentId = s1.id, folderId = "f1"))
        repo.addCards(s1.id, listOf(DraftCard("<b>chaos</b>", "<ul><li>tartibsizlik</li><li><i>disorder</i></li></ul>"), DraftCard("integrity", "halollik")))
        repo.saveFolder(Folder("f2", "Maths", "green", "📁", now() + 1, now()))
        val words = listOf("analyse" to "to examine in detail", "significant" to "important enough to be noticed", "mitigate" to "to make less harmful",
            "plummet" to "to fall suddenly", "advocate" to "to publicly support", "derive" to "to get from a source", "evident" to "clear and obvious", "fluctuate" to "to change frequently")
        repo.addCards(d1.id, words.map { DraftCard(it.first, it.second, "Prices tend to ${it.first} in winter.", "Common in IELTS Writing Task 1.") })
        repo.addCards(d1.id, listOf(DraftCard("Pollution has serious {{c1::consequences}} for {{c2::health}}.", "", type = CardType.CLOZE)))
        repo.addCards(d2.id, listOf(DraftCard("ADR", "Average daily rate"), DraftCard("RevPAR", "ADR × occupancy"), DraftCard("No-show", "Guest who doesn't arrive")))
        repo.addCards(d3.id, listOf(DraftCard("Kinetic energy", "\$E_k = \\frac{1}{2}mv^2\$"), DraftCard("Closure in Kotlin?", "```kotlin\nfun counter(): () -> Int {\n    var n = 0\n    return { ++n }\n}\n```")))
        // history: reviews over the past 3 weeks
        val cards = repo.dao.cardsOf(d1.id)
        val day = DAY_MS
        for (back in 20 downTo 0) {
            if (back % 4 == 3) continue
            val n = 3 + (back * 7) % 11
            repeat(n) { i ->
                val c = cards[i % cards.size]
                val ts = now() - back * day - i * 60_000L
                repo.dao.upsertReviews(listOf(ReviewLog(uid(), c.id, d1.id, if (i % 5 == 0) 1 else if (i % 7 == 0) 4 else 3, ts, 6_000, if (back > 15) Status.NEW else Status.REVIEW, 1.0, 3.0)))
            }
        }
        repo.updateCards(cards.take(5).map { it.id }) { it.copy(status = Status.REVIEW, interval = if (it.front == "analyse") 30.0 else 3.0, due = now() - 1000, reps = 4, lastReview = now() - day) }
        repo.updateCards(cards.drop(5).take(2).map { it.id }) { it.copy(status = Status.REVIEW, interval = 25.0, due = now() + 3 * day, reps = 6) }
        repo.updateCard(cards[1].id) { it.copy(difficult = true, bookmarked = true) }
        // image-occlusion note with a generated "diagram"
        val f = java.io.File(Graph.repo.ctx.filesDir, "images").apply { mkdirs() }.resolve("heart.png")
        val bmp = android.graphics.Bitmap.createBitmap(800, 560, android.graphics.Bitmap.Config.ARGB_8888)
        android.graphics.Canvas(bmp).apply {
            drawColor(0xFFFFF7F0.toInt())
            val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
            p.color = 0xFFE11D48.toInt(); drawCircle(330f, 290f, 150f, p); drawCircle(470f, 290f, 150f, p)
            p.color = 0xFF1E293B.toInt(); p.textSize = 34f
            drawText("Left atrium", 40f, 90f, p); drawText("Right atrium", 560f, 90f, p); drawText("Ventricle", 330f, 520f, p)
        }
        f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        val occ = Occlusion(listOf(Mask("m1", 0.04f, 0.1f, 0.26f, 0.08f), Mask("m2", 0.69f, 0.1f, 0.29f, 0.08f), Mask("m3", 0.4f, 0.87f, 0.22f, 0.08f)))
        occNote = repo.saveNote(repo.blankCard(d3.id).copy(type = CardType.OCCLUSION, front = "Parts of the heart", image = android.net.Uri.fromFile(f).toString(), extra = Json0.encodeToString(Occlusion.serializer(), occ)))
        repo.data.first { it.cards.size >= 14 }
    } }

    private fun shot(name: String, dark: Boolean = false, content: @Composable () -> Unit) {
        rule.setContent {
            YodlaTheme(if (dark) "dark" else "light") {
                CompositionLocalProvider(LocalConfirm provides ConfirmState()) {
                    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { content() }
                }
            }
        }
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("../screenshots/$name.png")
    }

    @Test fun home() = shot("01_home") { HomeScreen(rememberNavController()) }
    @Test fun homeDark() = shot("02_home_dark", dark = true) { HomeScreen(rememberNavController()) }
    @Test fun decks() = shot("03_decks") { DecksScreen(rememberNavController()) }
    @Test fun deck() = shot("04_deck") { DeckScreen(rememberNavController(), deckId) }
    @Test fun studyFront() = shot("05_study_front") { StudyScreen(rememberNavController(), deckId, false) }
    @Test fun studyBack() {
        shot("06_study_back_tmp") { StudyScreen(rememberNavController(), deckId, false) }
        rule.onNodeWithText(rule.activity.getString(R.string.tapToShow)).performClick()
        rule.mainClock.advanceTimeBy(800)
        rule.onRoot().captureRoboImage("../screenshots/06_study_back.png")
    }
    @Test fun studyTyped() {
        shot("06b_study_type_tmp") { StudyScreen(rememberNavController(), deckId, false) }
        rule.onNodeWithContentDescription(rule.activity.getString(R.string.typeAnswer)).performClick()
        rule.mainClock.advanceTimeBy(300)
        rule.onRoot().captureRoboImage("../screenshots/06b_study_typing.png")
        rule.onNode(hasSetTextAction()).performTextInput("wrnog")
        rule.onNodeWithContentDescription(rule.activity.getString(R.string.checkAnswer)).performClick()
        rule.mainClock.advanceTimeBy(800)
        rule.onRoot().captureRoboImage("../screenshots/06c_study_typed_result.png")
    }
    @Test fun clozeEditor() = shot("07_cloze_editor") { CardEditScreen(rememberNavController(), "new", deckId, CardType.CLOZE) }
    @Test fun occlusionEditor() = shot("08_occlusion_editor") { CardEditScreen(rememberNavController(), "new", occDeck, CardType.OCCLUSION) }
    @Test fun stats() = shot("09_stats") { StatsScreen(rememberNavController()) }
    @Test fun activity() = shot("09b_activity") { ActivityScreen(rememberNavController()) }
    @Test fun explore() = shot("10_explore") { ExploreScreen(rememberNavController()) }
    @Test fun create() = shot("11_create") { CreateScreen(rememberNavController()) }
    @Test fun ai() = shot("12_ai") { AiScreen(rememberNavController(), deckId) }
    @Test fun profile() = shot("13_profile", dark = true) { ProfileScreen(rememberNavController()) }
    @Test fun presets() = shot("14_presets") { PresetsScreen(rememberNavController()) }
    @Test fun auth() = shot("15_auth") { AuthScreen() }
    @Test fun deckEdit() = shot("16_deck_edit") { DeckEditScreen(rememberNavController(), occDeck, null) }
    @Test fun occlusionEdit() = shot("18_occlusion_edit") { CardEditScreen(rememberNavController(), occNote[1].id, null, null) }
    @Test fun occlusionStudy() {
        shot("19_occlusion_study_tmp") { StudyScreen(rememberNavController(), occDeck, true) }
        rule.waitUntil(3000) { true }
        rule.onRoot().captureRoboImage("../screenshots/19_occlusion_study.png")
    }
    @Config(qualifiers = "+uz") @Test fun uzbek() = shot("20_deck_uz") { DeckScreen(rememberNavController(), deckId) }
    @Config(qualifiers = "+ru") @Test fun russian() = shot("21_stats_ru", dark = true) { StatsScreen(rememberNavController()) }
    @Test fun folder() = shot("22_folder") { FolderScreen(rememberNavController(), "f1") }
    @Test fun onboarding() = shot("17_onboarding") { OnboardingScreen() }
}

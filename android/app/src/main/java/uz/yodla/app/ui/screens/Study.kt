package uz.yodla.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.spring
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import kotlin.math.abs
import kotlin.math.roundToInt

private data class Snap(val prev: Card?, val queue: StudyQueue, val current: QItem?, val reviewed: Int, val correct: Int, val done: Int)

@Composable
fun StudyScreen(nav: NavHostController, target: String, practiceAll: Boolean) {
    val d = appData()
    val repo = Graph.repo
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    var queue by remember { mutableStateOf(repo.buildQueue(target, practiceAll)) }
    var current by remember { mutableStateOf<QItem?>(null) }
    var waitUntil by remember { mutableStateOf<Long?>(null) }
    var finished by remember { mutableStateOf(false) }
    var doneCount by remember { mutableIntStateOf(0) }
    var flipped by remember { mutableStateOf(false) }
    var reviewed by remember { mutableIntStateOf(0) }
    var correct by remember { mutableIntStateOf(0) }
    val history = remember { mutableStateListOf<Snap>() }
    var started by remember { mutableLongStateOf(now()) }
    var shownAt by remember { mutableLongStateOf(now()) }
    var saved by remember { mutableStateOf(false) }
    var empty by remember { mutableStateOf(queue.isEmpty) }
    var menu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    // the streak celebration is shown once, at the end of the first session of the day
    var streakSeen by remember { mutableStateOf(d.reviews.any { it.ts >= Srs.startOfDay(now()) }) }
    val answered = remember { mutableStateListOf<String>() } // card ids answered this session (for done/total)
    val lastRating = remember { mutableStateMapOf<String, Int>() } // previous answer, shown as a badge when the card comes back
    var typing by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf("") }
    var typedDiff by remember { mutableStateOf<AnswerCheck.Diff?>(null) }
    val focus = remember { FocusRequester() }

    /** Move to the next card that is really due (learning cards wait for their step time). */
    fun advance(q: StudyQueue, force: Boolean = false) {
        when (val n = q.next(now(), force)) {
            is Next.Show -> { current = n.item; queue = n.queue; waitUntil = null; finished = false }
            is Next.Wait -> { current = null; queue = q; waitUntil = n.until; finished = false }
            Next.Done -> { current = null; queue = q; waitUntil = null; finished = true }
        }
        flipped = false; shownAt = now(); typed = ""; typedDiff = null
    }
    LaunchedEffect(Unit) { if (current == null && !finished && waitUntil == null) advance(queue) }

    val item = current
    val card = item?.let { i -> d.cards.firstOrNull { it.id == i.id } }
    val deck = d.deck(target) ?: card?.let { d.deck(it.deckId) }
    val title = when {
        target == "all" -> stringResource(R.string.study); target == "difficult" -> stringResource(R.string.difficultCards); target == "bookmarks" -> stringResource(R.string.bookmarks)
        target.startsWith("folder:") -> d.folders.firstOrNull { it.id == target.removePrefix("folder:") }?.name.orEmpty()
        else -> d.deck(target)?.title.orEmpty()
    }
    val style = deck?.cardStyle() ?: CardStyle()
    val left = queue.size + (if (current != null) 1 else 0)
    // Noji-style counter: cards finished for this session / all cards in it (a learning card is finished when it graduates)
    val inSession = remember(queue, current) { (queue.main.map { it.id } + queue.learn.map { it.id } + listOfNotNull(current?.id)).toSet() }
    // Noji counter: every answered card counts (Again/Hard too); cards coming back do not add to the total
    val doneSet = answered.toSet()
    val doneCards = doneSet.size
    val totalCards = doneCards + inSession.count { it !in doneSet }
    fun reveal() {
        if (flipped) return
        val c = card ?: return
        if (typing || typed.isNotBlank()) typedDiff = AnswerCheck.check(typed, c.typedTarget())
        typing = false; flipped = true
    }

    fun finish() {
        if (saved || reviewed == 0) return
        saved = true
        val end = now()
        scope.launch { repo.addSession(StudySession(uid(), d.deck(target)?.id, started, end, end - started, reviewed, correct)) }
    }
    fun exit() { finish(); Graph.speaker.stop(); nav.popBackStack() }
    BackHandler { exit() }

    LaunchedEffect(card?.id, flipped) {
        if (card != null && d.settings.tts && d.settings.ttsAutoplay && (card.type == CardType.BASIC || card.type == CardType.REVERSE)) {
            val rev = card.type == CardType.REVERSE
            val text = if (flipped == rev) card.front else card.back
            Graph.speaker.speak(text, if (flipped == rev) deck?.ttsFront.orEmpty() else deck?.ttsBack.orEmpty())
        }
    }
    LaunchedEffect(finished) { if (finished && reviewed > 0) finish() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(item, card == null) { if (item != null && card == null) advance(queue) } // card deleted meanwhile
    // waiting for a learning card: tick and continue automatically when its time comes
    LaunchedEffect(waitUntil) {
        val until = waitUntil ?: return@LaunchedEffect
        while (now() < until) kotlinx.coroutines.delay(1000)
        advance(queue)
    }

    fun rate(r: Int) {
        val c = card ?: return; val it = item ?: return
        if (!flipped || busy) return
        busy = true // ignore double taps / swipe+tap while this answer is saved
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        history += Snap(if (it.mode == QItem.MODE_PRACTICE) null else c, queue, it, reviewed, correct, doneCount)
        if (history.size > 50) history.removeAt(0)
        scope.launch { try {
            var q = queue
            when (it.mode) {
                QItem.MODE_PRACTICE -> if (r == 1) q = q.requeue(it)
                QItem.MODE_FAST -> { repo.review(c.id, r, now() - shownAt); if (r == 1) q = q.requeue(it) }
                else -> { repo.review(c.id, r, now() - shownAt); repo.dao.card(c.id)?.let { u -> q = q.afterAnswer(u, Srs.endOfToday(), now()) } }
            }
            reviewed++; if (r >= 3) correct++; doneCount++
            answered += c.id; lastRating[c.id] = r
            advance(q)
        } finally { busy = false } }
    }
    fun undo() {
        if (busy) return
        val last = history.removeLastOrNull() ?: return
        scope.launch {
            last.prev?.let { repo.undoReview(it) }
            answered.removeLastOrNull()?.let { id -> if (id !in answered) lastRating.remove(id) }
            queue = last.queue; current = last.current; waitUntil = null; finished = false
            reviewed = last.reviewed; correct = last.correct; doneCount = last.done; saved = false; flipped = false; shownAt = now()
        }
    }

    val keys = Modifier.focusRequester(focus).focusable().onPreviewKeyEvent { e ->
        if (e.type != KeyEventType.KeyDown || typing) return@onPreviewKeyEvent false // typing an answer: keys go to the text field
        when (e.key) {
            Key.Spacebar, Key.Enter -> { if (!flipped) reveal() else if (d.settings.flipCards) flipped = false; true }
            Key.One, Key.NumPad1 -> { rate(1); true }; Key.Two, Key.NumPad2 -> { rate(2); true }
            Key.Three, Key.NumPad3 -> { rate(3); true }; Key.Four, Key.NumPad4 -> { rate(4); true }
            Key.Z -> { undo(); true }
            Key.Escape -> { exit(); true }
            Key.B -> { card?.let { c -> scope.launch { repo.updateCard(c.id) { it.copy(bookmarked = !it.bookmarked) } } }; true }
            Key.D -> { card?.let { c -> scope.launch { repo.updateCard(c.id) { it.copy(difficult = !it.difficult) } } }; true }
            Key.S -> { card?.let { Graph.speaker.speak(if (flipped) it.back else it.front) }; true }
            else -> false
        }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding().then(keys)) {
        when {
            empty -> {
                val more = remember(d.cards.size, d.reviews.size) { repo.moreNew(target, emptySet()) }
                CaughtUp(onBack = { exit() }, onPractice = {
                    val q = repo.buildQueue(target, true)
                    if (!q.isEmpty) { empty = false; advance(q) }
                }, canPractice = !repo.buildQueue(target, true).isEmpty, moreCount = more.size, onMore = { empty = false; advance(StudyQueue(more)) })
            }
            finished && !streakSeen -> StreakScreen(d.reviews) { streakSeen = true }
            finished -> Summary(title, reviewed, correct, now() - started, history.isNotEmpty(), ::undo, onMore = {
                saved = false; started = now(); reviewed = 0; correct = 0; doneCount = 0; history.clear(); answered.clear(); lastRating.clear()
                val q = repo.buildQueue(target, false).let { if (it.isEmpty) StudyQueue(repo.moreNew(target, emptySet())) else it }.let { if (it.isEmpty) repo.buildQueue(target, true) else it }
                advance(q)
            }, onDone = { exit() })
            waitUntil != null -> {
                val more = remember(queue, d.cards.size) { repo.moreNew(target, (queue.main.map { it.id } + queue.learn.map { it.id }).toSet()) }
                WaitingScreen(waitUntil!!, queue.learn.size, moreCount = more.size, onMore = { advance(queue.withNew(more)) },
                    onNow = { advance(queue, force = true) }, onFinish = { finished = true }, onExit = ::exit)
            }
            card != null && item != null -> Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(::exit) { Icon(Icons.Rounded.Close, stringResource(R.string.exitStudy)) }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("$doneCards/$totalCards", Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 14.dp, vertical = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.ExtraBold)
                        Spacer(Modifier.height(6.dp))
                        YProgress((doneCards * 100f / maxOf(1, totalCards)).roundToInt())
                        Text(title, Modifier.fillMaxWidth().padding(top = 4.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                    IconButton({ menu = true }) { Icon(Icons.Rounded.MoreVert, null) }
                }
                if (item.mode == QItem.MODE_PRACTICE) Text(stringResource(R.string.practiceMode), Modifier.fillMaxWidth(), textAlign = TextAlign.Center, color = Amber, style = MaterialTheme.typography.labelMedium)
                if (item.mode == QItem.MODE_FAST) Text(stringResource(R.string.algoFast), Modifier.fillMaxWidth(), textAlign = TextAlign.Center, color = Sky, style = MaterialTheme.typography.labelMedium)
                FlipCard(card, deck, flipped, style, lastRating[card.id], Modifier.weight(1f).padding(vertical = 12.dp),
                    onFlip = { if (!flipped) reveal() else if (d.settings.flipCards) flipped = false },
                    onSwipe = { r -> if (flipped) rate(r) else reveal() }, nav = nav, finish = ::finish)
                val canType = remember(card.id) { card.typedTarget().isNotBlank() }
                if (!flipped) {
                    if (typing) {
                        val kb = LocalSoftwareKeyboardController.current
                        val fr = remember { FocusRequester() }
                        LaunchedEffect(card.id) { fr.requestFocus() }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(typed, { typed = it }, Modifier.weight(1f).focusRequester(fr), placeholder = { Text(stringResource(R.string.typeAnswer)) }, singleLine = true,
                                shape = RoundedCornerShape(18.dp), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { kb?.hide(); reveal() }))
                            FilledIconButton({ kb?.hide(); reveal() }, Modifier.size(56.dp)) { Icon(Icons.Rounded.Check, stringResource(R.string.checkAnswer)) }
                        }
                    } else Row(verticalAlignment = Alignment.CenterVertically) {
                        if (canType) FilledTonalIconButton({ typing = true }, Modifier.size(56.dp)) { Icon(Icons.Rounded.Keyboard, stringResource(R.string.typeAnswer)) }
                        else Spacer(Modifier.size(56.dp))
                        TextButton(::reveal, Modifier.weight(1f).height(60.dp)) { Text(stringResource(R.string.tapToShow), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface) }
                        FilledTonalIconButton(::undo, Modifier.size(56.dp), enabled = history.isNotEmpty()) { Icon(Icons.Rounded.Undo, stringResource(R.string.undo)) }
                    }
                } else {
                    typedDiff?.let { TypedResult(it) }
                    Text(stringResource(R.string.howWell), Modifier.fillMaxWidth().padding(bottom = 6.dp), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val cardDeck = d.deck(card.deckId)
                    val cfg = remember(card.deckId, d.settings) { repo.presetFor(cardDeck) }
                    val algo = if (item.mode == QItem.MODE_SRS) repo.algoFor(cardDeck) else Algo.FAST
                    val t0 = remember(card.id, card.updatedAt) { now() }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(1 to Rose, 2 to Amber, 3 to Emerald, 4 to Sky).forEach { (r, col) ->
                            val lbl = Srs.preview(card, r, algo, cfg, t0).ifBlank { null }
                            Button({ rate(r) }, Modifier.weight(1f).height(62.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(col), contentPadding = PaddingValues(4.dp)) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(stringResource(ratingInfo(r).first), fontWeight = FontWeight.ExtraBold, maxLines = 1)
                                    if (lbl != null) Text(lbl, fontSize = 11.sp, color = Color.White.copy(alpha = 0.85f))
                                }
                            }
                        }
                    }
                }
                if (menu) CardActionsSheet(card, nav, onDismiss = { menu = false }, onChanged = { gone -> if (gone) advance(queue) }, inStudy = true)
            }
        }
    }
}

/** Only learning cards are left and none is due yet — show when the next one comes back. */
@Composable
private fun WaitingScreen(until: Long, count: Int, moreCount: Int, onMore: () -> Unit, onNow: () -> Unit, onFinish: () -> Unit, onExit: () -> Unit) {
    var nowMs by remember { mutableLongStateOf(now()) }
    LaunchedEffect(until) { while (true) { nowMs = now(); kotlinx.coroutines.delay(1000) } }
    val sec = ((until - nowMs) / 1000).coerceAtLeast(0)
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Row(Modifier.fillMaxWidth()) { IconButton(onExit) { Icon(Icons.Rounded.Close, stringResource(R.string.exitStudy)) } }
        Spacer(Modifier.weight(1f))
        Ring(1f - (sec / 600f).coerceIn(0f, 1f), 150.dp, 12.dp) { Text("%d:%02d".format(sec / 60, sec % 60), style = MaterialTheme.typography.headlineMedium) }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.waitTitle), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Text(stringResource(R.string.waitSub, count), style = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.weight(1f))
        if (moreCount > 0) {
            PrimaryButton(stringResource(R.string.learnMoreNew, moreCount), onMore, Modifier.fillMaxWidth().height(56.dp))
            Spacer(Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton(stringResource(R.string.finishSession), onFinish, Modifier.weight(1f))
            if (moreCount > 0) SecondaryButton(stringResource(R.string.studyNow), onNow, Modifier.weight(1f))
            else PrimaryButton(stringResource(R.string.studyNow), onNow, Modifier.weight(1f))
        }
    }
}

@Composable
private fun FlipCard(card: Card, deck: Deck?, flipped: Boolean, style: CardStyle, prevRating: Int?, modifier: Modifier, onFlip: () -> Unit, onSwipe: (Int) -> Unit, nav: NavHostController, finish: () -> Unit) {
    val flipMode = appData().settings.flipCards
    val rot by animateFloatAsState(if (flipped && flipMode) 180f else 0f, tween(420), label = "flip")
    val drag = remember(card.id) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val repo = Graph.repo
    val d = appData()
    val settings = d.settings
    val clozeIdx = if (card.type == CardType.CLOZE) card.cloze().c else 1
    val occ = if (card.type == CardType.OCCLUSION) card.occlusion() else Occlusion()
    Box(
        modifier.fillMaxWidth()
            .pointerInput(card.id, flipped) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val v = drag.value
                        scope.launch {
                            when {
                                v > 220f -> { onSwipe(3) }
                                v < -220f -> { onSwipe(1) }
                            }
                            drag.animateTo(0f)
                        }
                    },
                    onHorizontalDrag = { _, dx -> scope.launch { drag.snapTo(drag.value + dx) } },
                )
            }
            .graphicsLayer { translationX = drag.value; rotationZ = drag.value / 40f; rotationY = rot; cameraDistance = 14 * density },
    ) {
        val showBack = if (flipMode) rot > 90f else flipped
        Column(
            Modifier.fillMaxSize().graphicsLayer { if (flipMode && showBack) rotationY = 180f }.clip(RoundedCornerShape(32.dp)).background(cardBg(style))
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(32.dp)).clickable(onClick = onFlip).padding(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (prevRating == 1 || prevRating == 2) {
                    // the card is back after Again / Hard: show that answer like Noji (red ✕ / orange ~)
                    val col = if (prevRating == 1) Rose else Amber
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(col.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                        if (prevRating == 1) Icon(Icons.Rounded.Close, stringResource(R.string.again), tint = col, modifier = Modifier.size(26.dp))
                        else Text("~", color = col, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineSmall)
                    }
                } else {
                    val (lbl, col) = when (card.status) { Status.NEW -> R.string.newCards to Sky; Status.REVIEW -> R.string.review to Emerald; else -> R.string.learning to Amber }
                    Text(stringResource(lbl).uppercase(), Modifier.clip(CircleShape).background(col.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp), color = col, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.weight(1f))
                if (settings.tts) SmallIcon(Icons.Rounded.VolumeUp, stringResource(R.string.listen)) {
                    val rev = card.type == CardType.REVERSE
                    val text = when (card.type) { CardType.CLOZE -> if (showBack) Cloze.plain(card.front) else Cloze.front(card.front, clozeIdx); else -> if (showBack != rev) card.back.ifBlank { card.front } else card.front }
                    Graph.speaker.speak(text, if (showBack != rev) deck?.ttsBack.orEmpty() else deck?.ttsFront.orEmpty())
                }
                SmallIcon(Icons.Rounded.Edit, stringResource(R.string.edit)) { finish(); nav.navigate("card/${card.id}") }
                SmallIcon(if (card.bookmarked) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder, stringResource(R.string.bookmark), if (card.bookmarked) Amber else null) { scope.launch { repo.updateCard(card.id) { it.copy(bookmarked = !it.bookmarked) } } }
                SmallIcon(Icons.Rounded.Warning, stringResource(R.string.markDifficult), if (card.difficult) Rose else null) { scope.launch { repo.updateCard(card.id) { it.copy(difficult = !it.difficult) } } }
            }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).animateContentSize(tween(260)).padding(vertical = 12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.weight(1f, fill = false))
                if (card.type == CardType.REVERSE) CardFace(CardType.BASIC, card.back, card.front, card.example, card.explanation, card.image, occ, clozeIdx, showBack, style)
                else CardFace(card.type, card.front, card.back, card.example, card.explanation, card.image, occ, clozeIdx, showBack, style)
            }
            if (showBack) Text(stringResource(R.string.swipeHint), Modifier.fillMaxWidth(), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (abs(drag.value) > 60f) {
            val good = drag.value > 0
            val back = flipMode && rot > 90f
            Text(stringResource(if (good) R.string.good else R.string.again), Modifier.align(if (good != back) Alignment.TopStart else Alignment.TopEnd).graphicsLayer { if (back) rotationY = 180f }.padding(24.dp).clip(RoundedCornerShape(12.dp))
                .background(if (good) Emerald else Rose).padding(horizontal = 14.dp, vertical = 6.dp), color = Color.White, fontWeight = FontWeight.ExtraBold)
        }
    }
}

/** Type-answer result: what was typed (wrong letters red) and the answer (missed letters highlighted). */
@Composable
private fun TypedResult(diff: AnswerCheck.Diff) {
    val ok = diff.correct
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(18.dp)).background((if (ok) Emerald else Rose).copy(alpha = 0.12f)).padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(stringResource(if (ok) R.string.answerCorrect else R.string.answerWrong), color = if (ok) Emerald else Rose, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.labelLarge)
        if (diff.typed.isNotEmpty()) Text(buildAnnotatedString {
            diff.typed.forEach { (c, good) -> withStyle(if (good) SpanStyle(color = Emerald) else SpanStyle(color = Rose, textDecoration = TextDecoration.LineThrough)) { append(c) } }
        }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (!ok) Text(buildAnnotatedString {
            append("→ ")
            diff.expected.forEach { (c, got) -> withStyle(if (got) SpanStyle() else SpanStyle(color = Amber, textDecoration = TextDecoration.Underline, fontWeight = FontWeight.ExtraBold)) { append(c) } }
        }, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun SmallIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color? = null, onClick: () -> Unit) {
    IconButton(onClick, Modifier.size(38.dp)) { Icon(icon, label, tint = tint ?: MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp)) }
}

@Composable
private fun CaughtUp(onBack: () -> Unit, onPractice: () -> Unit, canPractice: Boolean, moreCount: Int, onMore: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("🎉", fontSize = 56.sp)
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.allCaughtUp), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.allCaughtUpSub), style = Muted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))
        if (moreCount > 0) {
            PrimaryButton(stringResource(R.string.learnMoreNew, moreCount), onMore, Modifier.fillMaxWidth().height(56.dp))
            Spacer(Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton(stringResource(R.string.backToDeck), onBack, Modifier.weight(1f))
            if (moreCount > 0) SecondaryButton(stringResource(R.string.practice), onPractice, Modifier.weight(1f), enabled = canPractice)
            else PrimaryButton(stringResource(R.string.practice), onPractice, Modifier.weight(1f), enabled = canPractice)
        }
    }
}

@Composable
private fun Summary(title: String, reviewed: Int, correct: Int, ms: Long, canUndo: Boolean, undo: () -> Unit, onMore: () -> Unit, onDone: () -> Unit) {
    val todayCount = appData().reviews.let { l -> val t = Srs.startOfDay(now()); l.filter { it.ts >= t }.map { it.cardId }.toSet().size }
    val acc = if (reviewed == 0) 0 else (correct * 100f / reviewed).roundToInt()
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Ring(acc / 100f, 150.dp, 14.dp) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Rounded.EmojiEvents, null, tint = Amber, modifier = Modifier.size(30.dp)); Text("$acc%", style = MaterialTheme.typography.headlineMedium) }
        }
        Spacer(Modifier.height(18.dp))
        Text(stringResource(R.string.reviewedToday, todayCount), style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
        Text(title, style = Muted)
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(Icons.Rounded.TaskAlt, Brand, stringResource(R.string.reviewed), "$reviewed", Modifier.weight(1f))
            StatTile(Icons.Rounded.EmojiEvents, Emerald, stringResource(R.string.accuracy), "$acc%", Modifier.weight(1f))
            StatTile(Icons.Rounded.Schedule, Sky, stringResource(R.string.time), fmtTime(ms), Modifier.weight(1f))
        }
        Spacer(Modifier.height(28.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (canUndo) FilledTonalIconButton(undo, Modifier.size(52.dp)) { Icon(Icons.Rounded.Undo, stringResource(R.string.undo)) }
            SecondaryButton(stringResource(R.string.studyMore), onMore, Modifier.weight(1f))
            PrimaryButton(stringResource(R.string.backToDeck), onDone, Modifier.weight(1f))
        }
    }
}

/** Noji-style streak celebration: flame, day count and this week's studied days. */
@Composable
private fun StreakScreen(reviews: List<ReviewLog>, onContinue: () -> Unit) {
    val streak = remember(reviews.size) { Stats.streaks(reviews).first }
    val studied = remember(reviews.size) { reviews.map { Srs.startOfDay(it.ts) }.toSet() }
    val today = Srs.startOfDay(now())
    val cal = java.util.Calendar.getInstance().apply { timeInMillis = today; set(java.util.Calendar.DAY_OF_WEEK, firstDayOfWeek) }
    val week = (0 until 7).map { i -> Srs.startOfDay(cal.timeInMillis + i * DAY_MS + DAY_MS / 2) }
    val dayFmt = remember { java.text.SimpleDateFormat("EEE", java.util.Locale.getDefault()) }
    val pop = remember { Animatable(0.4f) }
    LaunchedEffect(Unit) { pop.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 300f)) }
    val scale = pop.value
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale }) {
            Icon(Icons.Rounded.LocalFireDepartment, null, tint = Amber, modifier = Modifier.size(84.dp))
            Text("$streak", style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.ExtraBold)
        }
        Text(stringResource(R.string.dayStreak), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(32.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            week.forEach { day ->
                val on = day in studied; val isToday = day == today
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(dayFmt.format(java.util.Date(day)), style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(10.dp))
                    Box(Modifier.size(40.dp).clip(CircleShape).background(if (on) Amber.copy(alpha = 0.35f) else Color.Transparent)
                        .border(if (isToday) 2.dp else 0.dp, if (isToday) Amber else Color.Transparent, CircleShape), contentAlignment = Alignment.Center) {
                        Text(java.text.SimpleDateFormat("d", java.util.Locale.getDefault()).format(java.util.Date(day)), fontWeight = if (on) FontWeight.ExtraBold else FontWeight.Normal)
                    }
                }
            }
        }
        Spacer(Modifier.weight(1.2f))
        PrimaryButton(stringResource(R.string.continueLabel), onContinue, Modifier.fillMaxWidth().height(60.dp))
    }
}

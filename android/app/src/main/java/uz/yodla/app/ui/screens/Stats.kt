package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.activity.compose.rememberLauncherForActivityResult
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

@Composable
fun StatsScreen(nav: NavHostController) {
    val d = appData()
    var range by remember { mutableStateOf(7) }
    val s = remember(d, range) {
        val counts = Stats.dayCounts(d.reviews)
        val days = Stats.lastDays(range)
        val rStart = days.first()
        val rRev = d.reviews.filter { it.ts >= rStart }
        val today = Srs.startOfDay(now())
        val dow = (Calendar.getInstance().get(Calendar.DAY_OF_WEEK) + 5) % 7
        val heat = Stats.lastDays(7 * 11 + dow + 1).map { it to (counts[it]?.reviews ?: 0) }
        object {
            val studied = d.cards.count { it.status != Status.NEW }; val mastered = d.cards.count(Srs::isMastered)
            val acc = if (d.reviews.isEmpty()) 0 else (d.reviews.count { it.rating >= 3 } * 100f / d.reviews.size).roundToInt()
            val streak = Stats.streaks(d.reviews); val days = days; val vals = days.map { counts[it]?.reviews ?: 0 }
            val rAcc = if (rRev.isEmpty()) 0 else (rRev.count { it.rating >= 3 } * 100f / rRev.size).roundToInt(); val rTotal = rRev.size
            val heat = heat; val maxHeat = (heat.maxOfOrNull { it.second } ?: 1).coerceAtLeast(1); val today = today
            val decks = d.decks.map { Triple(it, Stats.deck(d.cardsOf(it.id)), d.reviews.count { r -> r.deckId == it.id }) }.sortedByDescending { it.third }
            val fc = Stats.forecast(d.cards, 7); val time = Stats.totalMs(d)
            val ratings = (1..4).map { r -> d.reviews.count { it.rating == r } }
        }
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PageHeader(stringResource(R.string.stats), onBack = { nav.popBackStack() }) }
        if (d.reviews.isEmpty()) { item { EmptyState(Icons.Rounded.BarChart, stringResource(R.string.stats), stringResource(R.string.noStatsYet)) }; return@LazyColumn }
        if (Graph.repo.cloud) item { ReportsCard() }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(Icons.Rounded.MenuBook, Sky, stringResource(R.string.totalStudied), "${s.studied}", Modifier.weight(1f))
                StatTile(Icons.Rounded.School, Emerald, stringResource(R.string.mastered), "${s.mastered}", Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(Icons.Rounded.Repeat, Amber, stringResource(R.string.stillLearning), "${s.studied - s.mastered}", Modifier.weight(1f))
                StatTile(Icons.Rounded.TaskAlt, Brand, stringResource(R.string.totalReviews), "${d.reviews.size}", Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                YCard(Modifier.weight(1f)) { Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { Ring(s.acc / 100f, 72.dp, 8.dp) { Text("${s.acc}%", fontWeight = FontWeight.ExtraBold) }; Text(stringResource(R.string.accuracy), style = Muted) } }
                YCard(Modifier.weight(1f), onClick = { nav.go("activity") }) { Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.LocalFireDepartment, null, tint = Orange, modifier = Modifier.size(30.dp)); Text("${s.streak.first}", style = MaterialTheme.typography.headlineSmall)
                    Text("${stringResource(R.string.streak)} · 🏆 ${s.streak.second}", style = Muted)
                } }
                YCard(Modifier.weight(1f)) { Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.Schedule, null, tint = Brand, modifier = Modifier.size(30.dp)); Text(fmtTime(s.time), style = MaterialTheme.typography.titleSmall); Text(stringResource(R.string.totalTime), style = Muted)
                } }
            }
        }
        item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.dailyActivity), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Segmented(range, listOf(7 to stringResource(R.string.last7), 30 to stringResource(R.string.last30)), { range = it }, Modifier.width(170.dp))
                }
                Spacer(Modifier.height(12.dp))
                val fmt = SimpleDateFormat(if (range == 7) "EEE" else "d", Locale.getDefault())
                Bars(s.vals, s.days.mapIndexed { i, ts -> if (range == 30 && i % 5 != 4) "" else fmt.format(ts).take(3) }, 130.dp, format = { "$it" })
                Text("${s.rTotal} · ${stringResource(R.string.accuracy)} ${s.rAcc}%", Modifier.padding(top = 10.dp), style = Muted)
            }
        }
        item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                Text(stringResource(R.string.last12w), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                val weeks = ceil(s.heat.size / 7.0).toInt()
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    for (w in 0 until weeks) Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        for (dd in 0 until 7) {
                            val cell = s.heat.getOrNull(w * 7 + dd)
                            val lvl = if (cell == null || cell.second == 0) 0 else ceil(cell.second * 4.0 / s.maxHeat).toInt()
                            val col = when (lvl) { 0 -> MaterialTheme.colorScheme.onSurface.copy(alpha = if (cell == null) 0f else 0.06f); 1 -> BrandLight.copy(alpha = 0.45f); 2 -> BrandLight; 3 -> Color8F; else -> BrandDark }
                            Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(3.dp)).background(col))
                        }
                    }
                }
            }
        }
        item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                Text(stringResource(R.string.ratingsBreakdown), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                val tot = s.ratings.sum().coerceAtLeast(1)
                Row(Modifier.fillMaxWidth().height(12.dp).clip(CircleShape)) {
                    s.ratings.forEachIndexed { i, n -> if (n > 0) Box(Modifier.weight(n.toFloat()).fillMaxHeight().background(ratingInfo(i + 1).second)) }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    s.ratings.forEachIndexed { i, n -> val (l, c) = ratingInfo(i + 1); Text(buildAnnotatedString { withStyle(SpanStyle(color = c, fontWeight = FontWeight.Bold)) { append("● ") }; append("${stringResource(l)} ${(n * 100f / tot).roundToInt()}%") }, style = MaterialTheme.typography.labelSmall) }
                }
            }
        }
        item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                Text(stringResource(R.string.forecast), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                val fmt = SimpleDateFormat("EEE", Locale.getDefault())
                Bars(s.fc.toList(), s.fc.indices.map { if (it == 0) stringResource(R.string.today).take(5) else fmt.format(now() + it * DAY_MS).take(3) }, 100.dp, highlightLast = false)
            }
        }
        item { SectionTitle(stringResource(R.string.progressByDeck)) }
        items(s.decks, key = { it.first.id }) { (deck, st, n) ->
            YCard(Modifier.fillMaxWidth(), onClick = { nav.go("deck/${deck.id}") }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    DeckCover(deck.cover, deck.color, deck.image, 42.dp); Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) { Text(deck.title, style = MaterialTheme.typography.titleSmall, maxLines = 1); Text("${stringResource(R.string.reviewsCount, n)} · ${st.total} ${stringResource(R.string.cards)}", style = Muted) }
                    Text("${st.progress}%", fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))) {
                    if (st.mastered > 0) Box(Modifier.weight(st.mastered.toFloat()).fillMaxHeight().background(Emerald))
                    if (st.learning > 0) Box(Modifier.weight(st.learning.toFloat()).fillMaxHeight().background(Amber))
                    if (st.new > 0) Box(Modifier.weight(st.new.toFloat()).fillMaxHeight())
                }
                Text("${stringResource(R.string.mastered)} ${st.mastered} · ${stringResource(R.string.learning)} ${st.learning} · ${stringResource(R.string.newCards)} ${st.new}", Modifier.padding(top = 6.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
private val Color8F = androidx.compose.ui.graphics.Color(0xFF8F72FF)

@Composable
fun SearchScreen(nav: NavHostController) {
    val d = appData()
    var q by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val res = remember(q, d) {
        val s = q.trim().lowercase()
        if (s.isEmpty()) null else d.decks.filter { "${it.title} ${it.description}".lowercase().contains(s) }.take(10) to
            d.cards.filter { "${it.front} ${it.back} ${it.example} ${it.explanation}".lowercase().contains(s) }.take(100)
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.navBack)) }
                OutlinedTextField(q, { q = it }, Modifier.weight(1f).focusRequester(focus), placeholder = { Text(stringResource(R.string.searchAll)) }, leadingIcon = { Icon(Icons.Rounded.Search, null) },
                    trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Icons.Rounded.Close, null) } }, singleLine = true, shape = RoundedCornerShape(16.dp))
            }
        }
        when {
            res == null -> item { Text(stringResource(R.string.typeToSearch), Modifier.fillMaxWidth().padding(48.dp), style = Muted) }
            res.first.isEmpty() && res.second.isEmpty() -> item { Text(stringResource(R.string.noResults), Modifier.fillMaxWidth().padding(48.dp), style = Muted) }
            else -> {
                if (res.first.isNotEmpty()) { item { SectionTitle(stringResource(R.string.decks)) }; items(res.first, key = { "d" + it.id }) { DeckRow(it, Stats.deck(d.cardsOf(it.id))) { nav.go("deck/${it.id}") } } }
                if (res.second.isNotEmpty()) { item { SectionTitle("${res.second.size} ${stringResource(R.string.cards)}") }; items(res.second, key = { it.id }) { c -> CardRow(c, null, { nav.go("card/${c.id}") }, deckLabel = d.deck(c.deckId)?.let { "${it.cover} ${it.title}" }) } }
            }
        }
    }
}

/** Reports from the server: PDF overview, Excel with every card, Word hard-words notebook. */
@Composable
private fun ReportsCard() {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var pending by remember { mutableStateOf<ByteArray?>(null) }
    var mime by remember { mutableStateOf("application/pdf") }
    val save = rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val bytes = pending ?: return@rememberLauncherForActivityResult
        if (uri != null) {
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
        }
        pending = null
    }
    YCard(Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.reports), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(Triple("pdf", "PDF", Rose), Triple("xlsx", "Excel", Emerald), Triple("docx", "Word", Sky)).forEach { (fmt, label, col) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(col.copy(alpha = 0.10f))
                    .clickable(enabled = busy == null) {
                        busy = fmt
                        scope.launch {
                            runCatching { Graph.remote.report(fmt) }
                                .onSuccess { (bytes, name) ->
                                    pending = bytes
                                    mime = mapOf("pdf" to "application/pdf", "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document")[fmt]!!
                                    save.launch(name)
                                }
                                .onFailure { android.widget.Toast.makeText(ctx, errMessage(ctx, it), android.widget.Toast.LENGTH_LONG).show() }
                            busy = null
                        }
                    }.padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (busy == fmt) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = col)
                    else Icon(Icons.Rounded.Description, null, tint = col)
                    Spacer(Modifier.height(6.dp))
                    Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

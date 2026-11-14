package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

@Composable
fun HomeScreen(nav: NavHostController) {
    val d = appData()
    val repo = Graph.repo
    val s = remember(d) {
        val active = d.decks.filter { !it.archived && it.algorithm != Algo.FAST }.map { it.id }.toSet()
        val cards = d.cards.filter { it.deckId in active }
        val today = Stats.today(d)
        val due = cards.count { Srs.isDue(it) }
        val newAvail = Stats.newAvailable(d, repo)
        val counts = Stats.dayCounts(d.reviews)
        val week = Stats.lastDays(7)
        val decks = d.decks.filter { !it.archived }.map { it to Stats.deck(d.cardsOf(it.id)) }
        val owned = d.decks.mapNotNull { it.sourcePublicId }.toSet()
        val cats = d.decks.map { it.category }.toSet()
        val recs = Graph.remote.builtIn.filter { it.id !in owned }.sortedByDescending { it.category in cats }.take(6)
        object {
            val today = today; val due = due; val newAvail = newAvail; val learned = d.cards.count { it.status != Status.NEW }
            val weekly = week.map { counts[it]?.reviews ?: 0 }; val week = week; val streak = Stats.streaks(d.reviews).first
            val decks = decks; val recs = recs; val fc = Stats.forecast(cards, 7); val time = Stats.totalMs(d)
            val best = decks.filter { it.second.due > 0 }.maxByOrNull { it.second.due }
        }
    }
    val goal = d.settings.dailyGoal
    val pct = s.today.first / goal.toFloat()
    val toStudy = s.due + s.newAvail
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val greet = stringResource(if (h < 12) R.string.greetingMorning else if (h < 18) R.string.greetingAfternoon else R.string.greetingEvening)
    val dayFmt = SimpleDateFormat("EEE", Locale.getDefault())

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(greet, style = Muted)
                    Text("${d.session.user?.name?.ifBlank { null } ?: stringResource(R.string.learner)} 👋", style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton({ nav.go("search") }) { Icon(Icons.Rounded.Search, stringResource(R.string.search)) }
                YCard(onClick = { nav.go("stats") }, padding = 10.dp, shape = RoundedCornerShape(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.LocalFireDepartment, null, tint = if (s.streak > 0) Orange else MaterialTheme.colorScheme.outline)
                        Text("${s.streak}", fontWeight = FontWeight.ExtraBold, color = Orange)
                    }
                }
            }
        }
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(BrandGradient).padding(20.dp)) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Ring(pct, 104.dp, 11.dp, Color.White, Color.White.copy(alpha = 0.25f)) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("${s.today.first}", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp)
                                Text("/ $goal", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                            }
                        }
                        Spacer(Modifier.width(18.dp))
                        Column {
                            Text(stringResource(R.string.dailyGoal), color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelLarge)
                            Text(if (pct >= 1) stringResource(R.string.goalReached) else stringResource(R.string.cardsToday, s.today.first, goal), color = Color.White, style = MaterialTheme.typography.titleMedium)
                            Text("${s.due} ${stringResource(R.string.due).lowercase()} · ${s.newAvail} ${stringResource(R.string.newCards).lowercase()}", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                    when {
                        toStudy > 0 -> Button(
                            { nav.go(if (s.best != null && s.best.second.due == s.due) "study/${s.best.first.id}" else "study/all") },
                            Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(Color.White, BrandDark),
                        ) {
                            Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp))
                            Text("${stringResource(if (s.today.first > 0) R.string.continueStudying else R.string.startStudying)} · $toStudy", fontWeight = FontWeight.ExtraBold)
                        }
                        d.cards.isNotEmpty() -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.16f)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("🎉", fontSize = 22.sp); Spacer(Modifier.width(10.dp))
                            Column { Text(stringResource(R.string.allCaughtUp), color = Color.White, fontWeight = FontWeight.Bold); Text(stringResource(R.string.allCaughtUpSub), color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall) }
                        }
                        else -> Button({ nav.go(uz.yodla.app.Routes.CREATE) }, Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(Color.White, BrandDark)) {
                            Text(stringResource(R.string.createDeck), fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(Icons.Rounded.EventRepeat, Sky, stringResource(R.string.dueToday), "${s.due}", Modifier.weight(1f))
                StatTile(Icons.Rounded.CheckCircle, Emerald, stringResource(R.string.learned), "${s.learned}", Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(Icons.Rounded.LocalFireDepartment, Orange, stringResource(R.string.streak), "${s.streak} ${stringResource(if (s.streak == 1) R.string.day else R.string.days)}", Modifier.weight(1f))
                StatTile(Icons.Rounded.Schedule, Brand, stringResource(R.string.studyTime), fmtTime(s.time), Modifier.weight(1f))
            }
        }
        item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                SectionTitle(stringResource(R.string.weeklyActivity)) { TextButton({ nav.go("stats") }) { Text(stringResource(R.string.stats)) } }
                Bars(s.weekly, s.week.map { dayFmt.format(it).take(3) }, 100.dp)
            }
        }
        if (s.decks.isEmpty()) item {
            YCard(Modifier.fillMaxWidth()) {
                EmptyState(Icons.Rounded.Layers, stringResource(R.string.noDecksYet), stringResource(R.string.noDecksSub)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PrimaryButton(stringResource(R.string.createDeck), { nav.go("deckEdit/new") })
                        SecondaryButton(stringResource(R.string.browseExplore), { nav.go(uz.yodla.app.Routes.EXPLORE) })
                    }
                }
            }
        } else {
            item { SectionTitle(stringResource(R.string.decks)) { TextButton({ nav.go(uz.yodla.app.Routes.DECKS) }) { Text(stringResource(R.string.all)) } } }
            items(s.decks.sortedWith(compareByDescending<Pair<Deck, DeckStats>> { it.second.due }.thenByDescending { it.first.updatedAt }).take(3), key = { it.first.id }) { (deck, st) ->
                DeckRow(deck, st) { nav.go("deck/${deck.id}") }
            }
        }
        if (s.fc.any { it > 0 }) item {
            YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                SectionTitle(stringResource(R.string.upcoming))
                s.fc.forEachIndexed { i, n ->
                    if (n > 0) Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(when (i) { 0 -> stringResource(R.string.today); 1 -> stringResource(R.string.tomorrow); else -> stringResource(R.string.inDays, i) }, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text("$n ${stringResource(R.string.cards)}", Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)).padding(horizontal = 10.dp, vertical = 3.dp), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        if (s.recs.isNotEmpty()) {
            item { SectionTitle("✨ " + stringResource(R.string.recommended)) { TextButton({ nav.go(uz.yodla.app.Routes.EXPLORE) }) { Text(stringResource(R.string.explore)) } } }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(s.recs, key = { it.id }) { p ->
                        YCard(Modifier.width(168.dp), onClick = { nav.go("public/${p.id}") }) {
                            DeckCover(p.cover, p.color)
                            Spacer(Modifier.height(10.dp))
                            Text(p.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.height(40.dp))
                            Text("${p.cardCount} ${stringResource(R.string.cards)}", style = Muted)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DeckRow(deck: Deck, st: DeckStats, onClick: () -> Unit) {
    YCard(Modifier.fillMaxWidth(), onClick = onClick, padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            DeckCover(deck.cover, deck.color, deck.image)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(deck.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${st.total} ${stringResource(R.string.cards)} · ${st.progress}%", style = Muted)
            }
            if (st.due > 0) Badge(st.due)
        }
    }
}

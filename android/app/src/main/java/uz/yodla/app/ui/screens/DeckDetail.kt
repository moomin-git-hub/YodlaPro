package uz.yodla.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.DateFormat

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckScreen(nav: NavHostController, id: String) {
    val d = appData()
    val repo = Graph.repo
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    val deck = d.deck(id)
    val cards = remember(d.cards, id) { d.cardsOf(id) }
    val treeIds = remember(d.decks, id) { repo.tree(id, d.decks).toSet() }
    val allCards = remember(d.cards, treeIds) { d.cards.filter { it.deckId in treeIds } }
    val st = remember(allCards) { Stats.deck(allCards) }
    val kids = remember(d.decks, id) { d.decks.filter { it.parentId == id } }
    var q by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var sort by remember { mutableStateOf("date") }
    var sel by remember { mutableStateOf<Set<String>?>(null) }
    var algoSheet by remember { mutableStateOf(false) }
    var actionsFor by remember { mutableStateOf<Card?>(null) }
    var moveOpen by remember { mutableStateOf(false) }
    var publishing by remember { mutableStateOf(false) }
    val exportCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null && deck != null) scope.launch {
            ctx.contentResolver.openOutputStream(uri)!!.bufferedWriter().use { w ->
                w.write("﻿question,answer,example,explanation\n")
                cards.filter { it.type != CardType.OCCLUSION }.distinctBy { it.noteId }.forEach { c -> w.write(listOf(c.front, c.back, c.example, c.explanation).joinToString(",") { Files.csvEscape(it) } + "\n") }
            }
            toast(ctx.getString(R.string.exported))
        }
    }
    val exportJson = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null && deck != null) scope.launch {
            val o = buildJsonObject {
                put("app", "yodla")
                put("deck", buildJsonObject { put("title", deck.title); put("description", deck.description); put("category", deck.category); put("cover", deck.cover); put("color", deck.color) })
                put("cards", JsonArray(cards.filter { it.type != CardType.OCCLUSION }.distinctBy { it.noteId }.map { c -> buildJsonObject { put("front", c.front); put("back", c.back); put("example", c.example); put("explanation", c.explanation) } }))
            }
            ctx.contentResolver.openOutputStream(uri)!!.bufferedWriter().use { it.write(o.toString()) }
            toast(ctx.getString(R.string.exported))
        }
    }

    if (deck == null) { Column(Modifier.padding(16.dp)) { PageHeader("", onBack = { nav.popBackStack() }); EmptyState(Icons.Rounded.Inbox, stringResource(R.string.notFound)) }; return }

    val shown = remember(cards, q, filter, sort) {
        val s = q.trim().lowercase()
        cards.filter { c ->
            (s.isEmpty() || "${c.front} ${c.back} ${c.example} ${c.explanation}".lowercase().contains(s)) && when (filter) {
                "new" -> c.status == Status.NEW; "learning" -> c.status != Status.NEW && !Srs.isMastered(c); "mastered" -> Srs.isMastered(c)
                "difficult" -> Srs.isHard(c); "bookmarked" -> c.bookmarked; "frozen" -> c.frozen; "due" -> Srs.isDue(c); else -> true
            }
        }.let { l ->
            when (sort) {
                "name" -> l.sortedBy { it.questionText().lowercase() }
                "progress" -> l.sortedWith(compareByDescending<Card> { if (it.status == Status.NEW) -1.0 else it.interval })
                else -> l.sortedByDescending { it.createdAt }
            }
        }
    }
    val n = remember(d, deck.id) { repo.todayCount(deck.id) }
    val hasWork = n > 0 || allCards.any { it.status == Status.NEW && !it.frozen }
    val ids = sel?.toList().orEmpty()

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.navBack)) }
                    Spacer(Modifier.weight(1f))
                    IconButton({ nav.go("deckEdit/${deck.id}") }) { Icon(Icons.Rounded.Edit, stringResource(R.string.editDeck)) }
                    IconButton({ nav.go("deckSettings/${deck.id}") }) { Icon(Icons.Rounded.Settings, stringResource(R.string.settings)) }
                }
            }
            item {
                YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DeckCover(deck.cover, deck.color, deck.image, 72.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(deck.title, style = MaterialTheme.typography.headlineSmall)
                            Text("${stringResource(catLabel(deck.category))}${if (deck.archived) " · 🗄" else ""}", style = Muted)
                            Row(Modifier.padding(top = 4.dp).clip(RoundedCornerShape(10.dp)).clickable { algoSheet = true }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(stringResource(R.string.learningAlgorithm) + ": ", style = Muted)
                                Text(stringResource(algoLabel(deck.algorithm)) + if (deck.algorithm != Algo.FAST) " · " + stringResource(presetLabel(deck.preset)) else "", color = Sky, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    }
                    if (deck.description.isNotBlank()) Text(deck.description, Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(Triple(R.string.newCards, st.new, Sky), Triple(R.string.learning, st.learning, Amber), Triple(R.string.mastered, st.mastered, Emerald), Triple(R.string.due, st.due, Brand)).forEach { (l, v, c) ->
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f)).padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("$v", color = c, style = MaterialTheme.typography.titleLarge)
                                Text(stringResource(l), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                            }
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) { YProgress(st.progress, Modifier.weight(1f)); Spacer(Modifier.width(10.dp)); Text("${st.progress}%", fontWeight = FontWeight.ExtraBold) }
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        PrimaryButton(if (hasWork) stringResource(R.string.study) + (if (n > 0) " · $n" else "") else stringResource(R.string.practice),
                            { nav.go(if (hasWork) "study/${deck.id}" else "study/${deck.id}?practice=true") }, Modifier.weight(1f), enabled = allCards.isNotEmpty(), icon = Icons.Rounded.PlayArrow)
                        FilledTonalIconButton({ repo.updateSettings { it.copy(shuffle = !it.shuffle) }; toast(ctx.getString(R.string.shuffle) + ": " + if (!d.settings.shuffle) "ON" else "OFF") },
                            Modifier.size(52.dp), colors = if (d.settings.shuffle) IconButtonDefaults.filledTonalIconButtonColors(Brand, Color.White) else IconButtonDefaults.filledTonalIconButtonColors()) { Icon(Icons.Rounded.Shuffle, stringResource(R.string.shuffle)) }
                        if (hasWork && cards.isNotEmpty()) FilledTonalIconButton({ nav.go("study/${deck.id}?practice=true") }, Modifier.size(52.dp)) { Icon(Icons.Rounded.FitnessCenter, stringResource(R.string.practice)) }
                    }
                    if (publishing) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 10.dp))
                }
            }
            deck.parentId?.let { pid -> d.deck(pid)?.let { parent -> item {
                TextButton({ nav.go("deck/${parent.id}") }) { Icon(Icons.Rounded.SubdirectoryArrowLeft, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("${parent.cover} ${parent.title}") }
            } } }
            item {
                SectionTitle(stringResource(R.string.subdecks) + if (kids.isNotEmpty()) " · ${kids.size}" else "") {
                    FilledTonalButton({ nav.go("deckEdit/new?parent=${deck.id}" + (deck.folderId?.let { "&folder=$it" } ?: "")) }) { Icon(Icons.Rounded.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.addSubdeck)) }
                }
            }
            items(kids, key = { "k" + it.id }) { DeckTreeNode(d, it, nav) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Quick(Icons.Rounded.Add, stringResource(R.string.addCard)) { nav.go("card/new?deck=${deck.id}") } }
                    item { Quick(Icons.Rounded.TextFields, stringResource(R.string.cloze)) { nav.go("card/new?deck=${deck.id}&type=cloze") } }
                    item { Quick(Icons.Rounded.ImageSearch, stringResource(R.string.imageOcclusion)) { nav.go("card/new?deck=${deck.id}&type=occlusion") } }
                    item { Quick(Icons.Rounded.AutoAwesome, "AI") { nav.go("ai?deck=${deck.id}") } }
                    item { Quick(Icons.Rounded.UploadFile, stringResource(R.string.import_)) { nav.go("import?deck=${deck.id}") } }
                }
            }
            item {
                OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text(stringResource(R.string.searchCards)) }, leadingIcon = { Icon(Icons.Rounded.Search, null) },
                    trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Icons.Rounded.Close, stringResource(R.string.clear)) } }, singleLine = true, shape = RoundedCornerShape(16.dp))
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf("all" to R.string.all, "due" to R.string.due, "new" to R.string.newCards, "learning" to R.string.learning, "mastered" to R.string.mastered,
                        "difficult" to R.string.difficult, "bookmarked" to R.string.bookmarks, "frozen" to R.string.frozen)) { (k, l) -> YChip(stringResource(l), filter == k, { filter = k }) }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (sel != null) stringResource(R.string.selected, sel!!.size) else "${shown.size} ${stringResource(R.string.cards)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    var sortMenu by remember { mutableStateOf(false) }
                    Box {
                        TextButton({ sortMenu = true }) { Icon(Icons.Rounded.Sort, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.sort)) }
                        DropdownMenu(sortMenu, { sortMenu = false }) {
                            listOf("date" to R.string.dateAdded, "name" to R.string.title, "progress" to R.string.progress).forEach { (k, l) ->
                                DropdownMenuItem({ Text(stringResource(l)) }, { sort = k; sortMenu = false }, trailingIcon = { if (sort == k) Icon(Icons.Rounded.Check, null) })
                            }
                        }
                    }
                    if (cards.isNotEmpty()) TextButton({ sel = if (sel == null) emptySet() else null }) { Text(stringResource(if (sel != null) R.string.cancel else R.string.select)) }
                    if (sel != null) TextButton({ sel = shown.map { it.id }.toSet() }) { Text(stringResource(R.string.all)) }
                }
            }
            if (cards.isEmpty()) item {
                EmptyState(Icons.Rounded.Inbox, stringResource(R.string.emptyDeck), stringResource(R.string.emptyDeckSub)) { PrimaryButton(stringResource(R.string.addCard), { nav.go("card/new?deck=${deck.id}") }, icon = Icons.Rounded.Add) }
            } else if (shown.isEmpty()) item { Text(stringResource(R.string.noResults), Modifier.fillMaxWidth().padding(32.dp), textAlign = TextAlign.Center, style = Muted) }
            items(shown.take(600), key = { it.id }) { c ->
                CardRow(c, sel?.contains(c.id),
                    onClick = { if (sel != null) sel = sel!!.toMutableSet().apply { if (!add(c.id)) remove(c.id) } else nav.go("card/${c.id}") },
                    onLong = { if (sel != null) sel = sel!! + c.id else actionsFor = c },
                    onBookmark = { scope.launch { repo.updateCard(c.id) { it.copy(bookmarked = !it.bookmarked) } } },
                    onDifficult = { scope.launch { repo.updateCard(c.id) { it.copy(difficult = !it.difficult) } } })
            }
        }

        if (!ids.isEmpty()) Row(
            Modifier.align(Alignment.BottomCenter).padding(16.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.inverseSurface).padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            val inv = MaterialTheme.colorScheme.inverseOnSurface
            BulkBtn(Icons.Rounded.DriveFileMove, stringResource(R.string.move), inv) { moveOpen = true }
            BulkBtn(Icons.Rounded.AcUnit, stringResource(R.string.freeze), inv) {
                scope.launch { val freeze = cards.filter { it.id in ids }.any { !it.frozen }; repo.updateCards(ids) { it.copy(frozen = freeze) }; sel = null; toast(ctx.getString(R.string.saved)) }
            }
            BulkBtn(Icons.Rounded.SwapHoriz, stringResource(R.string.reverse), inv) { scope.launch { repo.reverseCards(ids); sel = null; toast(ctx.getString(R.string.saved)) } }
            BulkBtn(Icons.Rounded.RestartAlt, stringResource(R.string.resetShort), inv) {
                ask(ctx.getString(R.string.resetProgress) + " (${ids.size})?", ctx.getString(R.string.resetProgress), false) { scope.launch { repo.resetProgress(ids); sel = null; toast(ctx.getString(R.string.saved)) } }
            }
            BulkBtn(Icons.Rounded.Delete, stringResource(R.string.delete), Rose) {
                ask(ctx.getString(R.string.confirmDeleteCards, ids.size), ctx.getString(R.string.delete), true) { scope.launch { repo.deleteCards(ids); sel = null; toast(ctx.getString(R.string.deleted)) } }
            }
        }
    }

    if (algoSheet) AlgorithmSheet(deck.algorithm, { a -> scope.launch { repo.saveDeck(deck.copy(algorithm = a)); toast(ctx.getString(R.string.saved)) } }) { algoSheet = false }
    actionsFor?.let { c -> d.cards.firstOrNull { it.id == c.id }?.let { cur -> CardActionsSheet(cur, nav, onDismiss = { actionsFor = null }, onSelect = { sel = setOf(cur.id) }) } ?: run { actionsFor = null } }
    if (moveOpen) ModalBottomSheet({ moveOpen = false }) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.chooseDeck), style = MaterialTheme.typography.titleLarge)
            d.decks.filter { it.id != deck.id }.forEach { x ->
                YCard(Modifier.fillMaxWidth(), onClick = { scope.launch { repo.moveCards(ids, x.id); moveOpen = false; sel = null; toast(ctx.getString(R.string.saved)) } }, padding = 10.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) { DeckCover(x.cover, x.color, x.image, 40.dp); Spacer(Modifier.width(10.dp)); Text(x.title, fontWeight = FontWeight.Bold) }
                }
            }
            if (d.decks.size < 2) Text(stringResource(R.string.noDecksYet), style = Muted)
        }
    }
}

fun safeName(s: String) = s.replace(Regex("[^\\p{L}\\p{N}]+"), "_").take(40).ifBlank { "deck" }

@Composable
fun MenuItem(icon: ImageVector, label: Int, tint: Color = MaterialTheme.colorScheme.onSurface, onClick: () -> Unit) =
    DropdownMenuItem({ Text(stringResource(label), color = tint) }, onClick, leadingIcon = { Icon(icon, null, tint = tint) })

@Composable
private fun Quick(icon: ImageVector, label: String, onClick: () -> Unit) {
    YCard(Modifier.width(100.dp), onClick = onClick, padding = 10.dp) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(6.dp))
        Text(label, Modifier.fillMaxWidth().height(32.dp), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun BulkBtn(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(Modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, label, tint = tint, modifier = Modifier.size(20.dp))
        Text(label, color = tint, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CardRow(c: Card, selected: Boolean?, onClick: () -> Unit, onLong: () -> Unit = {}, onBookmark: (() -> Unit)? = null, onDifficult: (() -> Unit)? = null, deckLabel: String? = null) {
    val cs = MaterialTheme.colorScheme
    val (statusLabel, statusColor) = when { c.frozen -> R.string.frozen to Sky; c.status == Status.NEW -> R.string.newCards to Sky; Srs.isMastered(c) -> R.string.mastered to Emerald; else -> R.string.learning to Amber }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (selected == true) cs.primaryContainer else cs.surface)
            .combinedClickable(onClick = onClick, onLongClick = onLong).padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selected != null) { Checkbox(selected, { onClick() }); Spacer(Modifier.width(4.dp)) }
        if (c.image.isNotBlank()) { AsyncImage(c.image, null, Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Crop); Spacer(Modifier.width(10.dp)) }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (c.type != CardType.BASIC) Text(if (c.type == CardType.CLOZE) "[…] " else "🖼 ", color = Brand, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
                Text(c.questionText().replace('\n', ' '), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(c.answerText().replace('\n', ' '), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(statusColor)); Spacer(Modifier.width(5.dp))
                Text(buildString {
                    append(stringResource(statusLabel))
                    if (c.status != Status.NEW) append(" · " + stringResource(R.string.nextReview) + ": " + if (c.due <= now()) stringResource(R.string.today) else Srs.formatDuration(c.due - now()))
                    deckLabel?.let { append(" · $it") }
                }, style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (selected == null && onBookmark != null) IconButton(onBookmark) { Icon(if (c.bookmarked) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder, stringResource(R.string.bookmark), tint = if (c.bookmarked) Amber else cs.outline) }
        if (selected == null && onDifficult != null) IconButton(onDifficult) { Icon(Icons.Rounded.Warning, stringResource(R.string.markDifficult), tint = if (c.difficult) Rose else cs.outline) }
    }
}

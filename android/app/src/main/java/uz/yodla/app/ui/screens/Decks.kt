package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DecksScreen(nav: NavHostController) {
    val d = appData()
    var sort by rememberSaveable { mutableStateOf("due") }
    var sortMenu by remember { mutableStateOf(false) }
    var showArchived by rememberSaveable { mutableStateOf(false) }
    var editFolder by remember { mutableStateOf<Folder?>(null) }
    val toast = LocalToast.current
    val roots = remember(d, sort, showArchived) {
        sortDecks(d, d.decks.filter { it.parentId == null && it.folderId == null && it.archived == showArchived }, sort)
    }
    val hard = d.cards.count(Srs::isHard)
    val marks = d.cards.count { it.bookmarked }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            PageHeader(stringResource(R.string.decks), "${d.decks.count { !it.archived }} · ${d.cards.size} ${stringResource(R.string.cards)}") {
                IconButton({ nav.go("search") }) { Icon(Icons.Rounded.Search, stringResource(R.string.search)) }
                Box {
                    IconButton({ sortMenu = true }) { Icon(Icons.Rounded.Sort, stringResource(R.string.sort)) }
                    DropdownMenu(sortMenu, { sortMenu = false }) {
                        listOf("due" to R.string.due, "name" to R.string.title, "recent" to R.string.recent, "progress" to R.string.progress).forEach { (k, l) ->
                            DropdownMenuItem({ Text(stringResource(l)) }, { sort = k; sortMenu = false }, trailingIcon = { if (sort == k) Icon(Icons.Rounded.Check, null) })
                        }
                    }
                }
                IconButton({ editFolder = Folder("", "", createdAt = now(), updatedAt = now()) }) { Icon(Icons.Rounded.CreateNewFolder, stringResource(R.string.newFolder)) }
                FilledIconButton({ nav.go("deckEdit/new") }) { Icon(Icons.Rounded.Add, stringResource(R.string.createDeck)) }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SmartTile(Icons.Rounded.Warning, Rose, stringResource(R.string.difficultCards), hard, Modifier.weight(1f)) { nav.go("study/difficult") }
                SmartTile(Icons.Rounded.Bookmark, Amber, stringResource(R.string.bookmarks), marks, Modifier.weight(1f)) { nav.go("study/bookmarks") }
            }
        }
        if (!showArchived) items(d.folders.sortedBy { it.createdAt }, key = { "f" + it.id }) { f ->
            FolderRow(d, f, onOpen = { nav.go("folder/${f.id}") }, onEdit = { editFolder = f }, onAdd = { nav.go("deckEdit/new?folder=${f.id}") })
        }
        if (roots.isEmpty() && d.folders.isEmpty() && !showArchived) item {
            EmptyState(Icons.Rounded.Layers, stringResource(R.string.noDecksYet), stringResource(R.string.noDecksSub)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton(stringResource(R.string.createDeck), { nav.go("deckEdit/new") })
                    SecondaryButton(stringResource(R.string.browseExplore), { nav.go(uz.yodla.app.Routes.EXPLORE) })
                }
            }
        }
        items(roots, key = { it.id }) { deck -> DeckTreeNode(d, deck, nav, sort) }
        if (d.decks.any { it.archived }) item {
            TextButton({ showArchived = !showArchived }, Modifier.fillMaxWidth()) {
                Icon(if (showArchived) Icons.Rounded.Layers else Icons.Rounded.Archive, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                Text(if (showArchived) stringResource(R.string.decks) else "${stringResource(R.string.archived)} · ${d.decks.count { it.archived }}")
            }
        }
    }

    editFolder?.let { f ->
        FolderSheet(f, onDismiss = { editFolder = null }, onSaved = { saved -> val isNew = f.id.isBlank(); editFolder = null; toast(Graph.repo.ctx.getString(R.string.saved)); if (isNew) nav.go("folder/${saved.id}") },
            onDeleted = { editFolder = null })
    }
}

fun sortDecks(d: AppData, l: List<Deck>, sort: String): List<Deck> {
    val st = l.associateWith { treeStats(d, it.id) }
    return when (sort) {
        "name" -> l.sortedBy { it.title.lowercase() }
        "recent" -> l.sortedByDescending { it.updatedAt }
        "progress" -> l.sortedByDescending { st[it]!!.progress }
        else -> l.sortedWith(compareByDescending<Deck> { st[it]!!.due }.thenByDescending { it.updatedAt })
    }
}

/** Stats for a deck together with all of its subdecks. */
fun treeStats(d: AppData, id: String): DeckStats {
    val ids = Graph.repo.tree(id, d.decks).toSet()
    return Stats.deck(d.cards.filter { it.deckId in ids })
}
/** Cards that a study session would really show today (same logic as the study queue). */
fun toStudy(target: String) = Graph.repo.todayCount(target)

/** Noji-style deck node: ± to expand subdecks, "N cards to study today", ⋮ menu. */
@Composable
fun DeckTreeNode(d: AppData, deck: Deck, nav: NavHostController, sort: String = "due", depth: Int = 0) {
    val kids = remember(d.decks, deck.id) { sortDecks(d, d.decks.filter { it.parentId == deck.id }, sort) }
    val st = remember(d, deck.id) { treeStats(d, deck.id) }
    var open by rememberSaveable(deck.id) { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val ask = confirm()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val n = remember(d, deck.id) { toStudy(deck.id) }
    val body: @Composable ColumnScope.() -> Unit = {
        Row(Modifier.fillMaxWidth().clickable { nav.go("deck/${deck.id}") }.padding(start = if (kids.isEmpty() && depth == 0) 12.dp else 4.dp, top = 10.dp, bottom = 10.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            if (kids.isNotEmpty()) IconButton({ open = !open }, Modifier.size(36.dp)) { Icon(if (open) Icons.Rounded.Remove else Icons.Rounded.Add, null) }
            else if (depth > 0) Spacer(Modifier.width(12.dp))
            DeckCover(deck.cover, deck.color, deck.image, if (depth > 0) 40.dp else 50.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(deck.title, style = if (depth > 0) MaterialTheme.typography.titleSmall else MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Schedule, null, Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.toStudyToday, n) + if (kids.isNotEmpty()) " · ${kids.size} ${stringResource(R.string.subdecks).lowercase()}" else "", style = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (n > 0) Badge(n)
            Box {
                IconButton({ menu = true }, Modifier.size(40.dp)) { Icon(Icons.Rounded.MoreVert, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                DropdownMenu(menu, { menu = false }) {
                    MenuItem(Icons.Rounded.AddCircleOutline, R.string.addSubdeck) { menu = false; nav.go("deckEdit/new?parent=${deck.id}" + (deck.folderId?.let { "&folder=$it" } ?: "")) }
                    MenuItem(Icons.Rounded.Add, R.string.addCard) { menu = false; nav.go("card/new?deck=${deck.id}") }
                    MenuItem(Icons.Rounded.Settings, R.string.editDeck) { menu = false; nav.go("deckEdit/${deck.id}") }
                    MenuItem(Icons.Rounded.Delete, R.string.delete, Rose) {
                        menu = false
                        val sub = Graph.repo.tree(deck.id, d.decks).size - 1
                        ask(if (sub > 0) ctx.getString(R.string.confirmDeleteDeckTree, deck.title, sub, st.total) else ctx.getString(R.string.confirmDeleteDeck, deck.title, st.total), ctx.getString(R.string.delete), true) {
                            scope.launch { Graph.repo.deleteDeck(deck.id); toast(ctx.getString(R.string.deleted)) }
                        }
                    }
                }
            }
        }
        if (depth == 0 && st.total > 0) Row(Modifier.padding(horizontal = 14.dp).padding(bottom = 10.dp).fillMaxWidth().height(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))) {
            if (st.mastered > 0) Box(Modifier.weight(st.mastered.toFloat()).fillMaxHeight().background(Emerald))
            if (st.learning > 0) Box(Modifier.weight(st.learning.toFloat()).fillMaxHeight().background(Sky))
            if (st.new > 0) Box(Modifier.weight(st.new.toFloat()).fillMaxHeight())
        }
        if (open && kids.isNotEmpty()) Column(Modifier.padding(start = 26.dp, bottom = 6.dp).drawBehind {
            drawLine(androidx.compose.ui.graphics.Color.Gray.copy(alpha = 0.25f), androidx.compose.ui.geometry.Offset(0f, 0f), androidx.compose.ui.geometry.Offset(0f, size.height), 2f)
        }) { kids.forEach { DeckTreeNode(d, it, nav, sort, depth + 1) } }
    }
    if (depth == 0) YCard(Modifier.fillMaxWidth(), padding = 0.dp, content = body) else Column(content = body)
}

/** Noji-style folder row: coloured folder icon, settings, add deck, open. */
@Composable
fun FolderRow(d: AppData, f: Folder, onOpen: () -> Unit, onEdit: () -> Unit, onAdd: () -> Unit) {
    val decks = d.decks.filter { it.folderId == f.id && it.parentId == null && !it.archived }
    val n = remember(d, f.id) { toStudy("folder:${f.id}") }
    YCard(Modifier.fillMaxWidth(), onClick = onOpen, padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(deckBrush(f.color)), contentAlignment = Alignment.Center) {
                if (f.emoji.isBlank() || f.emoji == "📁") Icon(Icons.Rounded.Folder, null, tint = androidx.compose.ui.graphics.Color.White) else Text(f.emoji, fontSize = 24.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(f.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(stringResource(R.string.decksCount, decks.size) + if (n > 0) " · " + stringResource(R.string.toStudyToday, n) else "", style = Muted, maxLines = 1)
            }
            IconButton(onEdit, Modifier.size(40.dp)) { Icon(Icons.Rounded.Settings, stringResource(R.string.folderSettings), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            IconButton(onAdd, Modifier.size(40.dp)) { Icon(Icons.Rounded.AddCircleOutline, stringResource(R.string.addDeckHere), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
fun FolderScreen(nav: NavHostController, id: String) {
    val d = appData()
    val f = d.folders.firstOrNull { it.id == id }
    var edit by remember { mutableStateOf(false) }
    val ask = confirm()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    if (f == null) { Column(Modifier.padding(16.dp)) { PageHeader("", onBack = { nav.popBackStack() }); EmptyState(Icons.Rounded.FolderOff, stringResource(R.string.notFound)) }; return }
    val decks = remember(d, id) { sortDecks(d, d.decks.filter { it.folderId == id && it.parentId == null && !it.archived }, "due") }
    val n = remember(d, id) { toStudy("folder:$id") }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.navBack)) }
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(deckBrush(f.color)), contentAlignment = Alignment.Center) { Text(f.emoji, fontSize = 20.sp) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) { Text(f.name, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(stringResource(R.string.decksCount, decks.size), style = Muted) }
                IconButton({ edit = true }) { Icon(Icons.Rounded.Settings, stringResource(R.string.folderSettings)) }
                IconButton({ ask(ctx.getString(R.string.confirmDeleteFolder, f.name), ctx.getString(R.string.delete), true) { scope.launch { Graph.repo.deleteFolder(f.id); toast(ctx.getString(R.string.deleted)); nav.popBackStack() } } }) {
                    Icon(Icons.Rounded.Delete, stringResource(R.string.delete), tint = Rose)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton(stringResource(R.string.study) + if (n > 0) " · $n" else "", { nav.go("study/folder:${f.id}") }, Modifier.weight(1f), enabled = decks.isNotEmpty(), icon = Icons.Rounded.PlayArrow)
                SecondaryButton(stringResource(R.string.addDeckHere), { nav.go("deckEdit/new?folder=${f.id}") }, icon = Icons.Rounded.Add)
            }
        }
        if (decks.isEmpty()) item { EmptyState(Icons.Rounded.Layers, stringResource(R.string.emptyFolder)) { PrimaryButton(stringResource(R.string.createDeck), { nav.go("deckEdit/new?folder=${f.id}") }) } }
        items(decks, key = { it.id }) { DeckTreeNode(d, it, nav) }
    }
    if (edit) FolderSheet(f, onDismiss = { edit = false }, onSaved = { edit = false }, onDeleted = { edit = false; nav.popBackStack() })
}

@Composable
private fun SmartTile(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: androidx.compose.ui.graphics.Color, label: String, n: Int, modifier: Modifier, onClick: () -> Unit) {
    YCard(modifier, onClick = onClick, padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
            Spacer(Modifier.width(10.dp))
            Column { Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis); Text("$n ${stringResource(R.string.cards)}", style = Muted) }
        }
    }
}

@Composable
fun DeckCard(deck: Deck, st: DeckStats, folder: Folder?, onClick: () -> Unit) {
    YCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.Top) {
            DeckCover(deck.cover, deck.color, deck.image)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(deck.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(folder?.let { "${it.emoji} ${it.name}" }, stringResource(catLabel(deck.category)), "${st.total} ${stringResource(R.string.cards)}").joinToString(" · "), style = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (st.due > 0) Badge(st.due)
        }
        Spacer(Modifier.height(14.dp))
        YProgress(st.progress)
        Spacer(Modifier.height(6.dp))
        Row {
            Text("${st.new} ${stringResource(R.string.newCards).lowercase()} · ${st.learning} ${stringResource(R.string.learning).lowercase()}", style = Muted, modifier = Modifier.weight(1f))
            Text("${st.mastered} ${stringResource(R.string.mastered).lowercase()}", style = Muted)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FolderSheet(f: Folder, onDismiss: () -> Unit, onSaved: (Folder) -> Unit, onDeleted: () -> Unit) {
    var name by remember { mutableStateOf(f.name) }
    var emoji by remember { mutableStateOf(f.emoji) }
    var color by remember { mutableStateOf(f.color) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val ask = confirm()
    val sReq = stringResource(R.string.required)
    ModalBottomSheet(onDismiss) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(if (f.id.isBlank()) R.string.newFolder else R.string.editFolder), style = MaterialTheme.typography.titleLarge)
            YField(name, { name = it.take(60); err = null }, stringResource(R.string.folderName), error = err)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(listOf("📁", "📚", "🗣️", "🎓", "🧪", "💼", "🏨", "🩺", "💻", "🌍", "⭐", "🔥")) { e ->
                    Text(e, Modifier.clip(RoundedCornerShape(12.dp)).background(if (e == emoji) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant).clickable { emoji = e }.padding(10.dp), fontSize = 20.sp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DECK_COLORS.forEach { c -> Box(Modifier.weight(1f).height(30.dp).clip(RoundedCornerShape(10.dp)).background(deckBrush(c)).then(if (c == color) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, RoundedCornerShape(10.dp)) else Modifier).clickable { color = c }) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (f.id.isNotBlank()) SecondaryButton(stringResource(R.string.delete), {
                    ask(Graph.repo.ctx.getString(R.string.confirmDeleteFolder, f.name), Graph.repo.ctx.getString(R.string.delete), true) { scope.launch { Graph.repo.deleteFolder(f.id); onDeleted() } }
                }, color = Rose)
                PrimaryButton(stringResource(R.string.save), {
                    if (name.isBlank()) { err = sReq; return@PrimaryButton }
                    scope.launch { onSaved(Graph.repo.saveFolder(f.copy(id = f.id.ifBlank { uid() }, name = name.trim(), emoji = emoji, color = color))) }
                }, Modifier.weight(1f))
            }
        }
    }
}

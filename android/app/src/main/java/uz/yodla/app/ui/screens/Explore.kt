package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.Routes
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

/** Built-in decks show instantly; community decks from the server are merged in when they arrive (Render may be waking up). */
object PublicCache { var list by mutableStateOf<List<PublicDeck>?>(null) }

@Composable
fun publicDecks(): List<PublicDeck>? {
    if (PublicCache.list == null) PublicCache.list = Graph.remote.builtIn
    LaunchedEffect(Unit) { PublicCache.list = Graph.remote.publicDecks() }
    return PublicCache.list
}

@Composable
fun ExploreScreen(nav: NavHostController) {
    val d = appData()
    val list = publicDecks()
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var q by rememberSaveableString("")
    var cat by rememberSaveableString("all")
    var tab by rememberSaveableString("featured")
    val owned = d.decks.mapNotNull { it.sourcePublicId }.toSet()
    val shown = remember(list, q, cat, tab, d.saved) {
        val s = q.trim().lowercase()
        var l = (list ?: emptyList()).filter { p -> (cat == "all" || p.category == cat) && (s.isEmpty() || "${p.title} ${p.description} ${p.cards.joinToString(" ") { it.front + " " + it.back }}".lowercase().contains(s)) }
        if (tab == "saved") l = l.filter { it.id in d.saved }
        if (tab == "popular") l = l.sortedWith(compareByDescending<PublicDeck> { it.saves }.thenByDescending { it.cardCount })
        l
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { PageHeader(stringResource(R.string.explore), stringResource(R.string.exploreSub)) }
        item {
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text(stringResource(R.string.searchDecks)) }, leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        }
        item { Segmented(tab, listOf("featured" to stringResource(R.string.featured), "popular" to stringResource(R.string.popular), "saved" to "${stringResource(R.string.savedDecks)} (${d.saved.size})"), { tab = it }) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { YChip(stringResource(R.string.all), cat == "all", { cat = "all" }) }
                items(CATEGORIES.filter { (c, _) -> list?.any { it.category == c } == true }) { (c, e) -> YChip("$e ${stringResource(catLabel(c))}", cat == c, { cat = c }) }
            }
        }
        if (list == null) items(4) { Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))) }
        else if (shown.isEmpty()) item { EmptyState(Icons.Rounded.Explore, stringResource(R.string.noResults)) }
        items(shown, key = { it.id }) { p ->
            val saved = p.id in d.saved
            YCard(Modifier.fillMaxWidth(), onClick = { nav.go("public/${p.id}") }) {
                Row(verticalAlignment = Alignment.Top) {
                    DeckCover(p.cover, p.color)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("${stringResource(catLabel(p.category))} · ${p.cardCount} ${stringResource(R.string.cards)}${if (p.saves > 0) " · ♥ ${p.saves}" else ""}", style = Muted)
                    }
                    IconButton({ scope.launch { Graph.repo.toggleSaved(p.id); toast(ctx.getString(if (saved) R.string.deleted else R.string.saved)) } }) {
                        Icon(if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder, stringResource(R.string.saveDeck), tint = if (saved) Amber else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (p.description.isNotBlank()) Text(p.description, Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (p.id in owned) Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.CheckCircle, null, tint = Emerald, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.added), color = Emerald, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
fun rememberSaveableString(init: String) = androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf(init) }

@Composable
fun PublicDeckScreen(nav: NavHostController, id: String) {
    val d = appData()
    val list = publicDecks()
    val p = list?.firstOrNull { it.id == id }
    val scope = rememberCoroutineScope()
    val toast = LocalToast.current
    val ctx = LocalContext.current
    var cards by remember { mutableStateOf<List<PublicCard>?>(null) }
    LaunchedEffect(p) { if (p != null) cards = Graph.remote.publicCards(p) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            PageHeader("", onBack = { nav.popBackStack() }) {
                if (p != null) { val saved = p.id in d.saved; IconButton({ scope.launch { Graph.repo.toggleSaved(p.id) } }) { Icon(if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder, null, tint = if (saved) Amber else MaterialTheme.colorScheme.onSurface) } }
            }
        }
        if (list == null) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        else if (p == null) item { EmptyState(Icons.Rounded.Layers, stringResource(R.string.notFound)) }
        else {
            item {
                YCard(Modifier.fillMaxWidth(), padding = 20.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DeckCover(p.cover, p.color, size = 72.dp); Spacer(Modifier.width(14.dp))
                        Column { Text(p.title, style = MaterialTheme.typography.headlineSmall); Text("${stringResource(catLabel(p.category))} · ${cards?.size ?: p.cardCount} ${stringResource(R.string.cards)} · ${stringResource(R.string.by, p.author.ifBlank { "—" })}", style = Muted) }
                    }
                    if (p.description.isNotBlank()) Text(p.description, Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    val ownedDeck = d.decks.firstOrNull { it.sourcePublicId == p.id }
                    if (ownedDeck != null) SecondaryButton(stringResource(R.string.openDeck), { nav.go("deck/${ownedDeck.id}") }, Modifier.fillMaxWidth(), icon = Icons.Rounded.Check)
                    else PrimaryButton(stringResource(R.string.addToLibrary), {
                        scope.launch { val deck = Graph.remote.addToLibrary(p, cards.orEmpty()); toast(ctx.getString(R.string.saved)); nav.go("deck/${deck.id}") }
                    }, Modifier.fillMaxWidth(), enabled = !cards.isNullOrEmpty(), icon = Icons.Rounded.Add)
                }
            }
            item { SectionTitle(stringResource(R.string.preview)) }
            items(cards.orEmpty()) { c ->
                YCard(Modifier.fillMaxWidth(), padding = 14.dp) {
                    RichText(Cloze.plain(c.front), weight = FontWeight.Bold, size = 15.sp)
                    RichText(c.back, size = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    c.example?.takeIf { it.isNotBlank() }?.let { Text(it, style = Muted, modifier = Modifier.padding(top = 4.dp)) }
                }
            }
        }
    }
}

@Composable
fun CreateScreen(nav: NavHostController) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(stringResource(R.string.create), stringResource(R.string.createSub))
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFF8B5CF6), Fuchsia, Color(0xFFEC4899)))).clickable { nav.go("ai") }.padding(24.dp)) {
            Column {
                Icon(Icons.Rounded.AutoAwesome, null, tint = Color.White, modifier = Modifier.size(34.dp))
                Spacer(Modifier.height(14.dp))
                Text(stringResource(R.string.aiGenerate), color = Color.White, style = MaterialTheme.typography.headlineSmall)
                Text(stringResource(R.string.aiGenerateSub), color = Color.White.copy(alpha = 0.88f))
            }
        }
        CreateRow(Icons.Rounded.CreateNewFolder, listOf(Sky, Color(0xFF6366F1)), R.string.manualDeck, R.string.manualDeckSub) { nav.go("deckEdit/new") }
        CreateRow(Icons.Rounded.EditNote, listOf(Emerald, Color(0xFF14B8A6)), R.string.manualCard, R.string.manualCardSub) { nav.go("card/new") }
        CreateRow(Icons.Rounded.TextFields, listOf(Brand, Fuchsia), R.string.cloze, R.string.clozeSub) { nav.go("card/new?type=cloze") }
        CreateRow(Icons.Rounded.ImageSearch, listOf(Rose, Orange), R.string.imageOcclusion, R.string.occlusionSub) { nav.go("card/new?type=occlusion") }
        CreateRow(Icons.Rounded.UploadFile, listOf(Amber, Orange), R.string.importCards, R.string.importCardsSub) { nav.go("import") }
    }
}

@Composable
private fun CreateRow(icon: androidx.compose.ui.graphics.vector.ImageVector, grad: List<Color>, title: Int, sub: Int, onClick: () -> Unit) {
    YCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(grad)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color.White) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) { Text(stringResource(title), style = MaterialTheme.typography.titleMedium); Text(stringResource(sub), style = Muted) }
            Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
        }
    }
}


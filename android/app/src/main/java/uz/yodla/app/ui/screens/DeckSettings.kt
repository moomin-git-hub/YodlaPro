package uz.yodla.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

fun algoLabel(a: String) = when (a) { Algo.FSRS -> R.string.algoFsrs; Algo.FAST -> R.string.algoFast; else -> R.string.algoSm2 }
private fun algoDesc(a: String) = when (a) { Algo.FSRS -> R.string.algoFsrsDesc; Algo.FAST -> R.string.algoFastDesc; else -> R.string.algoSm2Desc }

/** Noji-style "Choose learning algorithm" sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlgorithmSheet(current: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismiss, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.chooseAlgorithm), style = MaterialTheme.typography.titleLarge, modifier = Modifier.align(Alignment.CenterHorizontally))
            Algo.all.forEach { a ->
                val sel = a == current
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).border(2.dp, if (sel) Brand else MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                        .background(if (sel) Brand.copy(alpha = 0.06f) else Color.Transparent).clickable { onPick(a); onDismiss() }.padding(18.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (a == Algo.FAST) Icons.Rounded.FlashOn else if (a == Algo.FSRS) Icons.Rounded.Psychology else Icons.Rounded.EventRepeat, null, tint = Sky, modifier = Modifier.size(30.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(algoLabel(a)), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        if (a == Algo.FSRS) Text(stringResource(R.string.recommended_), Modifier.clip(RoundedCornerShape(10.dp)).background(Sky).padding(horizontal = 8.dp, vertical = 3.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
                        Spacer(Modifier.width(8.dp))
                        Icon(if (sel) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, tint = if (sel) Brand else MaterialTheme.colorScheme.outline)
                    }
                    Text(stringResource(algoDesc(a)), Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckSettingsScreen(nav: NavHostController, id: String) {
    val d = appData()
    val repo = Graph.repo
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    val deck = d.deck(id)
    var sheet by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    if (deck == null) { Column(Modifier.padding(16.dp)) { PageHeader("", onBack = { nav.popBackStack() }); EmptyState(Icons.Rounded.Inbox, stringResource(R.string.notFound)) }; return }
    val ids = remember(d.decks, id) { repo.tree(id, d.decks).toSet() }
    val treeCards = d.cards.filter { it.deckId in ids }
    val own = d.cardsOf(id)

    val exportCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) scope.launch {
            ctx.contentResolver.openOutputStream(uri)!!.bufferedWriter().use { w ->
                w.write("﻿question,answer,example,explanation\n")
                own.filter { it.type != CardType.OCCLUSION && it.type != CardType.REVERSE }.distinctBy { it.noteId }
                    .forEach { c -> w.write(listOf(htmlToPlain(c.front), htmlToPlain(c.back), c.example, c.explanation).joinToString(",") { Files.csvEscape(it) } + "\n") }
            }
            toast(ctx.getString(R.string.exported))
        }
    }
    val exportJson = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) scope.launch {
            val o = buildJsonObject {
                put("app", "yodla")
                put("deck", buildJsonObject { put("title", deck.title); put("description", deck.description); put("category", deck.category); put("cover", deck.cover); put("color", deck.color) })
                put("cards", JsonArray(own.filter { it.type != CardType.OCCLUSION && it.type != CardType.REVERSE }.distinctBy { it.noteId }.map { c ->
                    buildJsonObject { put("front", c.front); put("back", c.back); put("example", c.example); put("explanation", c.explanation) }
                }))
            }
            ctx.contentResolver.openOutputStream(uri)!!.bufferedWriter().use { it.write(o.toString()) }
            toast(ctx.getString(R.string.exported))
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        PageHeader(stringResource(R.string.settings), deck.title, onBack = { nav.popBackStack() })
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        SettingsGroup {
            SRow(Icons.Rounded.Psychology, stringResource(R.string.learningAlgorithm), stringResource(algoLabel(deck.algorithm))) { sheet = "algo" }
            if (repo.cloud) SRow(Icons.Rounded.Public, stringResource(R.string.shareToExplore)) {
                ask(ctx.getString(R.string.shareToExplore) + "?", ctx.getString(R.string.shareToExplore), false) {
                    busy = true
                    scope.launch { runCatching { Graph.remote.publish(deck, own) }.onSuccess { toast(ctx.getString(R.string.published)) }.onFailure { toast(errMessage(ctx, it)) }; busy = false }
                }
            }
        }
        SettingsGroup {
            SRow(Icons.Rounded.AutoAwesome, stringResource(R.string.aiGenerate), tint = Fuchsia) { nav.go("ai?deck=${deck.id}") }
            SRow(Icons.Rounded.CloudOff, stringResource(R.string.offlineLearning), stringResource(R.string.on)) { toast(ctx.getString(R.string.offlineAlwaysOn)) }
            SRow(Icons.Rounded.Download, stringResource(R.string.importCards)) { nav.go("import?deck=${deck.id}") }
            SRow(Icons.Rounded.Edit, stringResource(R.string.renameDeck)) { nav.go("deckEdit/${deck.id}") }
            SRow(Icons.Rounded.TurnRight, stringResource(R.string.moveDeck)) { sheet = "move" }
            SRow(Icons.Rounded.ContentCopy, stringResource(R.string.duplicateDeck)) {
                scope.launch { repo.duplicateDeck(deck.id)?.let { toast(ctx.getString(R.string.saved)); nav.go("deck/${it.id}") } }
            }
            SRow(Icons.Rounded.RestartAlt, stringResource(R.string.resetProgress)) {
                ask(ctx.getString(R.string.resetDeckConfirm, treeCards.size), ctx.getString(R.string.resetProgress), true) {
                    scope.launch { repo.resetProgress(treeCards.map { it.id }); toast(ctx.getString(R.string.saved)) }
                }
            }
            SRow(if (deck.archived) Icons.Rounded.Unarchive else Icons.Rounded.Archive, stringResource(if (deck.archived) R.string.unarchive else R.string.archiveDeck)) {
                scope.launch { repo.saveDeck(deck.copy(archived = !deck.archived)); toast(ctx.getString(R.string.saved)) }
            }
            SRow(Icons.Rounded.Upload, stringResource(R.string.exportDeck)) { sheet = "export" }
            SRow(Icons.Rounded.Delete, stringResource(R.string.deleteDeck), tint = Rose) {
                ask(if (ids.size > 1) ctx.getString(R.string.confirmDeleteDeckTree, deck.title, ids.size - 1, treeCards.size) else ctx.getString(R.string.confirmDeleteDeck, deck.title, own.size), ctx.getString(R.string.delete), true) {
                    scope.launch { repo.deleteDeck(deck.id); toast(ctx.getString(R.string.deleted)); nav.popBackStack(); nav.popBackStack() }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }

    when (sheet) {
        "algo" -> AlgorithmSheet(deck.algorithm, { a -> scope.launch { repo.saveDeck(deck.copy(algorithm = a)); toast(ctx.getString(R.string.saved)) } }) { sheet = "" }
        "preset" -> ModalBottomSheet({ sheet = "" }) {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.preset), style = MaterialTheme.typography.titleLarge)
                Presets.ids.forEach { p ->
                    val cfg = if (p == Presets.CUSTOM) d.settings.customPreset else Presets.builtIn(p)!!
                    YCard(Modifier.fillMaxWidth(), onClick = { scope.launch { repo.saveDeck(deck.copy(preset = p)); sheet = "" } }, padding = 14.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(presetLabel(p)), style = MaterialTheme.typography.titleSmall)
                                Text(stringResource(R.string.presetSummary2, cfg.learningSteps.joinToString(" → ") { fmtMin(it) }, cfg.newPerDay, (cfg.desiredRetention * 100).toInt()), style = Muted)
                            }
                            if (deck.preset == p) Icon(Icons.Rounded.CheckCircle, null, tint = Brand)
                        }
                    }
                }
                TextButton({ sheet = ""; nav.go("presets") }) { Text(stringResource(R.string.customizePresets)) }
            }
        }
        "move" -> ModalBottomSheet({ sheet = "" }) {
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 28.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.moveDeck), style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.folder), style = MaterialTheme.typography.labelLarge)
                MoveTarget("🏠", stringResource(R.string.decks), deck.folderId == null && deck.parentId == null) { scope.launch { repo.saveDeck(deck.copy(folderId = null, parentId = null)); moveKids(repo, d, ids, null); sheet = "" } }
                d.folders.forEach { f -> MoveTarget(f.emoji, f.name, deck.folderId == f.id && deck.parentId == null) { scope.launch { repo.saveDeck(deck.copy(folderId = f.id, parentId = null)); moveKids(repo, d, ids, f.id); sheet = "" } } }
                Text(stringResource(R.string.parentDeck), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
                d.decks.filter { it.id !in ids }.forEach { p ->
                    MoveTarget(p.cover, p.title, deck.parentId == p.id) { scope.launch { repo.saveDeck(deck.copy(parentId = p.id, folderId = p.folderId)); moveKids(repo, d, ids, p.folderId); sheet = "" } }
                }
            }
        }
        "export" -> ModalBottomSheet({ sheet = "" }) {
            Row(Modifier.padding(16.dp).padding(bottom = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("CSV", { sheet = ""; exportCsv.launch(safeName(deck.title) + ".csv") }, Modifier.weight(1f), icon = Icons.Rounded.Description)
                SecondaryButton("JSON", { sheet = ""; exportJson.launch(safeName(deck.title) + ".json") }, Modifier.weight(1f), icon = Icons.Rounded.DataObject)
            }
        }
    }
}

/** Subdecks follow their parent into the new folder. */
private suspend fun moveKids(repo: Repo, d: AppData, ids: Set<String>, folder: String?) {
    d.decks.filter { it.id in ids && it.parentId != null && it.folderId != folder }.forEach { repo.saveDeck(it.copy(folderId = folder)) }
}

fun fmtMin(m: Double) = when { m >= 1440 -> "${(m / 1440).toInt()}d"; m >= 60 -> "${(m / 60).toInt()}h"; else -> "${m.toInt()}m" }

@Composable
private fun MoveTarget(icon: String, label: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (selected) Brand.copy(alpha = 0.1f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f)).clickable(onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(icon); Spacer(Modifier.width(12.dp)); Text(label, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
        if (selected) Icon(Icons.Rounded.Check, null, tint = Brand)
    }
}

@Composable
private fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) = YCard(Modifier.fillMaxWidth(), padding = 4.dp, content = content)

@Composable
private fun SRow(icon: ImageVector, label: String, value: String? = null, tint: Color = MaterialTheme.colorScheme.onSurface, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (tint == MaterialTheme.colorScheme.onSurface) MaterialTheme.colorScheme.onSurfaceVariant else tint)
        Spacer(Modifier.width(14.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = tint)
        if (value != null) Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (tint != Rose) Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

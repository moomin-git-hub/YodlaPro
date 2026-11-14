package uz.yodla.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.Speaker
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Dropdown(label: String, value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(open, { open = it }, modifier) {
        OutlinedTextField(options.firstOrNull { it.first == value }?.second.orEmpty(), {}, readOnly = true, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) }, shape = RoundedCornerShape(16.dp),
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(), singleLine = true)
        ExposedDropdownMenu(open, { open = false }) {
            options.forEach { (v, l) -> DropdownMenuItem({ Text(l) }, { onChange(v); open = false }) }
        }
    }
}

@Composable
fun DeckEditScreen(nav: NavHostController, id: String, folderArg: String?, parentArg: String? = null) {
    val d = appData()
    val repo = Graph.repo
    val existing = d.deck(id)
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    var f by remember { mutableStateOf(existing ?: repo.newDeck("").copy(folderId = folderArg ?: d.deck(parentArg)?.folderId, parentId = parentArg, cover = EMOJIS.take(8).random(), color = DECK_COLORS.take(6).random())) }
    var style by remember { mutableStateOf(f.cardStyle()) }
    var err by remember { mutableStateOf<String?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { runCatching { Files.importImage(ctx, uri, 600) }.onSuccess { f = f.copy(image = it) } }
    }
    if (id != "new" && existing == null) { EmptyState(Icons.Rounded.SearchOff, stringResource(R.string.notFound)); return }
    val sReq = stringResource(R.string.titleRequired)

    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        PageHeader(stringResource(if (existing != null) R.string.editDeck else R.string.manualDeck), onBack = { nav.popBackStack() })
        YCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                DeckCover(f.cover, f.color, f.image, 80.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.title.ifBlank { stringResource(R.string.deckTitlePh) }, style = MaterialTheme.typography.titleLarge, maxLines = 2)
                    Row {
                        TextButton({ pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Icon(Icons.Rounded.AddPhotoAlternate, null); Spacer(Modifier.width(4.dp)); Text(stringResource(R.string.addImage)) }
                        if (f.image.isNotBlank()) TextButton({ f = f.copy(image = "") }) { Text(stringResource(R.string.removeImage)) }
                    }
                }
            }
        }
        YField(f.title, { f = f.copy(title = it.take(100)); err = null }, stringResource(R.string.title), error = err, placeholder = stringResource(R.string.deckTitlePh))
        YField(f.description, { f = f.copy(description = it.take(500)) }, stringResource(R.string.description), placeholder = stringResource(R.string.deckDescPh), minLines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Dropdown(stringResource(R.string.category), f.category, CATEGORIES.map { (c, e) -> c to "$e ${ctx.getString(catLabel(c))}" }, { f = f.copy(category = it) }, Modifier.weight(1f))
            Dropdown(stringResource(R.string.folder), f.folderId, listOf<Pair<String?, String>>(null to ctx.getString(R.string.noFolder)) + d.folders.map { it.id to "${it.emoji} ${it.name}" }, { f = f.copy(folderId = it) }, Modifier.weight(1f))
        }
        val blocked = remember(existing?.id, d.decks) { existing?.let { repo.tree(it.id, d.decks).toSet() } ?: emptySet() }
        Dropdown(stringResource(R.string.parentDeck), f.parentId, listOf<Pair<String?, String>>(null to ctx.getString(R.string.noParent)) + d.decks.filter { it.id !in blocked }.map { it.id to "${it.cover} ${it.title}" },
            { p -> f = f.copy(parentId = p, folderId = d.deck(p)?.folderId ?: f.folderId) })
        Text(stringResource(R.string.cover), style = MaterialTheme.typography.labelLarge)
        YCard(Modifier.fillMaxWidth(), padding = 12.dp) {
            LazyVerticalGrid(GridCells.Fixed(8), Modifier.height(96.dp), userScrollEnabled = false) {
                items(EMOJIS) { e ->
                    Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(10.dp)).background(if (e == f.cover) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface).clickable { f = f.copy(cover = e) }, contentAlignment = Alignment.Center) { Text(e, fontSize = 20.sp) }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DECK_COLORS.forEach { c -> Box(Modifier.weight(1f).height(30.dp).clip(RoundedCornerShape(10.dp)).background(deckBrush(c)).then(if (c == f.color) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, RoundedCornerShape(10.dp)) else Modifier).clickable { f = f.copy(color = c) }) }
            }
        }

        SectionTitle(stringResource(R.string.learningAlgorithm))
        Dropdown(stringResource(R.string.preset), f.preset, Presets.ids.map { it to ctx.getString(presetLabel(it)) }, { f = f.copy(preset = it) })
        TextButton({ nav.navigate("presets") }) { Icon(Icons.Rounded.Tune, null); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.customizePresets)) }

        SectionTitle(stringResource(R.string.cardStyle))
        CardStylePreview(style, f.title.ifBlank { "Aa" })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CardBackgrounds.forEach { (k, v) ->
                Box(Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(10.dp)).background(if (LocalDark.current) v.second else v.first)
                    .border(if (k == style.bg) 3.dp else 1.dp, if (k == style.bg) Brand else MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp)).clickable { style = style.copy(bg = k) })
            }
        }
        Segmented(style.font, listOf("sans" to "Sans", "serif" to "Serif", "mono" to "Mono", "rounded" to "Round"), { style = style.copy(font = it) })
        Segmented(style.size, listOf("s" to "S", "m" to "M", "l" to "L", "xl" to "XL"), { style = style.copy(size = it) })

        SectionTitle(stringResource(R.string.pronunciation))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Dropdown(stringResource(R.string.frontLang), f.ttsFront, Speaker.LANGS, { f = f.copy(ttsFront = it) }, Modifier.weight(1f))
            Dropdown(stringResource(R.string.backLang), f.ttsBack, Speaker.LANGS, { f = f.copy(ttsBack = it) }, Modifier.weight(1f))
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 8.dp)) {
            if (existing != null) SecondaryButton("", {
                val ids = repo.tree(existing.id, d.decks).toSet()
                val n = d.cards.count { it.deckId in ids }
                ask(if (ids.size > 1) ctx.getString(R.string.confirmDeleteDeckTree, existing.title, ids.size - 1, n) else ctx.getString(R.string.confirmDeleteDeck, existing.title, n), ctx.getString(R.string.delete), true) {
                    scope.launch { repo.deleteDeck(existing.id); toast(ctx.getString(R.string.deleted)); nav.popBackStack("decks", false) || nav.popBackStack() }
                }
            }, icon = Icons.Rounded.Delete, color = Rose)
            PrimaryButton(stringResource(R.string.save), {
                if (f.title.isBlank()) { err = sReq; return@PrimaryButton }
                scope.launch {
                    val saved = repo.saveDeck(f.copy(title = f.title.trim(), description = f.description.trim(), style = Json0.encodeToString(CardStyle.serializer(), style)))
                    toast(ctx.getString(R.string.saved))
                    if (existing == null) { nav.popBackStack(); nav.navigate("deck/${saved.id}") } else nav.popBackStack()
                }
            }, Modifier.weight(1f))
        }
        Spacer(Modifier.height(24.dp))
    }
}

fun fontFamily(f: String) = when (f) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; "rounded" -> FontFamily.Cursive; else -> FontFamily.SansSerif }
fun fontScale(s: String) = when (s) { "s" -> 0.85f; "l" -> 1.18f; "xl" -> 1.38f; else -> 1f }

@Composable
fun cardBg(style: CardStyle) = (CardBackgrounds[style.bg] ?: CardBackgrounds.getValue("default")).let { if (LocalDark.current) it.second else it.first }
@Composable
fun cardFg(style: CardStyle) = if (style.bg == "night") androidx.compose.ui.graphics.Color(0xFFF1F1F7) else MaterialTheme.colorScheme.onSurface

@Composable
fun CardStylePreview(style: CardStyle, text: String) {
    Box(Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(24.dp)).background(cardBg(style)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp)), contentAlignment = Alignment.Center) {
        Text(text, fontFamily = fontFamily(style.font), fontSize = (24 * fontScale(style.size)).sp, fontWeight = FontWeight.ExtraBold, color = cardFg(style), maxLines = 2)
    }
}

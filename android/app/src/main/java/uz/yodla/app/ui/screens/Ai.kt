package uz.yodla.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

private val AI_LANGS = listOf("English", "O'zbek", "Русский", "Türkçe", "Español", "Français", "Deutsch", "العربية", "中文", "日本語", "한국어", "हिन्दी")

@Composable
fun AiScreen(nav: NavHostController, deckArg: String?) {
    val d = appData()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) { status = Graph.remote.aiStatus() }
    val ready = status == true
    var mode by remember { mutableStateOf("topic") }
    var topic by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var fileName by remember { mutableStateOf("") }
    var count by remember { mutableFloatStateOf(12f) }
    var lang by remember { mutableStateOf(when (currentLang()) { "uz" -> "O'zbek"; "ru" -> "Русский"; else -> "English" }) }
    var format by remember { mutableStateOf("qa") }
    var detail by remember { mutableStateOf("normal") }
    var instructions by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }
    var drafts by remember { mutableStateOf<List<DraftCard>?>(null) }
    var deckId by remember { mutableStateOf(deckArg ?: "") }
    LaunchedEffect(status) { if (status == false && mode == "topic") mode = "text" }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) { busy = true; err = ""; scope.launch {
            runCatching { Files.extractText(ctx, uri) }.onSuccess { text = it; fileName = uri.lastPathSegment?.substringAfterLast('/').orEmpty(); toast(ctx.getString(R.string.extractedFromFile, it.length)) }.onFailure { err = ctx.getString(R.string.pdfError) }
            busy = false
        } }
    }
    val sTopic = stringResource(R.string.topicRequired); val sShort = stringResource(R.string.textTooShort)

    fun generate(more: Boolean = false) {
        if (mode == "topic" && topic.isBlank()) { err = sTopic; return }
        if (mode != "topic" && text.trim().length < 20) { err = sShort; return }
        err = ""; busy = true
        scope.launch {
            try {
                val extra = if (more && drafts != null) instructions + "\nAvoid these questions already created: " + drafts!!.joinToString("; ") { it.front.take(60) } else instructions
                val cards = Graph.remote.generate(if (mode == "topic") topic.trim() else null, if (mode == "topic") null else text, count.toInt(), lang, format, detail, extra)
                if (cards.isEmpty()) throw ApiException("0 cards", 500)
                drafts = if (more) drafts.orEmpty() + cards else cards
            } catch (e: Throwable) { err = ctx.getString(R.string.aiError, errMessage(ctx, e)) } finally { busy = false }
        }
    }
    fun quick() {
        if (text.trim().length < 20) { err = sShort; return }
        val c = Remote.quickExtract(text)
        if (c.isEmpty()) err = ctx.getString(R.string.parsed, 0) else { err = ""; drafts = c }
    }

    drafts?.let { list ->
        var sel by remember { mutableStateOf(list.indices.toSet()) }
        LaunchedEffect(list.size) { sel = list.indices.toSet() }
        val valid = list.filterIndexed { i, c -> i in sel && c.front.isNotBlank() && (c.back.isNotBlank() || c.type == CardType.CLOZE) }
        Column(Modifier.fillMaxSize()) {
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { PageHeader(stringResource(R.string.reviewGenerated, list.size), onBack = { drafts = null }) { TextButton({ sel = if (sel.size == list.size) emptySet() else list.indices.toSet() }) { Text(stringResource(R.string.all)) } } }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Dropdown(stringResource(R.string.chooseDeck), deckId, d.decks.map { it.id to "${it.cover} ${it.title}" }, { deckId = it }, Modifier.weight(1f))
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton({ nav.navigate("deckEdit/new") }, shape = RoundedCornerShape(14.dp)) { Text(stringResource(R.string.orCreateNew)) }
                    }
                }
                itemsIndexed(list) { i, c ->
                    YCard(Modifier.fillMaxWidth(), padding = 12.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(i in sel, { sel = if (it) sel + i else sel - i })
                            Text("#${i + 1}" + if (c.type == CardType.CLOZE) " · ${stringResource(R.string.cloze)}" else "", style = Muted, modifier = Modifier.weight(1f))
                            IconButton({ drafts = list.filterIndexed { k, _ -> k != i } }) { Icon(Icons.Rounded.Delete, stringResource(R.string.delete), tint = Rose) }
                        }
                        OutlinedTextField(c.front, { v -> drafts = list.mapIndexed { k, x -> if (k == i) x.copy(front = v, type = if (Cloze.indices(v).isNotEmpty()) CardType.CLOZE else CardType.BASIC) else x } }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.front)) }, shape = RoundedCornerShape(14.dp), textStyle = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(c.back, { v -> drafts = list.mapIndexed { k, x -> if (k == i) x.copy(back = v) else x } }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.back)) }, shape = RoundedCornerShape(14.dp), textStyle = MaterialTheme.typography.bodyMedium)
                        if (c.example.isNotBlank() || c.explanation.isNotBlank()) Text(listOf(c.example, c.explanation).filter { it.isNotBlank() }.joinToString(" · "), Modifier.padding(top = 6.dp), style = Muted, maxLines = 3)
                    }
                }
                if (ready) item { SecondaryButton(stringResource(R.string.generateMore), { generate(true) }, Modifier.fillMaxWidth(), icon = Icons.Rounded.AutoAwesome, enabled = !busy) }
                if (busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                if (err.isNotEmpty()) item { Notice(err, Rose) }
            }
            Box(Modifier.padding(16.dp)) {
                PrimaryButton(stringResource(R.string.saveCards, valid.size), {
                    if (deckId.isBlank()) { toast(ctx.getString(R.string.selectDeck)); return@PrimaryButton }
                    scope.launch { Graph.repo.addCards(deckId, valid); toast(ctx.getString(R.string.saveCards, valid.size)); nav.popBackStack(); nav.go("deck/$deckId") }
                }, Modifier.fillMaxWidth(), enabled = valid.isNotEmpty())
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(stringResource(R.string.aiGenerate), stringResource(R.string.aiGenerateSub), onBack = { nav.popBackStack() }) {
            when (status) {
                null -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                true -> Text("✓ " + stringResource(R.string.aiReady), Modifier.clip(RoundedCornerShape(12.dp)).background(Emerald.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp), color = Emerald, style = MaterialTheme.typography.labelMedium)
                false -> {}
            }
        }
        if (status == false) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).border(2.dp, BrandLight, RoundedCornerShape(24.dp)).background(Brand.copy(alpha = 0.05f)).padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Settings, null, tint = Brand); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.aiNotConfigured), style = MaterialTheme.typography.titleMedium) }
            Text(stringResource(if (Graph.repo.cloud) R.string.aiServerSetup else R.string.aiNeedAccount), Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodyMedium)
            Text(stringResource(R.string.aiOffline), Modifier.padding(top = 8.dp), style = Muted)
        }
        Segmented(mode, listOfNotNull(if (status != false) "topic" to stringResource(R.string.aiTopic) else null, "text" to stringResource(R.string.aiText), "file" to stringResource(R.string.aiFile)), { mode = it; err = "" })
        when (mode) {
            "topic" -> YField(topic, { topic = it.take(200) }, stringResource(R.string.aiTopic), placeholder = stringResource(R.string.aiTopicPh))
            "text" -> YField(text, { text = it }, stringResource(R.string.aiText), placeholder = stringResource(R.string.aiTextPh), minLines = 8, supporting = "${text.length} / 60000")
            else -> {
                Box(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                    .clickable(enabled = !busy) { pickFile.launch(arrayOf("application/pdf", "text/plain", "text/markdown", "text/*")) }, contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        if (busy) CircularProgressIndicator() else Icon(Icons.Rounded.PictureAsPdf, null, Modifier.size(36.dp), tint = Brand)
                        Text(fileName.ifBlank { stringResource(R.string.aiUpload) }, style = MaterialTheme.typography.titleSmall)
                        if (text.isNotEmpty()) Text(stringResource(R.string.extractedFromFile, text.length), style = Muted)
                    }
                }
                if (text.isNotEmpty()) YField(text, { text = it }, stringResource(R.string.aiText), minLines = 5)
            }
        }
        if (ready) {
            Text("${stringResource(R.string.numberOfCards)}: ${count.toInt()}", style = MaterialTheme.typography.labelLarge)
            Slider(count, { count = it }, valueRange = 5f..50f, steps = 44)
            Dropdown(stringResource(R.string.cardLanguage), lang, AI_LANGS.map { it to it }, { lang = it })
            Text(stringResource(R.string.cardFormat), style = MaterialTheme.typography.labelLarge)
            Segmented(format, listOf("qa" to stringResource(R.string.formatQa), "cloze" to stringResource(R.string.cloze), "both" to stringResource(R.string.formatBoth)), { format = it })
            Text(stringResource(R.string.detailLevel), style = MaterialTheme.typography.labelLarge)
            Segmented(detail, listOf("brief" to stringResource(R.string.detailBrief), "normal" to stringResource(R.string.detailNormal), "detailed" to stringResource(R.string.detailDetailed)), { detail = it })
            YField(instructions, { instructions = it.take(500) }, stringResource(R.string.aiInstructions), placeholder = stringResource(R.string.aiInstructionsPh), minLines = 2)
        }
        if (err.isNotEmpty()) Notice(err, Rose)
        if (ready) PrimaryButton(stringResource(if (busy) R.string.generating else R.string.generate), { generate() }, Modifier.fillMaxWidth(), loading = busy, icon = Icons.Rounded.AutoAwesome)
        if (mode != "topic") SecondaryButton(stringResource(R.string.quickExtract), ::quick, Modifier.fillMaxWidth(), icon = Icons.Rounded.AutoFixHigh, enabled = !busy)
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
fun ImportScreen(nav: NavHostController, deckArg: String?) {
    val d = appData()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var deckId by remember { mutableStateOf(deckArg ?: "") }
    var text by remember { mutableStateOf("") }
    val parsed = remember(text) { Files.parseImport(text) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) runCatching { text = Files.readText(ctx, uri) }.onFailure { toast(ctx.getString(R.string.pdfError)) } }
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(stringResource(R.string.importTitle), onBack = { nav.popBackStack() })
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dropdown(stringResource(R.string.chooseDeck), deckId, d.decks.map { it.id to "${it.cover} ${it.title}" }, { deckId = it }, Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            OutlinedButton({ nav.navigate("deckEdit/new") }, shape = RoundedCornerShape(14.dp)) { Text(stringResource(R.string.orCreateNew)) }
        }
        Text(stringResource(R.string.importHelp), style = Muted)
        YField(text, { text = it }, stringResource(R.string.importPaste), minLines = 8, placeholder = "photosynthesis, process plants use…\nmitochondria; powerhouse of the cell")
        Row(verticalAlignment = Alignment.CenterVertically) {
            SecondaryButton(stringResource(R.string.chooseFile), { pick.launch(arrayOf("text/*", "application/json", "text/csv", "text/comma-separated-values", "text/tab-separated-values")) }, icon = Icons.Rounded.FileOpen)
            Spacer(Modifier.weight(1f))
            Text(stringResource(R.string.parsed, parsed.size), style = MaterialTheme.typography.labelLarge)
        }
        if (parsed.isNotEmpty()) YCard(Modifier.fillMaxWidth(), padding = 12.dp) {
            parsed.take(30).forEach { c -> Text("${Cloze.plain(c.front)} — ${c.back}", style = MaterialTheme.typography.bodySmall, maxLines = 1, modifier = Modifier.padding(vertical = 3.dp)) }
        }
        PrimaryButton("${stringResource(R.string.import_)} ${parsed.size.takeIf { it > 0 } ?: ""}", {
            if (deckId.isBlank()) { toast(ctx.getString(R.string.selectDeck)); return@PrimaryButton }
            scope.launch { Graph.repo.addCards(deckId, parsed.take(5000)); toast(ctx.getString(R.string.importedN, parsed.size)); nav.popBackStack(); nav.go("deck/$deckId") }
        }, Modifier.fillMaxWidth(), enabled = parsed.isNotEmpty())
    }
}

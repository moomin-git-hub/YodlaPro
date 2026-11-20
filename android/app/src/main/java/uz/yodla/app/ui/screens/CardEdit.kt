package uz.yodla.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.DateFormat

@Composable
fun CardEditScreen(nav: NavHostController, id: String, deckArg: String?, typeArg: String?) {
    val d = appData()
    val repo = Graph.repo
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    val card = if (id == "new") null else d.cards.firstOrNull { it.id == id }
    if (id != "new" && card == null) { Column(Modifier.padding(16.dp)) { PageHeader("", onBack = { nav.popBackStack() }); EmptyState(Icons.Rounded.SearchOff, stringResource(R.string.notFound)) }; return }

    val lastDeck = remember { ctx.getSharedPreferences("ui", 0).getString("lastDeck", null) }
    var deckId by remember { mutableStateOf(card?.deckId ?: deckArg ?: lastDeck?.takeIf { l -> d.decks.any { it.id == l } } ?: d.decks.singleOrNull()?.id ?: "") }
    var type by remember { mutableStateOf((card?.type ?: typeArg ?: CardType.BASIC).let { if (it == CardType.REVERSE) CardType.BASIC else it }) }
    var front by remember { mutableStateOf(TextFieldValue(card?.front.orEmpty())) }
    var back by remember { mutableStateOf(TextFieldValue(card?.back.orEmpty())) }
    var example by remember { mutableStateOf(card?.example.orEmpty()) }
    var explanation by remember { mutableStateOf(card?.explanation.orEmpty()) }
    var image by remember { mutableStateOf(card?.image.orEmpty()) }
    var occ by remember { mutableStateOf(card?.takeIf { it.type == CardType.OCCLUSION }?.occlusion() ?: Occlusion()) }
    var selMask by remember { mutableStateOf<String?>(null) }
    var flags by remember { mutableStateOf(Triple(card?.difficult ?: false, card?.bookmarked ?: false, card?.frozen ?: false)) }
    var reversed by remember { mutableStateOf(card?.let { repo.hasReverse(it) } ?: false) }
    var focus by remember { mutableStateOf("front") }
    var errs by remember { mutableStateOf(mapOf<String, String>()) }
    var busyImg by remember { mutableStateOf(false) }
    var detecting by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf(false) }
    val noteId = remember { card?.noteId ?: uid() }
    val frontEd = remember { RichEditorState() }
    val backEd = remember { RichEditorState() }
    val sNeedServer = stringResource(R.string.aiNeedsServer)
    val esc = { t: String -> t.replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br>") }
    /** ✨ in the editor toolbar: let the server's AI fill in or improve this card. */
    val aiFor: (String) -> (suspend (String) -> Unit) = { side -> { action ->
        if (!repo.cloud) toast(sNeedServer) else {
            val act = if (action == "answer" && side == "front" && isBlankRich(front.text)) "question" else action
            runCatching { Graph.remote.assist(front.text, back.text, act) }.onSuccess { (text, f2, b2) ->
                when (act) {
                    "improve" -> { if (f2.isNotBlank()) { front = TextFieldValue(esc(f2)); frontEd.setHtml(esc(f2)) }; if (b2.isNotBlank()) { back = TextFieldValue(esc(b2)); backEd.setHtml(esc(b2)) } }
                    "example" -> example = text
                    "explanation" -> explanation = text
                    "question" -> { front = TextFieldValue(esc(text)); frontEd.setHtml(esc(text)) }
                    else -> { back = TextFieldValue(esc(text)); backEd.setHtml(esc(text)) }
                }
            }.onFailure { toast(errMessage(ctx, it)) }
        }
    } }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) { busyImg = true; scope.launch { runCatching { Files.importImage(ctx, uri) }.onSuccess { image = it; if (type == CardType.OCCLUSION) { occ = occ.copy(masks = emptyList()); selMask = null } }.onFailure { toast(ctx.getString(R.string.pdfError)) }; busyImg = false } }
    }
    val dup = remember(deckId, front.text, type) { if (type == CardType.OCCLUSION) null else repo.duplicateOf(deckId, front.text, card?.noteId) }

    val sDeck = stringResource(R.string.selectDeck); val sReq = stringResource(R.string.required)
    val sCloze = stringResource(R.string.clozeRequired); val sMasks = stringResource(R.string.masksRequired); val sImg = stringResource(R.string.imageRequired)

    fun insert(field: String, before: String, after: String = "", placeholder: String = "") {
        val v = if (field == "back") back else front
        val sel = v.selection
        val inner = v.text.substring(sel.min, sel.max).ifEmpty { placeholder }
        val text = v.text.substring(0, sel.min) + before + inner + after + v.text.substring(sel.max)
        val nv = TextFieldValue(text, TextRange(sel.min + before.length, sel.min + before.length + inner.length))
        if (field == "back") back = nv else front = nv
    }

    fun save(again: Boolean) {
        val e = mutableMapOf<String, String>()
        if (deckId.isBlank()) e["deck"] = sDeck
        when (type) {
            CardType.CLOZE -> if (Cloze.indices(front.text).isEmpty()) e["front"] = sCloze
            CardType.OCCLUSION -> { if (image.isBlank()) e["image"] = sImg else if (occ.masks.isEmpty()) e["image"] = sMasks }
            else -> { if (isBlankRich(front.text)) e["front"] = sReq; if (isBlankRich(back.text)) e["back"] = sReq }
        }
        errs = e
        if (e.isNotEmpty()) return
        ctx.getSharedPreferences("ui", 0).edit().putString("lastDeck", deckId).apply()
        val base = ((card?.let { c -> repo.noteOf(c).firstOrNull { it.type == CardType.BASIC } ?: c }) ?: repo.blankCard(deckId, noteId)).copy(
            deckId = deckId, noteId = noteId, type = type, front = front.text, back = back.text, example = example, explanation = explanation, image = image,
            extra = if (type == CardType.OCCLUSION) Json0.encodeToString(Occlusion.serializer(), occ) else card?.extra.orEmpty(),
            difficult = flags.first, bookmarked = flags.second, frozen = flags.third,
        )
        scope.launch {
            val saved = repo.saveNote(base, reversed = if (type == CardType.BASIC) reversed else null)
            toast(ctx.getString(if (card == null) R.string.cardAddedN else R.string.saved, saved.size))
            if (again) { front = TextFieldValue(""); back = TextFieldValue(""); example = ""; explanation = ""; image = ""; occ = Occlusion(); selMask = null; nav.popBackStack(); nav.navigate("card/new?deck=$deckId&type=$type") }
            else nav.popBackStack()
        }
    }

    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(if (card != null) "(${repo.noteOf(card).size}) " + stringResource(R.string.editCards) else stringResource(R.string.addCard), onBack = { nav.popBackStack() }) {
            IconButton({ preview = !preview }) { Icon(if (preview) Icons.Rounded.EditNote else Icons.Rounded.Visibility, stringResource(R.string.preview)) }
        }
        if (card == null) Segmented(type, listOf(CardType.BASIC to stringResource(R.string.typeBasic), CardType.CLOZE to stringResource(R.string.cloze), CardType.OCCLUSION to stringResource(R.string.imageOcclusion)), { type = it; errs = emptyMap() })

        Row(verticalAlignment = Alignment.CenterVertically) {
            Dropdown(stringResource(R.string.chooseDeck), deckId, d.decks.map { it.id to "${it.cover} ${it.title}" }, { deckId = it }, Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            OutlinedButton({ nav.navigate("deckEdit/new") }, shape = RoundedCornerShape(14.dp)) { Text(stringResource(R.string.orCreateNew)) }
        }
        errs["deck"]?.let { Text(it, color = Rose, style = MaterialTheme.typography.bodySmall) }

        if (preview) {
            CardPreview(type, front.text, back.text, example, explanation, image, occ, d.deck(deckId)?.cardStyle() ?: CardStyle())
        } else when (type) {
            CardType.OCCLUSION -> {
                if (image.isBlank()) {
                    Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, if (errs["image"] != null) Rose else MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                        .clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            if (busyImg) CircularProgressIndicator() else Icon(Icons.Rounded.AddPhotoAlternate, null, Modifier.size(40.dp), tint = Brand)
                            Text(stringResource(R.string.occlusionPick), style = MaterialTheme.typography.titleSmall)
                            Text(stringResource(R.string.occlusionPickSub), style = Muted)
                        }
                    }
                } else {
                    Text(stringResource(R.string.occlusionHelp), style = Muted)
                    OcclusionEditorCanvas(image, occ.masks, selMask, { occ = occ.copy(masks = it) }, { selMask = it })
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip({
                            detecting = true
                            scope.launch {
                                val found = runCatching { detectLabelMasks(ctx, image) }.getOrDefault(emptyList())
                                if (found.isEmpty()) toast(ctx.getString(R.string.noLabelsFound)) else { occ = occ.copy(masks = occ.masks + found); toast(ctx.getString(R.string.masksAdded, found.size)) }
                                detecting = false
                            }
                        }, { Text(stringResource(R.string.autoDetect)) }, leadingIcon = { if (detecting) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(18.dp)) })
                        AssistChip({ selMask?.let { m -> occ = occ.copy(masks = occ.masks.filter { it.id != m }); selMask = null } }, { Text(stringResource(R.string.deleteMask)) }, enabled = selMask != null, leadingIcon = { Icon(Icons.Rounded.Delete, null, Modifier.size(18.dp)) })
                        AssistChip({ if (occ.masks.isNotEmpty()) occ = occ.copy(masks = occ.masks.dropLast(1)) }, { Text(stringResource(R.string.undo)) }, leadingIcon = { Icon(Icons.Rounded.Undo, null, Modifier.size(18.dp)) })
                        AssistChip({ occ = occ.copy(masks = emptyList()); selMask = null }, { Text(stringResource(R.string.clear)) }, leadingIcon = { Icon(Icons.Rounded.ClearAll, null, Modifier.size(18.dp)) })
                        AssistChip({ pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, { Text(stringResource(R.string.changeImage)) }, leadingIcon = { Icon(Icons.Rounded.Image, null, Modifier.size(18.dp)) })
                    }
                    Segmented(occ.mode, listOf("all" to stringResource(R.string.hideAllGuessOne), "one" to stringResource(R.string.hideOneGuessOne)), { occ = occ.copy(mode = it) })
                    Text(stringResource(R.string.masksCount, occ.masks.size), style = Muted)
                }
                errs["image"]?.let { Text(it, color = Rose, style = MaterialTheme.typography.bodySmall) }
                YField(front.text, { front = TextFieldValue(it) }, stringResource(R.string.occlusionHeader), placeholder = stringResource(R.string.occlusionHeaderPh))
                YField(back.text, { back = TextFieldValue(it) }, stringResource(R.string.backExtra), minLines = 2)
            }
            CardType.BASIC -> {
                Text(stringResource(R.string.front), style = MaterialTheme.typography.labelLarge)
                RichEditor(front.text, { front = TextFieldValue(it); errs = errs - "front" }, stringResource(R.string.frontPh), big = true, error = errs["front"] != null, state = frontEd, onAi = aiFor("front"))
                errs["front"]?.let { Text(it, color = Rose, style = MaterialTheme.typography.bodySmall) }
                if (dup != null) Notice(stringResource(R.string.duplicateWarning), Amber)
                Text(stringResource(R.string.back), style = MaterialTheme.typography.labelLarge)
                RichEditor(back.text, { back = TextFieldValue(it); errs = errs - "back" }, stringResource(R.string.backPh), error = errs["back"] != null, state = backEd, onAi = aiFor("back"))
                errs["back"]?.let { Text(it, color = Rose, style = MaterialTheme.typography.bodySmall) }
                YField(example, { example = it }, stringResource(R.string.example), placeholder = stringResource(R.string.examplePh), minLines = 2)
                YField(explanation, { explanation = it }, stringResource(R.string.explanation), placeholder = stringResource(R.string.explanationPh), minLines = 2)
                if (image.isNotBlank()) Box {
                    AsyncImage(image, null, Modifier.heightIn(max = 200.dp).clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.Fit)
                    IconButton({ image = "" }, Modifier.align(Alignment.TopEnd).padding(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f))) { Icon(Icons.Rounded.Close, stringResource(R.string.removeImage), tint = Color.White) }
                }
                ToggleRow(Icons.Rounded.SwapHoriz, Brand, stringResource(R.string.alsoReversed), reversed) { reversed = it }
            }
            else -> {
                val canSwitch = card == null
                fun makeBlank() {
                    if (type == CardType.CLOZE) { val n = Cloze.nextIndex(front.text); insert("front", "{{c$n::", "}}", "…"); return }
                    // basic -> cloze: answer becomes the blank
                    val q = front.text.trim(); val a = back.text.trim()
                    val t = when { a.isNotEmpty() && q.isNotEmpty() -> "$q\n{{c1::$a}}"; a.isNotEmpty() -> "{{c1::$a}}"; else -> q }
                    front = TextFieldValue(t, TextRange(t.length)); back = TextFieldValue(""); type = CardType.CLOZE; errs = emptyMap(); focus = "front"
                }
                FormatBar(canSwitch || type == CardType.CLOZE, canSwitch, onCloze = { makeBlank() }, onOcc = { type = CardType.OCCLUSION; errs = emptyMap() }) { b, a, p -> insert(focus, b, a, p) }
                OutlinedTextField(front, { front = it }, Modifier.fillMaxWidth().onFocusChanged { if (it.isFocused) focus = "front" },
                    label = { Text(stringResource(if (type == CardType.CLOZE) R.string.clozeText else R.string.front)) }, minLines = 3, isError = errs["front"] != null,
                    placeholder = { Text(stringResource(if (type == CardType.CLOZE) R.string.clozePh else R.string.frontPh)) }, shape = RoundedCornerShape(16.dp),
                    supportingText = { Text(errs["front"] ?: if (type == CardType.CLOZE) stringResource(R.string.clozeHelp, Cloze.indices(front.text).size) else "") },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
                if (dup != null) Notice(stringResource(R.string.duplicateWarning), Amber)
                if (type != CardType.CLOZE) FormatBar(canSwitch, canSwitch, onCloze = { makeBlank() }, onOcc = { type = CardType.OCCLUSION; errs = emptyMap() }) { b, a, p -> insert("back", b, a, p) }
                OutlinedTextField(back, { back = it }, Modifier.fillMaxWidth().onFocusChanged { if (it.isFocused) focus = "back" },
                    label = { Text(stringResource(if (type == CardType.CLOZE) R.string.backExtra else R.string.back)) }, minLines = if (type == CardType.CLOZE) 2 else 3, isError = errs["back"] != null,
                    placeholder = { Text(stringResource(R.string.backPh)) }, shape = RoundedCornerShape(16.dp), supportingText = errs["back"]?.let { { Text(it) } })
                YField(example, { example = it }, stringResource(R.string.example), placeholder = stringResource(R.string.examplePh), minLines = 2)
                YField(explanation, { explanation = it }, stringResource(R.string.explanation), placeholder = stringResource(R.string.explanationPh), minLines = 2)
                if (image.isNotBlank()) Box {
                    AsyncImage(image, null, Modifier.heightIn(max = 200.dp).clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.Fit)
                    IconButton({ image = "" }, Modifier.align(Alignment.TopEnd).padding(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f))) { Icon(Icons.Rounded.Close, stringResource(R.string.removeImage), tint = Color.White) }
                } else SecondaryButton(stringResource(R.string.addImage), { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.fillMaxWidth(), icon = Icons.Rounded.AddPhotoAlternate)
            }
        }

        YCard(Modifier.fillMaxWidth(), padding = 4.dp) {
            ToggleRow(Icons.Rounded.Warning, Rose, stringResource(R.string.markDifficult), flags.first) { flags = flags.copy(first = it) }
            ToggleRow(Icons.Rounded.Bookmark, Amber, stringResource(R.string.bookmark), flags.second) { flags = flags.copy(second = it) }
            ToggleRow(Icons.Rounded.AcUnit, Sky, stringResource(R.string.freezeCard), flags.third) { flags = flags.copy(third = it) }
        }

        if (card != null && card.status != Status.NEW) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    R.string.nextReview to if (card.due <= now()) stringResource(R.string.today) else DateFormat.getDateInstance(DateFormat.MEDIUM).format(card.due),
                    R.string.interval to Srs.formatDuration((card.interval * DAY_MS).toLong()), R.string.ease to "%.2f".format(card.ease), R.string.lapses to "${card.lapses}",
                ).forEach { (l, v) ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f)).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(v, style = MaterialTheme.typography.labelLarge, maxLines = 1); Text(stringResource(l), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
        }
        if (card != null) {
            val history = d.reviews.filter { it.cardId == card.id }.sortedByDescending { it.ts }
            if (history.isNotEmpty()) {
                SectionTitle(stringResource(R.string.cardHistory) + " · ${history.size}")
                YCard(Modifier.fillMaxWidth(), padding = 12.dp) {
                    history.take(30).forEach { r ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            val (lbl, col) = ratingInfo(r.rating)
                            Text(stringResource(lbl), Modifier.width(72.dp).clip(RoundedCornerShape(8.dp)).background(col.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 2.dp), color = col, style = MaterialTheme.typography.labelMedium)
                            Spacer(Modifier.width(10.dp))
                            Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(r.ts), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            Text("→ " + Srs.formatDuration((r.newInterval * DAY_MS).toLong().coerceAtLeast(MIN_MS)), style = Muted)
                        }
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (card != null) {
                SecondaryButton("", {
                    val ids = repo.noteOf(card).map { it.id }
                    ask(ctx.getString(R.string.confirmDeleteCards, ids.size), ctx.getString(R.string.delete), true) { scope.launch { repo.deleteCards(ids); toast(ctx.getString(R.string.deleted)); nav.popBackStack() } }
                }, icon = Icons.Rounded.Delete, color = Rose)
                PrimaryButton(stringResource(R.string.save), { save(false) }, Modifier.weight(1f))
            } else {
                SecondaryButton(stringResource(R.string.saveAndAdd), { save(true) }, Modifier.weight(1f))
                PrimaryButton(stringResource(R.string.save), { save(false) }, Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

fun ratingInfo(r: Int) = when (r) { 1 -> R.string.again to Rose; 2 -> R.string.hard to Amber; 3 -> R.string.good to Emerald; else -> R.string.easy to Sky }

@Composable
fun ToggleRow(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(12.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        Switch(checked, onChange)
    }
}

@Composable
private fun FormatBar(showCloze: Boolean, showOcc: Boolean, onCloze: () -> Unit, onOcc: () -> Unit, insert: (String, String, String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (showCloze) FilledTonalButton(onCloze, shape = RoundedCornerShape(12.dp)) { Text("[…] " + stringResource(R.string.makeCloze), fontWeight = FontWeight.Bold) }
        if (showOcc) FilledTonalButton(onOcc, shape = RoundedCornerShape(12.dp)) { Icon(Icons.Rounded.AddPhotoAlternate, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.imageOcclusion), fontWeight = FontWeight.Bold) }
        listOf(Triple(Icons.Rounded.FormatBold, "**", "**"), Triple(Icons.Rounded.FormatItalic, "*", "*"), Triple(Icons.Rounded.Code, "`", "`")).forEach { (ic, b, a) ->
            FilledTonalIconButton({ insert(b, a, "") }) { Icon(ic, null) }
        }
        FilledTonalButton({ insert("$", "$", "x^2") }, shape = RoundedCornerShape(12.dp)) { Text("∑ LaTeX") }
        FilledTonalButton({ insert("```\n", "\n```", "code") }, shape = RoundedCornerShape(12.dp)) { Text("{ } " + stringResource(R.string.codeBlock)) }
        FilledTonalIconButton({ insert("[", "](https://)", "link") }) { Icon(Icons.Rounded.Link, null) }
    }
}

@Composable
fun CardPreview(type: String, front: String, back: String, example: String, explanation: String, image: String, occ: Occlusion, style: CardStyle) {
    var flipped by remember { mutableStateOf(false) }
    val idx = Cloze.indices(front).firstOrNull() ?: 1
    val previewOcc = occ.copy(t = occ.masks.firstOrNull()?.id.orEmpty())
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cardBg(style)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(28.dp)).clickable { flipped = !flipped }.padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(stringResource(if (flipped) R.string.back else R.string.front), style = Muted)
        Spacer(Modifier.height(8.dp))
        CardFace(type, front, back, example, explanation, image, previewOcc, idx, flipped, style)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.tapToFlip), style = Muted)
    }
}

/** Renders one side of any card type; shared by study, preview and public deck preview. */
@Composable
fun CardFace(type: String, front: String, back: String, example: String, explanation: String, image: String, occ: Occlusion, clozeIdx: Int, revealed: Boolean, style: CardStyle) {
    val fam = fontFamily(style.font); val sc = fontScale(style.size); val fg = cardFg(style)
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        when (type) {
            CardType.OCCLUSION -> {
                if (front.isNotBlank()) { RichText(front, size = (18 * sc).sp(), weight = FontWeight.Bold, center = true, color = fg, family = fam); Spacer(Modifier.height(10.dp)) }
                OcclusionView(image, occ, revealed)
                if (revealed && back.isNotBlank()) { Spacer(Modifier.height(12.dp)); RichText(back, size = (16 * sc).sp(), center = true, color = fg, family = fam) }
            }
            CardType.CLOZE -> {
                if (image.isNotBlank()) { AsyncImage(image, null, Modifier.heightIn(max = 180.dp).clip(RoundedCornerShape(16.dp))); Spacer(Modifier.height(12.dp)) }
                RichText(if (revealed) Cloze.back(front, clozeIdx) else Cloze.front(front, clozeIdx), size = (22 * sc).sp(), weight = FontWeight.Bold, center = true, color = fg, family = fam)
                if (revealed && back.isNotBlank()) { Divider(); RichText(back, size = (16 * sc).sp(), center = true, color = fg, family = fam) }
            }
            else -> {
                if (image.isNotBlank()) { AsyncImage(image, null, Modifier.heightIn(max = 200.dp).clip(RoundedCornerShape(16.dp))); Spacer(Modifier.height(12.dp)) }
                if (!revealed) RichText(front, size = (26 * sc).sp(), weight = FontWeight.ExtraBold, center = true, color = fg, family = fam)
                else {
                    RichText(front, size = (16 * sc).sp(), weight = FontWeight.SemiBold, center = true, color = fg.copy(alpha = 0.55f), family = fam)
                    Divider()
                    RichText(back, size = (23 * sc).sp(), weight = FontWeight.ExtraBold, center = true, color = if (style.bg == "night") BrandLight else MaterialTheme.colorScheme.primary, family = fam)
                }
            }
        }
        if (revealed && example.isNotBlank()) {
            Spacer(Modifier.height(14.dp))
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(fg.copy(alpha = 0.05f)).padding(14.dp)) {
                RichText("“$example”", size = (15 * sc).sp(), color = fg, family = fam)
            }
        }
        if (revealed && explanation.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Amber.copy(alpha = 0.12f)).padding(14.dp)) {
                Icon(Icons.Rounded.Lightbulb, null, tint = Amber, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                RichText(explanation, size = (14 * sc).sp(), color = fg, family = fam)
            }
        }
    }
}

@Composable private fun Divider() = Box(Modifier.padding(vertical = 14.dp).width(64.dp).height(1.dp).background(MaterialTheme.colorScheme.outline))
private fun Float.sp() = androidx.compose.ui.unit.TextUnit(this, androidx.compose.ui.unit.TextUnitType.Sp)
private fun Int.sp() = this.toFloat().sp()

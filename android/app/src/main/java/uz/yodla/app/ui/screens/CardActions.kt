package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.DateFormat
import kotlin.math.roundToInt

/**
 * Noji-style card menu: Select · Edit · Freeze · Move · Reverse/Unreverse · Duplicate · Learning history · Delete.
 * [onChanged] gets true when the card left the current context (frozen, moved, deleted).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardActionsSheet(card: Card, nav: NavHostController, onDismiss: () -> Unit, onChanged: (Boolean) -> Unit = {}, onSelect: (() -> Unit)? = null, inStudy: Boolean = false) {
    val repo = Graph.repo
    val d = appData()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    var page by remember { mutableStateOf("menu") }
    val reversed = repo.hasReverse(card)
    val canReverse = card.type == CardType.BASIC || card.type == CardType.REVERSE

    ModalBottomSheet(onDismiss, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (page) {
                "menu" -> {
                    if (onSelect != null) Action(Icons.Rounded.CheckCircleOutline, stringResource(R.string.select)) { onDismiss(); onSelect() }
                    Action(Icons.Rounded.Edit, stringResource(R.string.edit)) { onDismiss(); nav.navigate("card/${card.id}") }
                    Action(if (card.frozen) Icons.Rounded.PlayArrow else Icons.Rounded.Pause, stringResource(if (card.frozen) R.string.unfreeze else R.string.freeze)) {
                        scope.launch { repo.updateCard(card.id) { it.copy(frozen = !it.frozen) }; toast(ctx.getString(R.string.saved)); onDismiss(); onChanged(!card.frozen) }
                    }
                    Action(Icons.Rounded.TurnRight, stringResource(R.string.move)) { page = "move" }
                    if (canReverse) Action(Icons.Rounded.SwapHoriz, stringResource(if (reversed) R.string.unreverse else R.string.reverse)) {
                        scope.launch {
                            repo.setReversed(card, !reversed); toast(ctx.getString(R.string.saved)); onDismiss()
                            onChanged(reversed && card.type == CardType.REVERSE)
                        }
                    }
                    Action(Icons.Rounded.ContentCopy, stringResource(R.string.duplicate)) {
                        scope.launch { repo.duplicateNote(card); toast(ctx.getString(R.string.saved)); onDismiss() }
                    }
                    Action(Icons.Rounded.History, stringResource(R.string.cardHistory)) { page = "history" }
                    Action(Icons.Rounded.Delete, stringResource(R.string.delete), Rose) {
                        ask(ctx.getString(R.string.confirmDeleteCards, 1), ctx.getString(R.string.delete), true) {
                            scope.launch { repo.deleteCards(listOf(card.id)); toast(ctx.getString(R.string.deleted)); onDismiss(); onChanged(true) }
                        }
                    }
                }
                "move" -> {
                    Text(stringResource(R.string.chooseDeck), style = MaterialTheme.typography.titleLarge)
                    LazyColumn(Modifier.heightIn(max = 440.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(d.decks.filter { it.id != card.deckId }, key = { it.id }) { x ->
                            YCard(Modifier.fillMaxWidth(), onClick = {
                                scope.launch { repo.moveCards(repo.noteOf(card).map { it.id }, x.id); toast(ctx.getString(R.string.saved)); onDismiss(); onChanged(!inStudy) }
                            }, padding = 10.dp) {
                                Row(verticalAlignment = Alignment.CenterVertically) { DeckCover(x.cover, x.color, x.image, 38.dp); Spacer(Modifier.width(10.dp)); Text(x.title, fontWeight = FontWeight.Bold) }
                            }
                        }
                    }
                }
                else -> LearningHistory(card, d)
            }
        }
    }
}

@Composable
private fun Action(icon: ImageVector, label: String, tint: Color = MaterialTheme.colorScheme.onSurface, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)).clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = tint); Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.titleMedium, color = tint)
    }
}

/** Per-card memory details + every answer with its scheduled interval. */
@Composable
fun LearningHistory(card: Card, d: AppData) {
    val logs = remember(d.reviews, card.id) { d.reviews.filter { it.cardId == card.id }.sortedByDescending { it.ts } }
    Text(stringResource(R.string.cardHistory), style = MaterialTheme.typography.titleLarge)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val r = Srs.recallProbability(card)
        listOfNotNull(
            stringResource(R.string.status) to stringResource(when { card.frozen -> R.string.frozen; card.status == Status.NEW -> R.string.newCards; Srs.isMastered(card) -> R.string.mastered; else -> R.string.learning }),
            stringResource(R.string.nextReview) to if (card.status == Status.NEW) "—" else if (card.due <= now()) stringResource(R.string.today) else Srs.formatDuration(card.due - now()),
            if (card.stability > 0) stringResource(R.string.stability) to Srs.formatDuration((card.stability * DAY_MS).toLong()) else stringResource(R.string.ease) to "%.2f".format(card.ease),
            r?.let { stringResource(R.string.recall) to "${(it * 100).roundToInt()}%" } ?: (stringResource(R.string.lapses) to "${card.lapses}"),
        ).forEach { (l, v) ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(v, style = MaterialTheme.typography.labelLarge, maxLines = 1); Text(l, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
    }
    if (logs.isEmpty()) Text(stringResource(R.string.noHistory), style = Muted, modifier = Modifier.padding(vertical = 16.dp))
    LazyColumn(Modifier.heightIn(max = 380.dp)) {
        items(logs, key = { it.id }) { r ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                val (lbl, col) = ratingInfo(r.rating)
                Text(stringResource(lbl), Modifier.width(76.dp).clip(RoundedCornerShape(8.dp)).background(col.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp), color = col, style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.width(10.dp))
                Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(r.ts), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                Text(if (r.newInterval > 0) "→ " + Srs.formatDuration((r.newInterval * DAY_MS).toLong()) else "→ <1d", style = Muted)
            }
        }
    }
}

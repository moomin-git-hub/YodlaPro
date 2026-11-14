package uz.yodla.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import uz.yodla.app.R
import uz.yodla.app.ui.theme.*

val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

@Composable
fun YCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, padding: Dp = 16.dp, shape: RoundedCornerShape = RoundedCornerShape(24.dp), content: @Composable ColumnScope.() -> Unit) {
    val c = MaterialTheme.colorScheme
    Column(
        modifier
            .clip(shape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = 0.7f), shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(padding),
        content = content,
    )
}

@Composable
fun Ring(value: Float, size: Dp = 110.dp, stroke: Dp = 11.dp, color: Color = MaterialTheme.colorScheme.primary, track: Color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f), content: @Composable () -> Unit = {}) {
    val v by animateFloatAsState(value.coerceIn(0f, 1f), tween(800), label = "ring")
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx()
            drawArc(track, 0f, 360f, false, topLeft = androidx.compose.ui.geometry.Offset(s / 2, s / 2), size = androidx.compose.ui.geometry.Size(this.size.width - s, this.size.height - s), style = Stroke(s))
            drawArc(color, -90f, 360f * v, false, topLeft = androidx.compose.ui.geometry.Offset(s / 2, s / 2), size = androidx.compose.ui.geometry.Size(this.size.width - s, this.size.height - s), style = Stroke(s, cap = StrokeCap.Round))
        }
        content()
    }
}

@Composable
fun Bars(values: List<Int>, labels: List<String>, height: Dp = 110.dp, highlightLast: Boolean = true, format: (Int) -> String = { it.toString() }) {
    val max = (values.maxOrNull() ?: 0).coerceAtLeast(1)
    var sel by remember { mutableStateOf<Int?>(null) }
    val c = MaterialTheme.colorScheme
    Column {
        Box(Modifier.fillMaxWidth().height(18.dp)) {
            sel?.let { Text(labels.getOrNull(it).orEmpty().ifBlank { "#${it + 1}" } + ": " + format(values[it]), style = MaterialTheme.typography.labelMedium, color = c.primary) }
        }
        Row(Modifier.fillMaxWidth().height(height), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.Bottom) {
            values.forEachIndexed { i, v ->
                val frac by animateFloatAsState(if (v == 0) 0f else (v.toFloat() / max).coerceAtLeast(0.06f), tween(600), label = "bar")
                Box(
                    Modifier.weight(1f).fillMaxHeight().clickable { sel = if (sel == i) null else i },
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    Box(
                        Modifier.fillMaxWidth().then(if (v == 0) Modifier.height(4.dp) else Modifier.fillMaxHeight(frac))
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (v == 0) c.onSurface.copy(alpha = 0.06f) else if (highlightLast && i == values.lastIndex || sel == i) c.primary else BrandLight),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            labels.forEach { Text(it, Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = c.onSurfaceVariant, maxLines = 1, fontSize = 10.sp) }
        }
    }
}

@Composable
fun DeckCover(cover: String, color: String, image: String = "", size: Dp = 56.dp) {
    val shape = RoundedCornerShape(size * 0.3f)
    if (image.isNotBlank()) AsyncImage(image, null, Modifier.size(size).clip(shape), contentScale = ContentScale.Crop)
    else Box(Modifier.size(size).clip(shape).background(deckBrush(color)), contentAlignment = Alignment.Center) {
        Text(cover, fontSize = (size.value * 0.45f).sp)
    }
}

@Composable
fun YProgress(value: Int, modifier: Modifier = Modifier, height: Dp = 8.dp) {
    val v by animateFloatAsState(value.coerceIn(0, 100) / 100f, tween(700), label = "p")
    Box(modifier.height(height).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.07f))) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(v).clip(CircleShape).background(Brush.horizontalGradient(listOf(Brand, Fuchsia))))
    }
}

@Composable
fun PageHeader(title: String, sub: String? = null, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.navBack)) }
        Column(Modifier.weight(1f).padding(start = if (onBack == null) 4.dp else 0.dp)) {
            Text(title, style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sub != null) Text(sub, style = Muted)
        }
        actions()
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, sub: String? = null, action: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(64.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(30.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (sub != null) Text(sub, style = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(16.dp))
        action()
    }
}

@Composable
fun <T> Segmented(value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = MaterialTheme.colorScheme
    Row(modifier.clip(RoundedCornerShape(16.dp)).background(c.onSurface.copy(alpha = 0.05f)).padding(4.dp)) {
        options.forEach { (v, label) ->
            val sel = v == value
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(if (sel) c.surface else Color.Transparent).clickable { onChange(v) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text(label, style = MaterialTheme.typography.labelLarge, color = if (sel) c.onSurface else c.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@Composable
fun YChip(text: String, selected: Boolean, onClick: () -> Unit, leading: (@Composable () -> Unit)? = null) {
    val c = MaterialTheme.colorScheme
    Row(
        Modifier.clip(CircleShape).background(if (selected) c.onSurface else c.surface)
            .border(1.dp, if (selected) Color.Transparent else c.outline, CircleShape)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading?.invoke()
        Text(text, style = MaterialTheme.typography.labelLarge, color = if (selected) c.surface else c.onSurface)
    }
}

@Composable
fun StatTile(icon: ImageVector, tint: Color, label: String, value: String, modifier: Modifier = Modifier) {
    YCard(modifier) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint, modifier = Modifier.size(19.dp)) }
        Spacer(Modifier.height(10.dp))
        Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(label, style = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun Badge(n: Int) {
    Text("$n", Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary).padding(horizontal = 9.dp, vertical = 3.dp), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
}

@Composable
fun SectionTitle(text: String, action: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        action?.invoke()
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false, icon: ImageVector? = null, color: Color = MaterialTheme.colorScheme.primary) {
    Button(onClick, modifier.heightIn(min = 52.dp), enabled = enabled && !loading, shape = RoundedCornerShape(18.dp), colors = ButtonDefaults.buttonColors(containerColor = color)) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
        else if (icon != null) Icon(icon, null, Modifier.size(18.dp))
        if (icon != null || loading) Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.labelLarge, fontSize = 15.sp)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true, color: Color = MaterialTheme.colorScheme.onSurface) {
    OutlinedButton(onClick, modifier.heightIn(min = 52.dp), enabled = enabled, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), colors = ButtonDefaults.outlinedButtonColors(contentColor = color)) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text, style = MaterialTheme.typography.labelLarge, fontSize = 15.sp)
    }
}

@Composable
fun YField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, error: String? = null, placeholder: String? = null, minLines: Int = 1, singleLine: Boolean = minLines == 1, keyboard: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default, visual: androidx.compose.ui.text.input.VisualTransformation = androidx.compose.ui.text.input.VisualTransformation.None, trailing: (@Composable () -> Unit)? = null, supporting: String? = null) {
    OutlinedTextField(
        value, onChange, modifier.fillMaxWidth(), label = { Text(label) }, isError = error != null, minLines = minLines, singleLine = singleLine,
        placeholder = placeholder?.let { { Text(it) } }, supportingText = (error ?: supporting)?.let { { Text(it) } }, shape = RoundedCornerShape(16.dp),
        keyboardOptions = keyboard, visualTransformation = visual, trailingIcon = trailing,
    )
}

/** App-wide confirm dialog. */
class ConfirmState { var req by mutableStateOf<ConfirmReq?>(null) }
data class ConfirmReq(val msg: String, val ok: String, val danger: Boolean, val onOk: () -> Unit)
val LocalConfirm = staticCompositionLocalOf { ConfirmState() }

@Composable
fun confirm(): (msg: String, ok: String, danger: Boolean, onOk: () -> Unit) -> Unit {
    val s = LocalConfirm.current
    return { msg, ok, danger, onOk -> s.req = ConfirmReq(msg, ok, danger, onOk) }
}

@Composable
fun ConfirmHost(state: ConfirmState) {
    val r = state.req ?: return
    AlertDialog(
        onDismissRequest = { state.req = null },
        text = { Text(r.msg, style = MaterialTheme.typography.bodyLarge) },
        confirmButton = { TextButton({ state.req = null; r.onOk() }) { Text(r.ok, color = if (r.danger) Rose else MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ state.req = null }) { Text(stringResource(R.string.cancel)) } },
        shape = RoundedCornerShape(28.dp),
    )
}

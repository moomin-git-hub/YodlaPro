package uz.yodla.app.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import uz.yodla.app.data.Mask
import uz.yodla.app.data.Occlusion
import uz.yodla.app.data.uid
import uz.yodla.app.ui.theme.Amber
import uz.yodla.app.ui.theme.Brand
import uz.yodla.app.ui.theme.Rose
import kotlin.coroutines.resume
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Image with occlusion masks. Front: target (and in "all" mode the others) hidden. Back: target revealed and outlined. */
@Composable
fun OcclusionView(image: String, occ: Occlusion, revealed: Boolean, modifier: Modifier = Modifier) {
    var aspect by remember(image) { mutableFloatStateOf(4f / 3f) }
    Box(modifier.fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(16.dp))) {
        AsyncImage(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit,
            onSuccess = { s -> val sz = s.painter.intrinsicSize; if (sz.width > 0 && sz.height > 0) aspect = sz.width / sz.height })
        Canvas(Modifier.fillMaxSize()) {
            occ.masks.forEach { m ->
                val tl = Offset(m.x * size.width, m.y * size.height); val sz = Size(m.w * size.width, m.h * size.height)
                val isT = m.id == occ.t
                when {
                    isT && !revealed -> drawRoundRect(Rose, tl, sz, CornerRadius(8f))
                    isT && revealed -> drawRoundRect(Rose, tl, sz, CornerRadius(8f), style = Stroke(5f))
                    occ.mode == "all" -> drawRoundRect(Amber, tl, sz, CornerRadius(8f))
                }
            }
        }
        if (!revealed) {
            val t = occ.masks.firstOrNull { it.id == occ.t }
            if (t != null) Box(Modifier.fillMaxSize()) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    Text("?", Modifier.offset(maxWidth * (t.x + t.w / 2) - 5.dp, maxHeight * (t.y + t.h / 2) - 10.dp), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                }
            }
        }
    }
}

/** Drag to draw a mask, tap a mask to select it (selected mask can be deleted by the caller). */
@Composable
fun OcclusionEditorCanvas(image: String, masks: List<Mask>, selected: String?, onMasks: (List<Mask>) -> Unit, onSelect: (String?) -> Unit, modifier: Modifier = Modifier) {
    var aspect by remember(image) { mutableFloatStateOf(4f / 3f) }
    var box by remember { mutableStateOf(IntSize(1, 1)) }
    var drag by remember { mutableStateOf<Pair<Offset, Offset>?>(null) }
    val current by rememberUpdatedState(masks)
    Box(modifier.fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(16.dp)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp)).onSizeChanged { box = it }) {
        AsyncImage(image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit,
            onSuccess = { s -> val sz = s.painter.intrinsicSize; if (sz.width > 0 && sz.height > 0) aspect = sz.width / sz.height })
        Canvas(
            Modifier.fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures { p ->
                        val nx = p.x / box.width; val ny = p.y / box.height
                        onSelect(current.lastOrNull { nx in it.x..(it.x + it.w) && ny in it.y..(it.y + it.h) }?.id)
                    }
                }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { drag = it to it },
                        onDrag = { c, _ -> drag = drag?.let { it.first to c.position } },
                        onDragEnd = {
                            drag?.let { (a, b) ->
                                val x = min(a.x, b.x) / box.width; val y = min(a.y, b.y) / box.height
                                val w = abs(a.x - b.x) / box.width; val h = abs(a.y - b.y) / box.height
                                if (w > 0.02f && h > 0.015f) {
                                    val m = Mask(uid(), x.coerceIn(0f, 1f), y.coerceIn(0f, 1f), w.coerceAtMost(1f - x), h.coerceAtMost(1f - y))
                                    onMasks(current + m); onSelect(m.id)
                                }
                            }
                            drag = null
                        },
                        onDragCancel = { drag = null },
                    )
                },
        ) {
            masks.forEachIndexed { i, m ->
                val tl = Offset(m.x * size.width, m.y * size.height); val sz = Size(m.w * size.width, m.h * size.height)
                drawRoundRect(if (m.id == selected) Rose.copy(alpha = 0.85f) else Brand.copy(alpha = 0.75f), tl, sz, CornerRadius(8f))
                if (m.id == selected) drawRoundRect(Color.White, tl, sz, CornerRadius(8f), style = Stroke(4f))
            }
            drag?.let { (a, b) ->
                drawRoundRect(Brand.copy(alpha = 0.4f), Offset(min(a.x, b.x), min(a.y, b.y)), Size(abs(a.x - b.x), abs(a.y - b.y)), CornerRadius(8f))
                drawRoundRect(Brand, Offset(min(a.x, b.x), min(a.y, b.y)), Size(abs(a.x - b.x), abs(a.y - b.y)), CornerRadius(8f), style = Stroke(3f))
            }
        }
        val d = LocalDensity.current
        BoxWithConstraints(Modifier.fillMaxSize()) {
            masks.forEachIndexed { i, m ->
                Text("${i + 1}", Modifier.offset(maxWidth * m.x + 4.dp, maxHeight * m.y + 2.dp).background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(4.dp)).padding(horizontal = 4.dp),
                    color = Color.White, fontSize = with(d) { 11.sp }, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** AI-assisted mask detection: find text labels on the image with on-device ML Kit OCR. */
suspend fun detectLabelMasks(ctx: Context, image: String): List<Mask> {
    val res = ctx.imageLoader.execute(ImageRequest.Builder(ctx).data(image).allowHardware(false).build())
    val bmp = ((res as? SuccessResult)?.drawable as? BitmapDrawable)?.bitmap ?: return emptyList()
    val soft = if (bmp.config == Bitmap.Config.HARDWARE) bmp.copy(Bitmap.Config.ARGB_8888, false) else bmp
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val text = suspendCancellableCoroutine<com.google.mlkit.vision.text.Text?> { cont ->
        recognizer.process(InputImage.fromBitmap(soft, 0))
            .addOnSuccessListener { cont.resume(it) }
            .addOnFailureListener { cont.resume(null) }
    } ?: return emptyList()
    val w = soft.width.toFloat(); val h = soft.height.toFloat()
    val pad = 0.006f
    return text.textBlocks.flatMap { it.lines }.mapNotNull { line ->
        val r = line.boundingBox ?: return@mapNotNull null
        if (line.text.trim().length < 2) return@mapNotNull null
        val x = max(0f, r.left / w - pad); val y = max(0f, r.top / h - pad)
        Mask(uid(), x, y, min(1f - x, r.width() / w + 2 * pad), min(1f - y, r.height() / h + 2 * pad))
    }.take(40)
}

@Composable
fun OcclusionLegend(label: String) = Row(verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(10.dp).background(Rose, RoundedCornerShape(3.dp))); Spacer(Modifier.width(6.dp)); Text(label, style = MaterialTheme.typography.labelSmall)
}

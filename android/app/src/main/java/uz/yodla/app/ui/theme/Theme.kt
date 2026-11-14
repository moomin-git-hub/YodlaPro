package uz.yodla.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Brand = Color(0xFF6D4AFF)
val BrandDark = Color(0xFF5B35F2)
val BrandLight = Color(0xFFAD99FF)
val Fuchsia = Color(0xFFD946EF)
val Rose = Color(0xFFF43F5E)
val Amber = Color(0xFFF59E0B)
val Emerald = Color(0xFF10B981)
val Sky = Color(0xFF0EA5E9)
val Orange = Color(0xFFF97316)

val BrandGradient = Brush.linearGradient(listOf(Brand, Color(0xFF8B5CF6), Fuchsia))

val DeckGradients = mapOf(
    "violet" to listOf(Color(0xFF8B5CF6), Color(0xFFD946EF)),
    "blue" to listOf(Color(0xFF0EA5E9), Color(0xFF6366F1)),
    "green" to listOf(Color(0xFF10B981), Color(0xFF14B8A6)),
    "orange" to listOf(Color(0xFFFBBF24), Color(0xFFF97316)),
    "pink" to listOf(Color(0xFFEC4899), Color(0xFFF43F5E)),
    "slate" to listOf(Color(0xFF475569), Color(0xFF1E293B)),
    "lime" to listOf(Color(0xFFA3E635), Color(0xFF10B981)),
    "red" to listOf(Color(0xFFEF4444), Color(0xFFF97316)),
)
fun deckBrush(color: String) = Brush.linearGradient(DeckGradients[color] ?: DeckGradients.getValue("violet"))

/** Card style backgrounds (light, dark). */
val CardBackgrounds = mapOf(
    "default" to (Color.White to Color(0xFF1A1929)),
    "cream" to (Color(0xFFFFF8E7) to Color(0xFF2A2418)),
    "mint" to (Color(0xFFE8FBF3) to Color(0xFF13261F)),
    "sky" to (Color(0xFFEAF5FF) to Color(0xFF132233)),
    "lavender" to (Color(0xFFF1ECFF) to Color(0xFF221B3A)),
    "rose" to (Color(0xFFFFEEF2) to Color(0xFF331A22)),
    "night" to (Color(0xFF1F2937) to Color(0xFF0F172A)),
)

private val Light = lightColorScheme(
    primary = Brand, onPrimary = Color.White, primaryContainer = Color(0xFFE6E0FF), onPrimaryContainer = Color(0xFF2A1680),
    secondary = Fuchsia, background = Color(0xFFF7F7FB), onBackground = Color(0xFF121120), surface = Color.White, onSurface = Color(0xFF121120),
    surfaceVariant = Color(0xFFEFEFF6), onSurfaceVariant = Color(0xFF5B5A6E), outline = Color(0xFFE2E2EC), outlineVariant = Color(0xFFEDEDF4),
    error = Rose, surfaceContainer = Color.White, surfaceContainerHigh = Color.White, surfaceContainerLow = Color(0xFFF7F7FB), surfaceContainerHighest = Color(0xFFEFEFF6),
)
private val Dark = darkColorScheme(
    primary = Color(0xFF8F72FF), onPrimary = Color.White, primaryContainer = Color(0xFF2E2266), onPrimaryContainer = Color(0xFFE6E0FF),
    secondary = Fuchsia, background = Color(0xFF0B0A16), onBackground = Color(0xFFEFEFF6), surface = Color(0xFF1A1929), onSurface = Color(0xFFEFEFF6),
    surfaceVariant = Color(0xFF24233A), onSurfaceVariant = Color(0xFFA9A8BC), outline = Color(0xFF2E2D44), outlineVariant = Color(0xFF24233A),
    error = Rose, surfaceContainer = Color(0xFF1A1929), surfaceContainerHigh = Color(0xFF24233A), surfaceContainerLow = Color(0xFF121120), surfaceContainerHighest = Color(0xFF2E2D44),
)

private val Base = Typography()
val YodlaType = Typography(
    displaySmall = Base.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp),
    headlineMedium = Base.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp, fontSize = 26.sp),
    headlineSmall = Base.headlineSmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp),
    titleLarge = Base.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
    titleMedium = Base.titleMedium.copy(fontWeight = FontWeight.Bold),
    titleSmall = Base.titleSmall.copy(fontWeight = FontWeight.Bold),
    labelLarge = Base.labelLarge.copy(fontWeight = FontWeight.Bold),
    labelMedium = Base.labelMedium.copy(fontWeight = FontWeight.SemiBold),
    labelSmall = Base.labelSmall.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = Base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp),
)

val YodlaShapes = Shapes(
    extraSmall = RoundedCornerShape(10.dp), small = RoundedCornerShape(14.dp), medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(26.dp), extraLarge = RoundedCornerShape(32.dp),
)

val LocalDark = staticCompositionLocalOf { false }

@Composable
fun YodlaTheme(theme: String = "system", content: @Composable () -> Unit) {
    val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    androidx.compose.runtime.CompositionLocalProvider(LocalDark provides dark) {
        MaterialTheme(colorScheme = if (dark) Dark else Light, typography = YodlaType, shapes = YodlaShapes, content = content)
    }
}

val Muted: TextStyle @Composable get() = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)

package uz.yodla.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Activity: current & longest streak, active days and a month calendar of study days (Noji-style). */
@Composable
fun ActivityScreen(nav: NavHostController) {
    val d = appData()
    val studied = remember(d.reviews.size) { d.reviews.map { Srs.startOfDay(it.ts) }.toSet() }
    val (cur, best) = remember(d.reviews.size) { Stats.streaks(d.reviews) }
    val today = Srs.startOfDay(now())
    var month by remember { mutableStateOf(Calendar.getInstance().apply { timeInMillis = today; set(Calendar.DAY_OF_MONTH, 1) }.timeInMillis) }
    val firstMonth = remember(studied) { (studied.minOrNull() ?: today).let { Calendar.getInstance().apply { timeInMillis = it; set(Calendar.DAY_OF_MONTH, 1) }.timeInMillis.let(Srs::startOfDay) } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PageHeader(stringResource(R.string.activity), onBack = { nav.popBackStack() }) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BigStat(Icons.Rounded.LocalFireDepartment, Amber, "$cur", stringResource(R.string.dayStreak), Modifier.weight(1f))
                BigStat(Icons.Rounded.EmojiEvents, Brand, "$best", stringResource(R.string.longestStreak), Modifier.weight(1f))
            }
        }
        item {
            YCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.CheckCircle, null, tint = Sky, modifier = Modifier.size(28.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("${studied.size}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.activeDays), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            YCard(Modifier.fillMaxWidth()) {
                MonthCalendar(month, studied, today,
                    onPrev = { if (month > firstMonth) month = shiftMonth(month, -1) }, canPrev = month > firstMonth,
                    onNext = { if (shiftMonth(month, 1) <= today) month = shiftMonth(month, 1) }, canNext = shiftMonth(month, 1) <= today)
            }
        }
    }
}

private fun shiftMonth(ts: Long, by: Int) = Calendar.getInstance().apply { timeInMillis = ts; add(Calendar.MONTH, by); set(Calendar.DAY_OF_MONTH, 1) }.timeInMillis.let(Srs::startOfDay)

@Composable
private fun BigStat(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, value: String, label: String, modifier: Modifier) {
    YCard(modifier) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = tint, modifier = Modifier.size(36.dp))
                Text(value, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraBold)
            }
            Text(label, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun MonthCalendar(month: Long, studied: Set<Long>, today: Long, onPrev: () -> Unit, canPrev: Boolean, onNext: () -> Unit, canNext: Boolean) {
    val cal = Calendar.getInstance().apply { timeInMillis = month }
    val daysIn = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    val lead = (cal.get(Calendar.DAY_OF_WEEK) - cal.firstDayOfWeek + 7) % 7
    val days = (1..daysIn).map { day -> Calendar.getInstance().apply { timeInMillis = month; set(Calendar.DAY_OF_MONTH, day) }.timeInMillis.let(Srs::startOfDay) }
    val cells: List<Long?> = List(lead) { null } + days + List((7 - (lead + daysIn) % 7) % 7) { null }
    val wd = remember { SimpleDateFormat("EEE", Locale.getDefault()) }
    val title = remember(month) { SimpleDateFormat("LLLL yyyy", Locale.getDefault()).format(Date(month)).replaceFirstChar { it.uppercase() } }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onPrev, enabled = canPrev) { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, null, tint = if (canPrev) Sky else MaterialTheme.colorScheme.outline) }
            Text(title, Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            IconButton(onNext, enabled = canNext) { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = if (canNext) Sky else MaterialTheme.colorScheme.outline) }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            (0 until 7).forEach { i ->
                val c = Calendar.getInstance().apply { set(Calendar.DAY_OF_WEEK, (firstDayOfWeek - 1 + i) % 7 + 1) }
                Text(wd.format(c.time), Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelLarge)
            }
        }
        Spacer(Modifier.height(8.dp))
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth().height(52.dp)) {
                week.forEachIndexed { i, day ->
                    Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                        if (day != null) {
                            val on = day in studied
                            // connect consecutive study days with a band, like Noji
                            val prevOn = i > 0 && week[i - 1]?.let { it in studied } == true
                            val nextOn = i < 6 && week[i + 1]?.let { it in studied } == true
                            if (on && (prevOn || nextOn)) Row(Modifier.fillMaxWidth().height(40.dp)) {
                                Box(Modifier.weight(1f).fillMaxHeight().background(if (prevOn) Amber.copy(alpha = 0.18f) else Color.Transparent))
                                Box(Modifier.weight(1f).fillMaxHeight().background(if (nextOn) Amber.copy(alpha = 0.18f) else Color.Transparent))
                            }
                            Box(Modifier.size(42.dp).clip(CircleShape)
                                .background(if (day == today && on) Amber.copy(alpha = 0.45f) else if (on) Amber.copy(alpha = 0.18f) else Color.Transparent)
                                .border(2.dp, if (on) Amber else Color.Transparent, CircleShape), contentAlignment = Alignment.Center) {
                                Text("${Calendar.getInstance().apply { timeInMillis = day }.get(Calendar.DAY_OF_MONTH)}",
                                    fontWeight = if (day == today) FontWeight.ExtraBold else FontWeight.Medium,
                                    color = if (day > today) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
            }
        }
    }
}

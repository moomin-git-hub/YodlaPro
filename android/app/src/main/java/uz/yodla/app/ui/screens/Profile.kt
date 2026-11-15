package uz.yodla.app.ui.screens

import android.Manifest
import android.app.TimePickerDialog
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.launch
import uz.yodla.app.BuildConfig
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.*
import uz.yodla.app.go
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*
import uz.yodla.app.work.Reminders

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(nav: NavHostController) {
    val d = appData()
    val s = d.settings
    val repo = Graph.repo
    val user = d.session.user
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val ask = confirm()
    val scope = rememberCoroutineScope()
    var sheet by remember { mutableStateOf("") }
    var syncing by remember { mutableStateOf(false) }

    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (!ok) toast(ctx.getString(R.string.notifDenied))
        repo.updateSettings { it.copy(reminderEnabled = ok) }
        if (ok) Reminders.schedule(ctx, s.reminderTime)
    }
    val exportBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) scope.launch { val json = repo.exportBackup(); ctx.contentResolver.openOutputStream(uri)!!.bufferedWriter().use { it.write(json) }; toast(ctx.getString(R.string.exported)) }
    }
    val importBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            runCatching { repo.importBackup(Files.readText(ctx, uri)) }.onSuccess { (dk, c) -> toast(ctx.getString(R.string.backupRestored, dk, c)) }.onFailure { toast(ctx.getString(R.string.pdfError)) }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        PageHeader(stringResource(R.string.profile), stringResource(R.string.profileSub))
        YCard(Modifier.fillMaxWidth(), padding = 18.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(62.dp).clip(RoundedCornerShape(22.dp)).background(BrandGradient), contentAlignment = Alignment.Center) {
                    Text((user?.name?.ifBlank { null } ?: "?").take(1).uppercase(), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp)
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Row(Modifier.clickable { sheet = "name" }, verticalAlignment = Alignment.CenterVertically) {
                        Text(user?.name?.ifBlank { null } ?: stringResource(R.string.learner), style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.width(6.dp)); Icon(Icons.Rounded.Edit, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.outline)
                    }
                    if (!user?.email.isNullOrBlank()) Text(user!!.email, style = Muted)
                    Text(stringResource(if (user?.guest == true) R.string.guestMode else R.string.cloudMode), Modifier.padding(top = 4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)).padding(horizontal = 10.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        if (user?.guest == true) PrimaryButton(stringResource(R.string.connectAccount), { nav.go("account") }, Modifier.fillMaxWidth(), icon = Icons.Rounded.CloudUpload)
        else Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f)).padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(when { Graph.sync.lastError.isNotBlank() -> "⚠ " + Graph.sync.lastError; d.pending > 0 -> stringResource(R.string.syncPending, d.pending); else -> stringResource(R.string.synced) }, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            FilledTonalButton({ syncing = true; scope.launch { Graph.sync.sync(); syncing = false } }, enabled = !syncing) {
                if (syncing) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Rounded.Sync, null, Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.syncNow))
            }
        }
        NavRow(Icons.Rounded.BarChart, Brand, stringResource(R.string.stats)) { nav.go("stats") }

        Group(stringResource(R.string.appearance)) {
            SettingRow(Icons.Rounded.DarkMode, stringResource(R.string.theme)) {
                Segmented(s.theme, listOf("light" to stringResource(R.string.light), "dark" to stringResource(R.string.dark), "system" to stringResource(R.string.system)), { v -> repo.updateSettings { it.copy(theme = v) } }, Modifier.width(210.dp))
            }
            SettingRow(Icons.Rounded.Language, stringResource(R.string.language)) {
                var open by remember { mutableStateOf(false) }
                Box {
                    TextButton({ open = true }) { Text(APP_LANGS.first { it.first == currentLang() }.second); Icon(Icons.Rounded.ExpandMore, null) }
                    DropdownMenu(open, { open = false }) { APP_LANGS.forEach { (c, l) -> DropdownMenuItem({ Text(l) }, { open = false; setLang(c) }) } }
                }
            }
        }

        Group(stringResource(R.string.learningGoals)) {
            SettingRow(Icons.Rounded.Flag, stringResource(R.string.dailyGoal)) { Stepper(s.dailyGoal, 5, 500, 5) { v -> repo.updateSettings { it.copy(dailyGoal = v) } } }
            SettingRow(Icons.Rounded.FiberNew, stringResource(R.string.newWordsPerDay)) { Stepper(s.newPerDay, 0, 500, 5) { v -> repo.updateSettings { it.copy(newPerDay = v) } } }
            var algoOpen by remember { mutableStateOf(false) }
            SettingRow(Icons.Rounded.Science, stringResource(R.string.learningAlgorithm)) {
                TextButton({ algoOpen = true }) { Text(stringResource(algoLabel(s.defaultAlgorithm)), maxLines = 1); Icon(Icons.Rounded.ExpandMore, null) }
            }
            if (algoOpen) AlgorithmSheet(s.defaultAlgorithm, onPick = { a ->
                algoOpen = false
                scope.launch { repo.updateSettings { it.copy(defaultAlgorithm = a) }; d.decks.forEach { dk -> if (dk.algorithm != a) repo.saveDeck(dk.copy(algorithm = a)) } }
            }, onDismiss = { algoOpen = false })
            SwitchRow(Icons.Rounded.Shuffle, stringResource(R.string.shuffle), s.shuffle) { v -> repo.updateSettings { it.copy(shuffle = v) } }
            SwitchRow(Icons.Rounded.Flip, stringResource(R.string.flipCards), s.flipCards) { v -> repo.updateSettings { it.copy(flipCards = v) } }
            SwitchRow(Icons.Rounded.VolumeUp, stringResource(R.string.listen), s.tts) { v -> repo.updateSettings { it.copy(tts = v) } }
            SwitchRow(Icons.Rounded.PlayCircle, stringResource(R.string.autoplayAudio), s.ttsAutoplay) { v -> repo.updateSettings { it.copy(ttsAutoplay = v) } }
        }

        Group(stringResource(R.string.reminders)) {
            SwitchRow(Icons.Rounded.Notifications, stringResource(R.string.enableReminder), s.reminderEnabled) { on ->
                if (on && Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
                else { repo.updateSettings { it.copy(reminderEnabled = on) }; if (on) Reminders.schedule(ctx, s.reminderTime) else Reminders.cancel(ctx) }
            }
            SettingRow(Icons.Rounded.Schedule, stringResource(R.string.reminderTime)) {
                TextButton({
                    val (h, m) = s.reminderTime.split(":").map { it.toIntOrNull() ?: 0 }
                    TimePickerDialog(ctx, { _, hh, mm ->
                        val t = "%02d:%02d".format(hh, mm); repo.updateSettings { it.copy(reminderTime = t) }; if (s.reminderEnabled) Reminders.schedule(ctx, t)
                    }, h, m, true).show()
                }) { Text(s.reminderTime, fontWeight = FontWeight.Bold) }
            }
        }

        Group(stringResource(R.string.data)) {
            NavRowPlain(Icons.Rounded.Download, stringResource(R.string.exportAll)) { exportBackup.launch("yodla-backup-${java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(now())}.json") }
            NavRowPlain(Icons.Rounded.Upload, stringResource(R.string.importBackup)) { importBackup.launch(arrayOf("application/json", "text/*", "*/*")) }
            NavRowPlain(Icons.Rounded.DeleteForever, stringResource(R.string.wipe), Rose) { ask(ctx.getString(R.string.confirmWipe), ctx.getString(R.string.delete), true) { scope.launch { repo.wipeAll(); toast(ctx.getString(R.string.deleted)) } } }
        }

        Group(stringResource(R.string.account)) {
            NavRowPlain(Icons.Rounded.Dns, stringResource(R.string.server) + ": " + d.session.serverUrl.ifBlank { stringResource(R.string.serverNotSet) }) { nav.go("server") }
            if (user?.guest == false) NavRowPlain(Icons.Rounded.Key, stringResource(R.string.changePassword)) { sheet = "password" }
            Column(Modifier.padding(vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Keyboard, null, tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(12.dp)); Text(stringResource(R.string.shortcuts), fontWeight = FontWeight.SemiBold) }
                Text(stringResource(R.string.shortcutsAndroid), Modifier.padding(start = 36.dp, top = 4.dp), style = Muted)
            }
            Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Info, null, tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(12.dp))
                Text(stringResource(R.string.about), Modifier.weight(1f), fontWeight = FontWeight.SemiBold); Text("v${BuildConfig.VERSION_NAME} · ${BuildConfig.BUILD_TIME}", style = Muted)
            }
            NavRowPlain(Icons.Rounded.Logout, stringResource(R.string.signOut), Rose) {
                ask(ctx.getString(if (user?.guest == true) R.string.signOutGuestConfirm else R.string.signOutConfirm), ctx.getString(R.string.signOut), true) { scope.launch { Graph.auth.signOut() } }
            }
            if (user?.guest == false) NavRowPlain(Icons.Rounded.PersonRemove, stringResource(R.string.deleteAccount), Rose) {
                ask(ctx.getString(R.string.deleteAccountConfirm), ctx.getString(R.string.delete), true) { scope.launch { runCatching { Graph.auth.deleteAccount() }.onFailure { toast(errMessage(ctx, it)) } } }
            }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (sheet == "name") ModalBottomSheet({ sheet = "" }) {
        var name by remember { mutableStateOf(user?.name.orEmpty()) }
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.name), style = MaterialTheme.typography.titleLarge)
            YField(name, { name = it.take(60) }, stringResource(R.string.name))
            PrimaryButton(stringResource(R.string.save), { scope.launch { runCatching { Graph.auth.updateName(name) }.onSuccess { toast(ctx.getString(R.string.saved)); sheet = "" }.onFailure { toast(errMessage(ctx, it)) } } }, Modifier.fillMaxWidth(), enabled = name.isNotBlank())
        }
    }
    if (sheet == "password") ModalBottomSheet({ sheet = "" }) {
        var old by remember { mutableStateOf("") }; var new by remember { mutableStateOf("") }; var err by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
        val sWeak = stringResource(R.string.weakPassword)
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.changePassword), style = MaterialTheme.typography.titleLarge)
            YField(old, { old = it }, stringResource(R.string.currentPassword), visual = PasswordVisualTransformation(), keyboard = KeyboardOptions(keyboardType = KeyboardType.Password))
            YField(new, { new = it }, stringResource(R.string.newPassword), error = err, supporting = sWeak, visual = PasswordVisualTransformation(), keyboard = KeyboardOptions(keyboardType = KeyboardType.Password))
            PrimaryButton(stringResource(R.string.save), {
                if (!AuthManager.strong(new)) { err = sWeak; return@PrimaryButton }
                busy = true
                scope.launch { runCatching { Graph.auth.changePassword(old, new) }.onSuccess { toast(ctx.getString(R.string.passwordChanged)); sheet = "" }.onFailure { err = errMessage(ctx, it) }; busy = false }
            }, Modifier.fillMaxWidth(), loading = busy)
        }
    }
}

@Composable
fun Group(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(title.uppercase(), Modifier.padding(start = 6.dp, bottom = 6.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        YCard(Modifier.fillMaxWidth(), padding = 0.dp) { Column(Modifier.padding(horizontal = 16.dp), content = content) }
    }
}

@Composable
fun SettingRow(icon: ImageVector, label: String, trailing: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(12.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        trailing()
    }
}

@Composable
fun SwitchRow(icon: ImageVector, label: String, checked: Boolean, onChange: (Boolean) -> Unit) = SettingRow(icon, label) { Switch(checked, onChange) }

@Composable
fun NavRowPlain(icon: ImageVector, label: String, tint: Color = MaterialTheme.colorScheme.onSurface, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (tint == MaterialTheme.colorScheme.onSurface) MaterialTheme.colorScheme.onSurfaceVariant else tint); Spacer(Modifier.width(12.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tint, maxLines = 1)
        Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
    }
}

@Composable
fun NavRow(icon: ImageVector, tint: Color, label: String, onClick: () -> Unit) {
    YCard(Modifier.fillMaxWidth(), onClick = onClick, padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(tint.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
            Spacer(Modifier.width(12.dp)); Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall); Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
fun Stepper(value: Int, min: Int, max: Int, step: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        FilledTonalIconButton({ onChange((value - step).coerceAtLeast(min)) }, Modifier.size(36.dp)) { Icon(Icons.Rounded.Remove, "−") }
        Text("$value", Modifier.widthIn(min = 44.dp), fontWeight = FontWeight.ExtraBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        FilledTonalIconButton({ onChange((value + step).coerceAtMost(max)) }, Modifier.size(36.dp)) { Icon(Icons.Rounded.Add, "+") }
    }
}

/** Learning-algorithm presets (Noji-style): pick defaults, tune the custom preset. */
@Composable
fun PresetsScreen(nav: NavHostController) {
    val d = appData()
    val repo = Graph.repo
    var cfg by remember { mutableStateOf(d.settings.customPreset) }
    var learn by remember { mutableStateOf(cfg.learningSteps.joinToString(" ") { fmtNum(it) }) }
    var relearn by remember { mutableStateOf(cfg.relearningSteps.joinToString(" ") { fmtNum(it) }) }
    val toast = LocalToast.current
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(stringResource(R.string.learningAlgorithm), onBack = { nav.popBackStack() })
        Text(stringResource(R.string.presetsIntro), style = Muted)
        listOf(Presets.STANDARD, Presets.LANGUAGES, Presets.MEDICAL, Presets.EXAM).forEach { id ->
            val p = Presets.builtIn(id)!!
            YCard(Modifier.fillMaxWidth(), onClick = { cfg = p; learn = p.learningSteps.joinToString(" ") { fmtNum(it) }; relearn = p.relearningSteps.joinToString(" ") { fmtNum(it) } }, padding = 14.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(presetLabel(id)), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    if (d.settings.defaultPreset == id) Text("✓ " + stringResource(R.string.defaultPreset), color = Emerald, style = MaterialTheme.typography.labelSmall)
                }
                Text(stringResource(R.string.presetSummary, p.learningSteps.joinToString(" → ") { fmtNum(it) + "m" }, p.newPerDay, fmtNum(p.intervalModifier), fmtNum(p.maxIntervalDays)), style = Muted)
                Text(stringResource(R.string.copyToCustom), color = Brand, style = MaterialTheme.typography.labelSmall)
            }
        }
        SectionTitle(stringResource(R.string.presetCustom))
        YField(learn, { learn = it }, stringResource(R.string.learningSteps), supporting = stringResource(R.string.stepsHint), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        YField(relearn, { relearn = it }, stringResource(R.string.relearningSteps), supporting = stringResource(R.string.stepsHint), keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
        NumRow(stringResource(R.string.desiredRetention) + " %", Math.round(cfg.desiredRetention * 100).toDouble(), 1.0, 75.0, 97.0) { cfg = cfg.copy(desiredRetention = it / 100.0) }
        NumRow(stringResource(R.string.graduatingInterval), cfg.graduatingDays, 1.0, 1.0, 30.0) { cfg = cfg.copy(graduatingDays = it) }
        NumRow(stringResource(R.string.easyInterval), cfg.easyDays, 1.0, 1.0, 60.0) { cfg = cfg.copy(easyDays = it) }
        NumRow(stringResource(R.string.easyBonus), cfg.easyBonus, 0.05, 1.0, 3.0) { cfg = cfg.copy(easyBonus = it) }
        NumRow(stringResource(R.string.intervalModifier), cfg.intervalModifier, 0.05, 0.5, 2.0) { cfg = cfg.copy(intervalModifier = it) }
        NumRow(stringResource(R.string.maxInterval), cfg.maxIntervalDays, 30.0, 30.0, 36500.0) { cfg = cfg.copy(maxIntervalDays = it) }
        NumRow(stringResource(R.string.newPerDay), cfg.newPerDay.toDouble(), 5.0, 0.0, 500.0) { cfg = cfg.copy(newPerDay = it.toInt()) }
        NumRow(stringResource(R.string.maxReviewsPerDay), cfg.maxReviewsPerDay.toDouble(), 50.0, 50.0, 9999.0) { cfg = cfg.copy(maxReviewsPerDay = it.toInt()) }
        PrimaryButton(stringResource(R.string.save), {
            fun steps(s: String) = s.split(Regex("[\\s,;]+")).mapNotNull { it.toDoubleOrNull()?.takeIf { v -> v > 0 } }.ifEmpty { null }
            val c = cfg.copy(learningSteps = steps(learn) ?: listOf(1.0, 10.0), relearningSteps = steps(relearn) ?: listOf(10.0))
            repo.updateSettings { it.copy(customPreset = c) }
            toast(ctx.getString(R.string.saved)); nav.popBackStack()
        }, Modifier.fillMaxWidth())
        SecondaryButton(stringResource(R.string.useCustomByDefault), { repo.updateSettings { it.copy(defaultPreset = Presets.CUSTOM) }; toast(ctx.getString(R.string.saved)) }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(24.dp))
    }
}

private fun fmtNum(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else "%.2f".format(v).trimEnd('0').trimEnd('.', ',')

@Composable
private fun NumRow(label: String, value: Double, step: Double, min: Double, max: Double, onChange: (Double) -> Unit) {
    YCard(Modifier.fillMaxWidth(), padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            FilledTonalIconButton({ onChange(maxOf(min, Math.round((value - step) * 100) / 100.0)) }, Modifier.size(34.dp)) { Icon(Icons.Rounded.Remove, "−") }
            Text(fmtNum(value), Modifier.widthIn(min = 56.dp), fontWeight = FontWeight.ExtraBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            FilledTonalIconButton({ onChange(minOf(max, Math.round((value + step) * 100) / 100.0)) }, Modifier.size(34.dp)) { Icon(Icons.Rounded.Add, "+") }
        }
    }
}

@Composable
fun ServerScreen(nav: NavHostController) {
    val d = appData()
    var open by remember { mutableStateOf(true) }
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PageHeader(stringResource(R.string.server), onBack = { nav.popBackStack() })
        Text(stringResource(R.string.serverIntro), style = Muted)
        ServerRow(d.session.serverUrl, open) { open = it }
        if (d.session.user?.mode == "cloud") Notice(stringResource(R.string.serverChangeWarning), Amber)
    }
}

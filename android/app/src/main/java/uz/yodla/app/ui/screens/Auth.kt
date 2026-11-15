package uz.yodla.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import kotlinx.coroutines.launch
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.Api
import uz.yodla.app.data.ApiException
import uz.yodla.app.data.AuthManager
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.theme.*

@Composable
fun Logo(size: Int = 36) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.Image(painterResource(R.drawable.ic_logo), null, Modifier.size(size.dp))
        Spacer(Modifier.width(10.dp))
        Text("Yodla", style = MaterialTheme.typography.titleLarge)
    }
}

val APP_LANGS = listOf("en" to "English", "uz" to "O'zbekcha", "ru" to "Русский")
fun currentLang(): String = AppCompatDelegate.getApplicationLocales().toLanguageTags().take(2).ifBlank { java.util.Locale.getDefault().language.takeIf { it in listOf("uz", "ru") } ?: "en" }
fun setLang(code: String) { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(code)); Graph.repo.updateSettings { it.copy(lang = code) } }

@Composable
fun LangPicker() {
    val cur = currentLang()
    Row(Modifier.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)).padding(3.dp)) {
        APP_LANGS.forEach { (c, l) ->
            Text(l, Modifier.clip(RoundedCornerShape(11.dp)).background(if (c == cur) MaterialTheme.colorScheme.surface else Color.Transparent).clickable { setLang(c) }.padding(horizontal = 9.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelSmall, color = if (c == cur) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun OnboardingScreen() {
    var i by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val slides = listOf(
        Triple(Icons.Rounded.Psychology, R.string.onb1t to R.string.onb1s, listOf(Color(0xFF8B5CF6), Fuchsia)),
        Triple(Icons.Rounded.EventRepeat, R.string.onb2t to R.string.onb2s, listOf(Sky, Color(0xFF6366F1))),
        Triple(Icons.Rounded.AutoAwesome, R.string.onb3t to R.string.onb3s, listOf(Color(0xFFFBBF24), Color(0xFFEC4899))),
    )
    val done = { scope.launch { Graph.repo.prefs.updateSession { it.copy(introSeen = true) } }; Unit }
    Column(Modifier.fillMaxSize().systemBarsPadding().padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Logo(32); Spacer(Modifier.weight(1f)); LangPicker() }
        AnimatedContent(i, Modifier.weight(1f), label = "onb") { k ->
            val s = slides[k]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(contentAlignment = Alignment.Center) {
                    Box(Modifier.size(176.dp).offset(12.dp, 12.dp).rotate(6f).clip(RoundedCornerShape(40.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)))
                    Box(Modifier.size(176.dp).clip(RoundedCornerShape(40.dp)).background(Brush.linearGradient(s.third)), contentAlignment = Alignment.Center) {
                        Icon(s.first, null, tint = Color.White, modifier = Modifier.size(80.dp))
                    }
                }
                Spacer(Modifier.height(40.dp))
                Text(stringResource(s.second.first), style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(s.second.second), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.Center) {
            slides.indices.forEach { k -> Box(Modifier.padding(3.dp).height(8.dp).width(if (k == i) 28.dp else 8.dp).clip(CircleShape).background(if (k == i) Brand else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f))) }
        }
        PrimaryButton(stringResource(if (i < 2) R.string.next else R.string.getStarted), { if (i < 2) i++ else done() }, Modifier.fillMaxWidth())
        if (i < 2) TextButton(done, Modifier.fillMaxWidth()) { Text(stringResource(R.string.skip)) }
    }
}

@Composable
fun errText(e: Throwable): String {
    val ctx = LocalContext.current
    return errMessage(ctx, e)
}
fun errMessage(ctx: android.content.Context, e: Throwable): String {
    val code = (e as? ApiException)?.code ?: e.message ?: "error"
    val id = when (code) {
        "offline" -> R.string.offlineErr; "noServer" -> R.string.noServer; "invalidEmail" -> R.string.invalidEmail; "weakPassword" -> R.string.weakPassword
        "nameRequired" -> R.string.nameRequired; "emailTaken" -> R.string.emailTaken; "wrongCredentials" -> R.string.wrongCredentials
        "wrongCode" -> R.string.wrongCode; "notSignedIn" -> R.string.notSignedIn; "aiBusy" -> R.string.aiBusy; else -> 0
    }
    return if (id != 0) ctx.getString(id) else code
}

@Composable
fun AuthScreen(expired: Boolean = false, onBack: (() -> Unit)? = null) {
    val data = appData()
    var mode by remember { mutableStateOf("in") }
    var email by remember { mutableStateOf(data.session.user?.email.orEmpty()) }
    var pw by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var errs by remember { mutableStateOf(mapOf<String, String>()) }
    var info by remember { mutableStateOf(if (expired) "sessionExpired" else "") }
    var busy by remember { mutableStateOf(false) }
    var serverOpen by remember { mutableStateOf(data.session.serverUrl.isBlank()) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val hasServer = data.session.serverUrl.isNotBlank()

    val sInvalidEmail = stringResource(R.string.invalidEmail); val sName = stringResource(R.string.nameRequired)
    val sPw = stringResource(R.string.passwordRequired); val sWeak = stringResource(R.string.weakPassword)

    fun submit() {
        val e = mutableMapOf<String, String>()
        if (!AuthManager.validEmail(email)) e["email"] = sInvalidEmail
        if (mode == "up" && name.isBlank()) e["name"] = sName
        if (mode == "in" && pw.isEmpty()) e["pw"] = sPw
        if (mode == "up" && !AuthManager.strong(pw)) e["pw"] = sWeak
        errs = e; info = ""
        if (e.isNotEmpty()) return
        busy = true
        scope.launch {
            try {
                when (mode) {
                    "in" -> { Graph.auth.signIn(email, pw); onBack?.invoke() }
                    "up" -> { Graph.auth.signUp(email, pw, name); onBack?.invoke() }
                    else -> { Graph.auth.forgot(email); info = "resetSent"; mode = "in" }
                }
            } catch (x: Throwable) { errs = mapOf("form" to errMessage(ctx, x)) } finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) IconButton(onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, stringResource(R.string.navBack)) }
            Logo(); Spacer(Modifier.weight(1f)); LangPicker()
        }
        if (onBack != null) Notice(stringResource(R.string.guestUpgradeNote), Brand)
        Spacer(Modifier.height(28.dp))
        Text(stringResource(when (mode) { "in" -> R.string.welcomeBack; "up" -> R.string.createYourAccount; else -> R.string.resetPassword }), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.appTagline), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))

        ServerRow(data.session.serverUrl, serverOpen) { serverOpen = it }
        Spacer(Modifier.height(12.dp))

        if (mode == "up") { YField(name, { name = it }, stringResource(R.string.name), error = errs["name"]); Spacer(Modifier.height(10.dp)) }
        YField(email, { email = it }, stringResource(R.string.email), error = errs["email"], keyboard = KeyboardOptions(keyboardType = KeyboardType.Email))
        if (mode != "reset") {
            Spacer(Modifier.height(10.dp))
            YField(pw, { pw = it }, stringResource(R.string.password), error = errs["pw"], supporting = if (mode == "up") sWeak else null,
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Password), visual = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                trailing = { IconButton({ showPw = !showPw }) { Icon(if (showPw) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, null) } })
        }
        if (mode == "in") TextButton({ mode = "reset"; errs = emptyMap() }) { Text(stringResource(R.string.forgotPassword)) }
        errs["form"]?.let { Notice(it, Rose) }
        if (info.isNotEmpty()) Notice(stringResource(if (info == "resetSent") R.string.resetSent else R.string.sessionExpired), if (info == "resetSent") Emerald else Amber)
        Spacer(Modifier.height(12.dp))
        PrimaryButton(stringResource(when (mode) { "in" -> R.string.signIn; "up" -> R.string.signUp; else -> R.string.sendLink }), ::submit, Modifier.fillMaxWidth(), enabled = hasServer, loading = busy)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            when (mode) {
                "in" -> { Text(stringResource(R.string.noAccount), style = MaterialTheme.typography.bodyMedium); TextButton({ mode = "up"; errs = emptyMap() }) { Text(stringResource(R.string.signUp), fontWeight = FontWeight.Bold) } }
                "up" -> { Text(stringResource(R.string.haveAccount), style = MaterialTheme.typography.bodyMedium); TextButton({ mode = "in"; errs = emptyMap() }) { Text(stringResource(R.string.signIn), fontWeight = FontWeight.Bold) } }
                else -> TextButton({ mode = "in"; errs = emptyMap() }) { Text(stringResource(R.string.backToSignIn), fontWeight = FontWeight.Bold) }
            }
        }
        Spacer(Modifier.weight(1f).heightIn(min = 24.dp))
        if (onBack != null) Unit else if (!expired) {
            SecondaryButton(stringResource(R.string.continueGuest), { scope.launch { Graph.auth.guest() } }, Modifier.fillMaxWidth(), icon = Icons.Rounded.PhoneAndroid)
            Text(stringResource(R.string.guestNote), style = Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        } else TextButton({ scope.launch { Graph.auth.signOut() } }, Modifier.fillMaxWidth()) { Text(stringResource(R.string.signOut)) }
    }
}

@Composable
fun Notice(text: String, color: Color) {
    Text(text, Modifier.padding(vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(color.copy(alpha = 0.12f)).padding(14.dp), color = color, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
}

/** Shows the server the app talks to; lets the user enter/verify a new address. */
@Composable
fun ServerRow(current: String, open: Boolean, onOpen: (Boolean) -> Unit) {
    var url by remember(current) { mutableStateOf(current) }
    var state by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp)).padding(12.dp)) {
        Row(Modifier.fillMaxWidth().clickable { onOpen(!open) }, verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Dns, null, tint = if (current.isBlank()) Amber else Emerald)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.server), style = MaterialTheme.typography.labelLarge)
                Text(current.ifBlank { stringResource(R.string.serverNotSet) }, style = Muted, maxLines = 1)
            }
            Icon(if (open) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null)
        }
        if (open) {
            Spacer(Modifier.height(10.dp))
            YField(url, { url = it; state = "" }, stringResource(R.string.serverUrl), placeholder = "https://yodla.onrender.com", keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri),
                supporting = when (state) { "ok" -> stringResource(R.string.serverOk); "" -> stringResource(R.string.serverHint); else -> state })
            Spacer(Modifier.height(6.dp))
            PrimaryButton(stringResource(R.string.connect), {
                busy = true
                scope.launch {
                    val base = Api.normalizeBase(url)
                    val ok = runCatching {
                        Graph.repo.prefs.updateSession { it.copy(serverUrl = base) }
                        Graph.repo.api.request("GET", "/health", auth = false)
                    }
                    state = if (ok.isSuccess) "ok" else errMessage(ctx, ok.exceptionOrNull()!!)
                    if (ok.isSuccess) onOpen(false)
                    busy = false
                }
            }, Modifier.fillMaxWidth(), enabled = url.isNotBlank(), loading = busy, icon = Icons.Rounded.Link)
        }
    }
}

@Composable
fun GoalSetupScreen() {
    var goal by remember { mutableIntStateOf(20) }
    val opts = listOf(Triple(10, R.string.casual, "🌱"), Triple(20, R.string.regular, "📘"), Triple(40, R.string.serious, "🔥"), Triple(80, R.string.intense, "🚀"))
    Column(Modifier.fillMaxSize().systemBarsPadding().padding(24.dp)) {
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.pickGoal), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.appTagline), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        opts.forEach { (n, l, e) ->
            val sel = goal == n
            Row(
                Modifier.padding(vertical = 5.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp))
                    .background(if (sel) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                    .border(2.dp, if (sel) Brand else MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp)).clickable { goal = n }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(e, fontSize = 28.sp); Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) { Text(stringResource(l), style = MaterialTheme.typography.titleMedium); Text(stringResource(R.string.cardsPerDayN, n), style = Muted) }
                if (sel) Icon(Icons.Rounded.CheckCircle, null, tint = Brand)
            }
        }
        Spacer(Modifier.weight(1f))
        PrimaryButton(stringResource(R.string.getStarted), { Graph.repo.updateSettings { it.copy(dailyGoal = goal, onboarded = true) } }, Modifier.fillMaxWidth())
    }
}


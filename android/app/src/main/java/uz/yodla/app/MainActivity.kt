package uz.yodla.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import uz.yodla.app.data.AppData
import uz.yodla.app.ui.components.*
import uz.yodla.app.ui.screens.*
import uz.yodla.app.ui.theme.YodlaTheme

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        splash.setKeepOnScreenCondition { !Graph.repo.data.value.loaded }
        setContent { Root() }
    }

    override fun onResume() {
        super.onResume()
        Graph.repo.scope.launch { Graph.auth.refreshMe(); Graph.sync.sync() }
    }
}

object Routes {
    const val HOME = "home"; const val DECKS = "decks"; const val EXPLORE = "explore"; const val CREATE = "create"; const val PROFILE = "profile"
}

@Composable
fun Root() {
    val data by Graph.repo.data.collectAsStateWithLifecycle()
    YodlaTheme(data.settings.theme) {
        val confirmState = remember { ConfirmState() }
        val snack = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        CompositionLocalProvider(LocalConfirm provides confirmState, LocalToast provides { msg: String -> scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(msg) } }) {
            Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
                if (data.loaded) Gate(data)
            }
            ConfirmHost(confirmState)
            Box(Modifier.fillMaxSize().systemBarsPadding().padding(bottom = 72.dp), contentAlignment = Alignment.BottomCenter) { SnackbarHost(snack) }
        }
    }
}

@Composable
private fun Gate(data: AppData) {
    val s = data.session
    when {
        s.user == null && !s.introSeen -> OnboardingScreen()
        s.user == null || (s.user.mode == "cloud" && s.token == null) -> AuthScreen(expired = s.user != null)
        !data.settings.onboarded -> GoalSetupScreen()
        else -> MainNav()
    }
}

private data class Tab(val route: String, val label: Int, val icon: ImageVector, val iconSel: ImageVector)

@Composable
fun MainNav() {
    val nav = rememberNavController()
    val tabs = listOf(
        Tab(Routes.HOME, R.string.home, Icons.Outlined.Home, Icons.Rounded.Home),
        Tab(Routes.DECKS, R.string.decks, Icons.Outlined.Layers, Icons.Rounded.Layers),
        Tab(Routes.CREATE, R.string.create, Icons.Rounded.AddCircle, Icons.Rounded.AddCircle),
        Tab(Routes.EXPLORE, R.string.explore, Icons.Outlined.Explore, Icons.Rounded.Explore),
        Tab(Routes.PROFILE, R.string.profile, Icons.Outlined.Person, Icons.Rounded.Person),
    )
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val showBar = route in tabs.map { it.route }
    Scaffold(
        bottomBar = {
            AnimatedVisibility(showBar, enter = slideInVertically { it }, exit = slideOutVertically { it }) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                    tabs.forEach { t ->
                        val sel = route == t.route
                        NavigationBarItem(
                            selected = sel,
                            onClick = { nav.navigate(t.route) { popUpTo(nav.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true } },
                            icon = { Icon(if (sel) t.iconSel else t.icon, null, Modifier.size(if (t.route == Routes.CREATE) 34.dp else 24.dp), tint = if (t.route == Routes.CREATE) MaterialTheme.colorScheme.primary else LocalContentColor.current) },
                            label = { Text(stringResource(t.label), style = MaterialTheme.typography.labelSmall) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.primaryContainer),
                        )
                    }
                }
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing,
    ) { pad ->
        NavHost(nav, Routes.HOME, Modifier.padding(pad).consumeWindowInsets(pad),
            enterTransition = { fadeIn(androidx.compose.animation.core.tween(180)) }, exitTransition = { fadeOut(androidx.compose.animation.core.tween(120)) }) {
            composable(Routes.HOME) { HomeScreen(nav) }
            composable(Routes.DECKS) { DecksScreen(nav) }
            composable(Routes.EXPLORE) { ExploreScreen(nav) }
            composable(Routes.CREATE) { CreateScreen(nav) }
            composable(Routes.PROFILE) { ProfileScreen(nav) }
            composable("deck/{id}") { DeckScreen(nav, it.arguments?.getString("id")!!) }
            composable("deckEdit/{id}?folder={folder}&parent={parent}", listOf(navArgument("folder") { type = NavType.StringType; nullable = true }, navArgument("parent") { type = NavType.StringType; nullable = true })) {
                DeckEditScreen(nav, it.arguments?.getString("id")!!, it.arguments?.getString("folder"), it.arguments?.getString("parent"))
            }
            composable("folder/{id}") { FolderScreen(nav, it.arguments?.getString("id")!!) }
            composable("deckSettings/{id}") { DeckSettingsScreen(nav, it.arguments?.getString("id")!!) }
            composable("card/{id}?deck={deck}&type={type}", listOf(navArgument("deck") { type = NavType.StringType; nullable = true }, navArgument("type") { type = NavType.StringType; nullable = true })) {
                CardEditScreen(nav, it.arguments?.getString("id")!!, it.arguments?.getString("deck"), it.arguments?.getString("type"))
            }
            composable("study/{target}?practice={practice}", listOf(navArgument("practice") { type = NavType.BoolType; defaultValue = false })) {
                StudyScreen(nav, it.arguments?.getString("target")!!, it.arguments?.getBoolean("practice") ?: false)
            }
            composable("public/{id}") { PublicDeckScreen(nav, it.arguments?.getString("id")!!) }
            composable("ai?deck={deck}", listOf(navArgument("deck") { type = NavType.StringType; nullable = true })) { AiScreen(nav, it.arguments?.getString("deck")) }
            composable("import?deck={deck}", listOf(navArgument("deck") { type = NavType.StringType; nullable = true })) { ImportScreen(nav, it.arguments?.getString("deck")) }
            composable("stats") { StatsScreen(nav) }
            composable("search") { SearchScreen(nav) }
            composable("presets") { PresetsScreen(nav) }
            composable("server") { ServerScreen(nav) }
            composable("account") { AuthScreen(onBack = { nav.popBackStack() }) }
        }
    }
}

fun NavHostController.go(route: String) = navigate(route) { launchSingleTop = true }

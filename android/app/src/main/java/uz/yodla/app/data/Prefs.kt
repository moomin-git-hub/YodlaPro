package uz.yodla.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import uz.yodla.app.BuildConfig

val Json0 = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; isLenient = true }

@Serializable
data class Settings(
    val dailyGoal: Int = 20,
    val newPerDay: Int = 20,
    val reminderEnabled: Boolean = false,
    val reminderTime: String = "20:00",
    val lang: String = "",
    val theme: String = "system",
    val shuffle: Boolean = false,
    val tts: Boolean = true,
    val ttsAutoplay: Boolean = false,
    val onboarded: Boolean = false,
    val defaultPreset: String = Presets.STANDARD,
    val defaultAlgorithm: String = Algo.FSRS,
    val customPreset: SrsConfig = SrsConfig(),
    val updatedAt: Long = 0,
)

@Serializable
data class AuthUser(val id: String, val email: String, val name: String, val createdAt: Long = 0, val mode: String = "cloud") {
    val guest get() = mode == "guest"
}

@Serializable
data class Session(
    val serverUrl: String = BuildConfig.DEFAULT_SERVER_URL,
    val token: String? = null,
    val user: AuthUser? = null,
    val introSeen: Boolean = false,
)

private val Context.store by preferencesDataStore("yodla")
private val K_SETTINGS = stringPreferencesKey("settings")
private val K_SESSION = stringPreferencesKey("session")

class Prefs(private val ctx: Context) {
    val settings = ctx.store.data.map { p -> p[K_SETTINGS]?.let { runCatching { Json0.decodeFromString<Settings>(it) }.getOrNull() } ?: Settings() }
    val session = ctx.store.data.map { p -> p[K_SESSION]?.let { runCatching { Json0.decodeFromString<Session>(it) }.getOrNull() } ?: Session() }

    suspend fun settingsNow() = settings.first()
    suspend fun sessionNow() = session.first()

    suspend fun updateSettings(fn: (Settings) -> Settings): Settings {
        var out = Settings()
        ctx.store.edit { p ->
            val cur = p[K_SETTINGS]?.let { runCatching { Json0.decodeFromString<Settings>(it) }.getOrNull() } ?: Settings()
            out = fn(cur)
            p[K_SETTINGS] = Json0.encodeToString(Settings.serializer(), out)
        }
        return out
    }
    suspend fun replaceSettings(s: Settings) = ctx.store.edit { it[K_SETTINGS] = Json0.encodeToString(Settings.serializer(), s) }

    suspend fun updateSession(fn: (Session) -> Session) = ctx.store.edit { p ->
        val cur = p[K_SESSION]?.let { runCatching { Json0.decodeFromString<Session>(it) }.getOrNull() } ?: Session()
        p[K_SESSION] = Json0.encodeToString(Session.serializer(), fn(cur))
    }
}

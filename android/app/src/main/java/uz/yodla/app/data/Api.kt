package uz.yodla.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val code: String, val status: Int) : Exception(code)

/** Thin HTTP client for the Yodla server (Render). Base URL and token are read per request. */
class Api(private val session: suspend () -> Session) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS) // free Render instances wake up slowly; AI calls take time
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun configured() = session().serverUrl.isNotBlank()

    suspend fun request(method: String, path: String, json: JsonElement? = null, bytes: ByteArray? = null, contentType: String? = null, headers: Map<String, String> = emptyMap(), auth: Boolean = true): JsonElement =
        withContext(Dispatchers.IO) {
            val s = session()
            if (s.serverUrl.isBlank()) throw ApiException("noServer", 0)
            val url = normalizeBase(s.serverUrl) + "/api" + path
            val body = when {
                bytes != null -> bytes.toRequestBody((contentType ?: "application/octet-stream").toMediaType())
                json != null -> json.toString().toRequestBody("application/json".toMediaType())
                method == "POST" || method == "PATCH" -> ByteArray(0).toRequestBody(null)
                else -> null
            }
            val b = Request.Builder().url(url).method(method, body)
            if (auth && s.token != null) b.header("Authorization", "Bearer ${s.token}")
            headers.forEach { (k, v) -> b.header(k, v) }
            try {
                http.newCall(b.build()).execute().use { res ->
                    val text = res.body?.string().orEmpty()
                    val parsed = runCatching { Json0.parseToJsonElement(text) }.getOrNull() ?: JsonObject(emptyMap())
                    if (!res.isSuccessful) {
                        val err = runCatching { parsed.jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                        throw ApiException(err ?: "HTTP ${res.code}", res.code)
                    }
                    parsed
                }
            } catch (e: IOException) {
                throw ApiException("offline", 0)
            }
        }

    companion object {
        fun normalizeBase(u: String): String {
            var s = u.trim().trimEnd('/')
            if (s.isNotEmpty() && !s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
            return s.removeSuffix("/api")
        }
    }
}

package uz.yodla.app.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.yodla.app.Graph
import uz.yodla.app.R
import uz.yodla.app.data.AppData

@Composable
fun appData(): AppData = Graph.repo.data.collectAsStateWithLifecycle().value

fun catLabel(id: String) = when (id) {
    "general" -> R.string.catGeneral; "languages" -> R.string.catLanguages; "science" -> R.string.catScience; "history" -> R.string.catHistory
    "geography" -> R.string.catGeography; "tech" -> R.string.catTech; "math" -> R.string.catMath; "business" -> R.string.catBusiness
    "medicine" -> R.string.catMedicine; "exam" -> R.string.catExam; "arts" -> R.string.catArts; else -> R.string.catOther
}

fun presetLabel(id: String) = when (id) {
    "languages" -> R.string.presetLanguages; "medical" -> R.string.presetMedical; "exam" -> R.string.presetExam; "custom" -> R.string.presetCustom; else -> R.string.presetStandard
}

@Composable
fun fmtTime(ms: Long): String {
    val m = Math.round(ms / 60000.0)
    return if (m < 60) "$m ${stringResource(R.string.minutes)}" else "${m / 60} ${stringResource(R.string.hours)} ${m % 60} ${stringResource(R.string.minutes)}"
}

package uz.yodla.app.work

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import kotlinx.coroutines.flow.first
import uz.yodla.app.Graph
import uz.yodla.app.MainActivity
import uz.yodla.app.R
import uz.yodla.app.data.Srs
import uz.yodla.app.data.Stats
import java.util.Calendar
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (!Graph.ready) return Result.success()
        val ok = Graph.sync.sync()
        return if (ok || Graph.repo.dao.pending() == 0) Result.success() else Result.retry()
    }
}

object SyncWork {
    private val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun schedule(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(net).setInitialDelay(2, TimeUnit.SECONDS)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build())
    }
    fun schedulePeriodic(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS).setConstraints(net).build())
    }
}

class ReminderWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (!Graph.ready) return Result.success()
        val repo = Graph.repo
        val s = repo.prefs.settingsNow()
        if (s.reminderEnabled) {
            Reminders.schedule(applicationContext, s.reminderTime) // next day
            val d = repo.data.first { it.loaded }
            val done = Stats.today(d).first
            if (done < s.dailyGoal) {
                val due = d.cards.count { Srs.isDue(it) } + Stats.newAvailable(d, repo)
                Reminders.notify(applicationContext, due)
            }
        }
        return Result.success()
    }
}

object Reminders {
    const val CHANNEL = "daily"
    fun schedule(ctx: Context, time: String) {
        val (h, m) = time.split(":").map { it.toIntOrNull() ?: 0 }
        val next = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, m); set(Calendar.SECOND, 0)
            if (timeInMillis <= System.currentTimeMillis() + 60_000) add(Calendar.DAY_OF_MONTH, 1)
        }
        WorkManager.getInstance(ctx).enqueueUniqueWork("reminder", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<ReminderWorker>().setInitialDelay(next.timeInMillis - System.currentTimeMillis(), TimeUnit.MILLISECONDS).build())
    }
    fun cancel(ctx: Context) = WorkManager.getInstance(ctx).cancelUniqueWork("reminder")

    fun notify(ctx: Context, due: Int) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val pi = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(ctx.getString(R.string.studyReminderTitle))
            .setContentText(ctx.getString(R.string.studyReminderBody, due))
            .setContentIntent(pi).setAutoCancel(true).build()
        NotificationManagerCompat.from(ctx).notify(1, n)
    }
}

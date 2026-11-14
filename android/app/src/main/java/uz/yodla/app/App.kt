package uz.yodla.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import uz.yodla.app.data.AuthManager
import uz.yodla.app.data.Remote
import uz.yodla.app.data.Repo
import uz.yodla.app.data.SyncManager
import uz.yodla.app.work.Reminders
import uz.yodla.app.work.SyncWork

/** Simple service locator: one repository per process. */
object Graph {
    lateinit var repo: Repo
    lateinit var sync: SyncManager
    lateinit var auth: AuthManager
    lateinit var remote: Remote
    lateinit var speaker: Speaker
    val ready get() = ::repo.isInitialized

    fun init(app: Application, repo: Repo = Repo(app)) {
        this.repo = repo
        sync = SyncManager(repo)
        auth = AuthManager(repo, sync)
        remote = Remote(app, repo)
        speaker = Speaker(app)
    }
}

class YodlaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
        Graph.repo.onChange = { SyncWork.schedule(this) }
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(Reminders.CHANNEL, getString(R.string.reminders), NotificationManager.IMPORTANCE_DEFAULT),
            )
        }
        SyncWork.schedulePeriodic(this)
    }
}

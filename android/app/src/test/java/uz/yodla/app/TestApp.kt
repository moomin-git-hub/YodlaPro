package uz.yodla.app

import android.app.Application
import uz.yodla.app.data.Repo
import uz.yodla.app.data.YodlaDb

/** Test application: in-memory database, no WorkManager. */
class TestApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this, Repo(this, YodlaDb.create(this, inMemory = true)))
    }
}

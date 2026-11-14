package uz.yodla.app.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface YodlaDao {
    @Query("select * from decks order by sortOrder, createdAt desc") fun decks(): Flow<List<Deck>>
    @Query("select * from cards") fun cards(): Flow<List<Card>>
    @Query("select * from folders order by createdAt") fun folders(): Flow<List<Folder>>
    @Query("select * from reviews order by ts") fun reviews(): Flow<List<ReviewLog>>
    @Query("select * from sessions order by startedAt") fun sessions(): Flow<List<StudySession>>
    @Query("select * from saved_public") fun saved(): Flow<List<SavedPublic>>
    @Query("select count(*) from outbox") fun outboxCount(): Flow<Int>

    @Query("select * from cards where id = :id") suspend fun card(id: String): Card?
    @Query("select * from cards where deckId = :deckId") suspend fun cardsOf(deckId: String): List<Card>
    @Query("select * from cards where noteId = :noteId order by createdAt") suspend fun note(noteId: String): List<Card>
    @Query("select * from decks where id = :id") suspend fun deck(id: String): Deck?
    @Query("select * from decks") suspend fun allDecks(): List<Deck>
    @Query("select * from cards") suspend fun allCards(): List<Card>
    @Query("select * from folders") suspend fun allFolders(): List<Folder>
    @Query("select * from reviews") suspend fun allReviews(): List<ReviewLog>
    @Query("select * from sessions") suspend fun allSessions(): List<StudySession>
    @Query("select * from saved_public") suspend fun allSaved(): List<SavedPublic>

    @Upsert suspend fun upsertDecks(d: List<Deck>)
    @Upsert suspend fun upsertCards(c: List<Card>)
    @Upsert suspend fun upsertFolders(f: List<Folder>)
    @Upsert suspend fun upsertReviews(r: List<ReviewLog>)
    @Upsert suspend fun upsertSessions(s: List<StudySession>)
    @Upsert suspend fun upsertSaved(s: List<SavedPublic>)

    @Query("delete from decks where id = :id") suspend fun deleteDeck(id: String)
    @Query("delete from cards where deckId = :deckId") suspend fun deleteCardsOfDeck(deckId: String)
    @Query("delete from cards where id in (:ids)") suspend fun deleteCards(ids: List<String>)
    @Query("delete from folders where id = :id") suspend fun deleteFolder(id: String)
    @Query("delete from reviews where id = :id") suspend fun deleteReview(id: String)
    @Query("delete from saved_public where publicDeckId = :id") suspend fun deleteSaved(id: String)

    @Insert suspend fun enqueue(ops: List<OutboxOp>)
    @Query("select * from outbox order by seq limit :n") suspend fun peek(n: Int): List<OutboxOp>
    @Query("delete from outbox where seq <= :seq") suspend fun ack(seq: Long)
    @Query("update outbox set json = :json where seq = :seq") suspend fun rewrite(seq: Long, json: String)
    @Query("select count(*) from outbox") suspend fun pending(): Int

    @Query("delete from decks") suspend fun clearDecks()
    @Query("delete from cards") suspend fun clearCards()
    @Query("delete from folders") suspend fun clearFolders()
    @Query("delete from reviews") suspend fun clearReviews()
    @Query("delete from sessions") suspend fun clearSessions()
    @Query("delete from saved_public") suspend fun clearSaved()
    @Query("delete from outbox") suspend fun clearOutbox()
}

@Database(
    entities = [Deck::class, Card::class, Folder::class, ReviewLog::class, StudySession::class, SavedPublic::class, OutboxOp::class],
    version = 3, exportSchema = true,
)
abstract class YodlaDb : RoomDatabase() {
    abstract fun dao(): YodlaDao
    companion object {
        fun create(ctx: Context, inMemory: Boolean = false): YodlaDb =
            (if (inMemory) Room.inMemoryDatabaseBuilder(ctx, YodlaDb::class.java).allowMainThreadQueries()
            else Room.databaseBuilder(ctx, YodlaDb::class.java, "yodla.db").addMigrations(M1_2, M2_3)).build()

        /** v3: FSRS memory state + per-deck algorithm (FSRS by default for new decks; existing decks keep SM-2 behaviour until changed). */
        val M2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE cards ADD COLUMN stability REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE cards ADD COLUMN difficulty REAL NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE decks ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'fsrs'")
            }
        }
        /** v2: subdecks. */
        val M1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) { db.execSQL("ALTER TABLE decks ADD COLUMN parentId TEXT") }
        }
    }
}

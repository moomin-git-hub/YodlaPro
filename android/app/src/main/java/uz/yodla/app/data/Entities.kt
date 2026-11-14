package uz.yodla.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "decks")
data class Deck(
    @PrimaryKey val id: String,
    val title: String,
    val description: String = "",
    val category: String = "general",
    val folderId: String? = null,
    val parentId: String? = null,
    val cover: String = "📘",
    val color: String = "violet",
    val image: String = "",
    val sourcePublicId: String? = null,
    val archived: Boolean = false,
    val preset: String = "standard",
    val algorithm: String = "fsrs",
    val style: String = "",          // JSON CardStyle
    val ttsFront: String = "",       // BCP-47 tag, empty = auto
    val ttsBack: String = "",
    val sortOrder: Int = 0,
    val createdAt: Long,
    val updatedAt: Long,
)

@Entity(tableName = "cards", indices = [Index("deckId"), Index("due"), Index("noteId")])
data class Card(
    @PrimaryKey val id: String,
    val deckId: String,
    val noteId: String,
    val type: String = CardType.BASIC,
    val front: String,
    val back: String,
    val example: String = "",
    val explanation: String = "",
    val image: String = "",
    val extra: String = "",          // JSON: cloze index / occlusion masks
    val difficult: Boolean = false,
    val bookmarked: Boolean = false,
    val frozen: Boolean = false,
    val reps: Int = 0,
    val lapses: Int = 0,
    val ease: Double = 2.5,
    val interval: Double = 0.0,
    val due: Long,
    val lastReview: Long? = null,
    val status: String = Status.NEW,
    val step: Int = 0,
    val stability: Double = 0.0,
    val difficulty: Double = 0.0,
    val createdAt: Long,
    val updatedAt: Long,
)

object CardType { const val BASIC = "basic"; const val REVERSE = "reverse"; const val CLOZE = "cloze"; const val OCCLUSION = "occlusion" }
object Status { const val NEW = "new"; const val LEARNING = "learning"; const val REVIEW = "review"; const val RELEARNING = "relearning" }

@Entity(tableName = "folders")
data class Folder(
    @PrimaryKey val id: String,
    val name: String,
    val color: String = "violet",
    val emoji: String = "📁",
    val createdAt: Long,
    val updatedAt: Long,
)

@Entity(tableName = "reviews", indices = [Index("cardId"), Index("ts")])
data class ReviewLog(
    @PrimaryKey val id: String,
    val cardId: String,
    val deckId: String,
    val rating: Int,
    val ts: Long,
    val durationMs: Long,
    val prevStatus: String,
    val prevInterval: Double,
    val newInterval: Double,
)

@Entity(tableName = "sessions")
data class StudySession(
    @PrimaryKey val id: String,
    val deckId: String?,
    val startedAt: Long,
    val endedAt: Long,
    val durationMs: Long,
    val cardsReviewed: Int,
    val correct: Int,
)

@Entity(tableName = "saved_public")
data class SavedPublic(@PrimaryKey val publicDeckId: String)

@Entity(tableName = "outbox")
data class OutboxOp(@PrimaryKey(autoGenerate = true) val seq: Long = 0, val json: String)

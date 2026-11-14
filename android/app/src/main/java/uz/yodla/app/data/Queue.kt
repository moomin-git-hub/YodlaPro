package uz.yodla.app.data

/**
 * Study-session queue. Learning/relearning cards wait in [learn] until their step time has really passed
 * (a card answered "Hard · 13m" comes back after 13 minutes, not after a few other cards).
 * Immutable: every operation returns a new queue, which makes undo trivial.
 */
data class QItem(val id: String, val mode: String = MODE_SRS) {
    companion object { const val MODE_SRS = "srs"; const val MODE_PRACTICE = "practice"; const val MODE_FAST = "fast" }
    val scheduled get() = mode == MODE_SRS
}

data class Learn(val id: String, val due: Long)

sealed interface Next {
    data class Show(val item: QItem, val queue: StudyQueue) : Next
    data class Wait(val until: Long) : Next
    data object Done : Next
}

data class StudyQueue(val main: List<QItem> = emptyList(), val learn: List<Learn> = emptyList()) {
    val size get() = main.size + learn.size
    val isEmpty get() = main.isEmpty() && learn.isEmpty()

    /**
     * Earliest due learning card first, otherwise the next main card, otherwise wait for the next learning card
     * (the study screen then offers more new words so the user can keep going).
     */
    fun next(now: Long, force: Boolean = false): Next {
        val ready = learn.filter { it.due <= now }.minByOrNull { it.due }
        if (ready != null) return Next.Show(QItem(ready.id), copy(learn = learn - ready))
        if (main.isNotEmpty()) return Next.Show(main.first(), copy(main = main.drop(1)))
        val soon = learn.minByOrNull { it.due } ?: return Next.Done
        return if (force) Next.Show(QItem(soon.id), copy(learn = learn - soon)) else Next.Wait(soon.due)
    }

    /** Adds more new cards (beyond today's limit) at the front of the queue. */
    fun withNew(items: List<QItem>) = copy(main = items + main)

    /** Put a scheduled card back for later today if it is still in learning. */
    fun afterAnswer(card: Card, endOfDay: Long): StudyQueue =
        if ((card.status == Status.LEARNING || card.status == Status.RELEARNING) && card.due <= endOfDay && !card.frozen)
            copy(learn = learn.filter { it.id != card.id } + Learn(card.id, card.due)) else this

    /** Practice / fast review: "Again" shows the card again a few cards later. */
    fun requeue(item: QItem, gap: Int = 3) = copy(main = main.toMutableList().apply { add(minOf(size, gap), item) })
}

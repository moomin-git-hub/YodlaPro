// Telegram bot @yodlaPro_bot: study cards in chat, add cards (text / photo / voice via AI), reminders,
// streak saver, mini-tests, monthly goal, opt-in weekly ranking, PDF/Excel/Word reports and the Mini App.
import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';
import { requireAuth, signToken, publicUser } from './auth.js';
import { wrap } from './util.js';
import { nextCard, dueCount, labels, review, targetDeck, addCards, setReverse, hasReverse, deleteCards, streaks, startOfDay, DAY, toCard, presetFor, settingsOf, reportData,
  deckList, deckTree, deckCards, createDeck, deleteDeck, deleteNotes, editNote, flagNote, resetCards, searchCards, todayData, updateSettings, isUuid } from './cards.js';
import { buildReport } from './reports.js';
import { callAI, buildPrompt, parseCards, aiConfigured } from './ai.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const API = (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '');
export const BOT = (process.env.TELEGRAM_BOT_USERNAME || 'yodlaPro_bot').replace(/^@/, '');
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://yodla.onrender.com').replace(/\/$/, '');
const HOOK = createHash('sha256').update('yodla-hook:' + TOKEN).digest('hex').slice(0, 32); // webhook path + secret header
export const telegramEnabled = !!TOKEN;

// ---------------- texts ----------------
const T = {
  uz: {
    hello: (n) => `Salom${n ? ', ' + n : ''}! 👋 Men <b>Yodla</b> botiman.\n\n▶️ /oqish — kartalarni shu yerda takrorlash\n⚡ /test — 5 ta so'zli mini-test\n➕ So'z qo'shish: <code>apple - olma - misol - izoh</code> deb yozing yoki /qoshish, yoki rasm 📷 / ovozli xabar 🎤 / matn yuboring — AI karta yasaydi\n📊 /hisobot — PDF, Excel, Word hisobot\n🎯 /maqsad 600 — oylik maqsad\n🏆 /reyting — haftalik reyting\n🗂 /decklar — decklar va kartalarni boshqarish\n📅 /bugun — bugungi hisobot\n🔎 /qidir so‘z — qidirish\n⚙️ /sozlamalar — eslatmalar va boshqalar`,
    notLinked: `Avval Yodla hisobingizni ulang:\nIlova → <b>Profil → Telegram'ni ulash</b>.\n\nHisobingiz bo'lmasa — ilovani oching 👇`,
    linked: (n) => `✅ Hisob ulandi: <b>${n}</b>\n\nEndi kartalaringizni shu yerda takrorlashingiz mumkin.`,
    badCode: `Bu havola eskirgan. Ilovada <b>Telegram'ni ulash</b> tugmasini qayta bosing.`,
    openApp: '📱 Yodla’ni ochish', study: (n) => `▶️ O'qish${n ? ` (${n})` : ''}`, mini: '⚡ 5 ta mini-test', show: '👁 Javobni ko‘rish', stop: '⏹ Tugatish', listen: '🔊',
    ratings: ['Again', 'Hard', 'Good', 'Easy'], left: (n) => `${n} ta qoldi`,
    nothing: `🎉 Hozircha takrorlash uchun karta yo'q. Yangi so'z qo'shing yoki keyinroq qayting.`,
    wait: (m) => `⏳ Keyingi karta ${m} daqiqadan keyin qaytadi. Shu orada dam oling!`,
    done: (n, c) => `🏁 Seans tugadi: <b>${n}</b> ta karta, <b>${c}</b> tasi to'g'ri.`,
    miniDone: (n, c) => `⚡ Mini-test tugadi: ${c}/${n} to'g'ri.`,
    added: (n, d) => `✅ ${n} ta karta <b>«${d}»</b> deckiga qo'shildi.`, undo: '↩ Bekor qilish', undone: '↩ Bekor qilindi.',
    aiThinking: '🤖 AI kartalar tayyorlayapti…', aiPreview: (n) => `🤖 ${n} ta karta tayyor. Qo'shaymi?`, addOk: '✅ Qo‘shish', addNo: '❌ Kerak emas', cancelled: 'Bekor qilindi.',
    aiOff: 'AI serverda yoqilmagan. So‘zni <code>apple - olma</code> ko‘rinishida yozing.', aiFail: (e) => `AI xatosi: ${e}`, aiBusy: 'AI hozir juda band. Bir daqiqadan keyin qayta urinib ko‘ring.',
    reportPick: '📊 Qaysi hisobot kerak?', pdf: '📄 PDF hisobot', xlsx: '📗 Excel (barcha kartalar)', docx: '📝 Word (qiyin so‘zlar)', week: '7 kun', month: '30 kun', preparing: '⏳ Tayyorlanyapti…',
    remind: (n) => `🔔 <b>${n}</b> ta karta sizni kutyapti. 5 daqiqa ajrating!`,
    streakSave: (n) => `🔥 Seriyangiz <b>${n}</b> kun! Bugun hali o'qimadingiz — seriyani yo'qotmang.`,
    weekly: (r, a, s) => `📊 <b>Haftalik hisobot</b>\n${r} ta takror · ${a}% aniqlik · 🔥 ${s} kun`,
    goalSet: (g) => `🎯 Oylik maqsad: <b>${g}</b> ta yangi so'z.`, goalHelp: 'Masalan: <code>/maqsad 600</code> — shu oyda 600 ta yangi so‘z.',
    goal: (d, g, need, daysLeft) => `🎯 Bu oy: <b>${d}/${g}</b> ta yangi so'z.\n${d >= g ? 'Maqsadga yetdingiz! 🎉' : `Qoldi ${g - d} ta — kuniga ~${need} ta (${daysLeft} kun qoldi).`}`,
    rankOff: '🏆 Haftalik reyting — qatnashuvchilar kim ko‘p takrorlaganini ko‘radi (faqat ismingiz ko‘rinadi).', join: '✅ Qatnashish', leave: '🚪 Chiqish',
    rank: (rows, me) => `🏆 <b>Haftalik reyting</b> (7 kun)\n\n${rows || '—'}${me ? `\n\nSiz: ${me}-o'rin` : ''}`,
    settings: '⚙️ <b>Sozlamalar</b>\nEslatma vaqtlarini tanlang (bir nechtasini tanlash mumkin):', streakSaver: 'Seriya eslatmasi', weeklyReport: 'Haftalik hisobot', ranking: 'Reytingda qatnashish', deckFor: (d) => `➕ Yangi kartalar: «${d}»`, chooseDeck: 'Yangi kartalar qaysi deckka qo‘shilsin?',
    unlinked: 'Hisob uzildi.', help: 'Yordam: /start',
  },
  en: {
    hello: (n) => `Hi${n ? ', ' + n : ''}! 👋 I'm the <b>Yodla</b> bot.\n\n▶️ /study — review your cards right here\n⚡ /test — 5-word mini test\n➕ Add words: type <code>apple - olma - example - explanation</code> or /add, or send a photo 📷 / voice 🎤 / text — AI makes cards\n📊 /report — PDF, Excel, Word reports\n🎯 /goal 600 — monthly goal\n🏆 /top — weekly ranking\n🗂 /decks — manage decks and cards\n📅 /today — today’s report\n🔎 /search word — find cards\n⚙️ /settings — reminders and more`,
    notLinked: `Connect your Yodla account first:\nApp → <b>Profile → Connect Telegram</b>.\n\nNo account yet? Open the app 👇`,
    linked: (n) => `✅ Account connected: <b>${n}</b>\n\nYou can now review your cards here.`,
    badCode: `This link has expired. Tap <b>Connect Telegram</b> in the app again.`,
    openApp: '📱 Open Yodla', study: (n) => `▶️ Study${n ? ` (${n})` : ''}`, mini: '⚡ 5-card mini test', show: '👁 Show answer', stop: '⏹ Finish', listen: '🔊',
    ratings: ['Again', 'Hard', 'Good', 'Easy'], left: (n) => `${n} left`,
    nothing: `🎉 Nothing to review right now. Add new words or come back later.`,
    wait: (m) => `⏳ The next card comes back in ${m} min. Take a short break!`,
    done: (n, c) => `🏁 Session finished: <b>${n}</b> cards, <b>${c}</b> correct.`,
    miniDone: (n, c) => `⚡ Mini test done: ${c}/${n} correct.`,
    added: (n, d) => `✅ ${n} card(s) added to <b>«${d}»</b>.`, undo: '↩ Undo', undone: '↩ Undone.',
    aiThinking: '🤖 AI is making cards…', aiPreview: (n) => `🤖 ${n} card(s) ready. Add them?`, addOk: '✅ Add', addNo: '❌ No', cancelled: 'Cancelled.',
    aiOff: 'AI is not enabled on the server. Type the word as <code>apple - olma</code>.', aiFail: (e) => `AI error: ${e}`, aiBusy: 'AI is very busy right now. Please try again in a minute.',
    reportPick: '📊 Which report?', pdf: '📄 PDF report', xlsx: '📗 Excel (all cards)', docx: '📝 Word (hard words)', week: '7 days', month: '30 days', preparing: '⏳ Preparing…',
    remind: (n) => `🔔 <b>${n}</b> cards are waiting. Take 5 minutes!`,
    streakSave: (n) => `🔥 Your streak is <b>${n}</b> days! You haven't studied today — don't lose it.`,
    weekly: (r, a, s) => `📊 <b>Weekly report</b>\n${r} reviews · ${a}% accuracy · 🔥 ${s} days`,
    goalSet: (g) => `🎯 Monthly goal: <b>${g}</b> new words.`, goalHelp: 'Example: <code>/goal 600</code> — 600 new words this month.',
    goal: (d, g, need, daysLeft) => `🎯 This month: <b>${d}/${g}</b> new words.\n${d >= g ? 'Goal reached! 🎉' : `${g - d} to go — about ${need} a day (${daysLeft} days left).`}`,
    rankOff: '🏆 Weekly ranking — participants see who reviewed most (only your name is shown).', join: '✅ Join', leave: '🚪 Leave',
    rank: (rows, me) => `🏆 <b>Weekly ranking</b> (7 days)\n\n${rows || '—'}${me ? `\n\nYou: #${me}` : ''}`,
    settings: '⚙️ <b>Settings</b>\nChoose reminder times (several allowed):', streakSaver: 'Streak reminder', weeklyReport: 'Weekly report', ranking: 'Join ranking', deckFor: (d) => `➕ New cards go to «${d}»`, chooseDeck: 'Which deck should new cards go to?',
    unlinked: 'Account disconnected.', help: 'Help: /start',
  },
  ru: {
    hello: (n) => `Привет${n ? ', ' + n : ''}! 👋 Я бот <b>Yodla</b>.\n\n▶️ /study — повторять карточки прямо здесь\n⚡ /test — мини-тест из 5 слов\n➕ Добавить слова: напишите <code>apple - яблоко - пример - пояснение</code> или /add, или отправьте фото 📷 / голосовое 🎤 / текст — ИИ сделает карточки\n📊 /report — отчёты PDF, Excel, Word\n🎯 /goal 600 — цель на месяц\n🏆 /top — рейтинг недели\n🗂 /decks — колоды и карточки\n📅 /today — отчёт за день\n🔎 /search слово — поиск\n⚙️ /settings — напоминания и другое`,
    notLinked: `Сначала подключите аккаунт Yodla:\nПриложение → <b>Профиль → Подключить Telegram</b>.\n\nНет аккаунта? Откройте приложение 👇`,
    linked: (n) => `✅ Аккаунт подключён: <b>${n}</b>\n\nТеперь можно повторять карточки здесь.`,
    badCode: `Ссылка устарела. Нажмите <b>Подключить Telegram</b> в приложении ещё раз.`,
    openApp: '📱 Открыть Yodla', study: (n) => `▶️ Учить${n ? ` (${n})` : ''}`, mini: '⚡ Мини-тест (5)', show: '👁 Показать ответ', stop: '⏹ Завершить', listen: '🔊',
    ratings: ['Again', 'Hard', 'Good', 'Easy'], left: (n) => `осталось ${n}`,
    nothing: `🎉 Сейчас нечего повторять. Добавьте новые слова или вернитесь позже.`,
    wait: (m) => `⏳ Следующая карточка вернётся через ${m} мин. Отдохните!`,
    done: (n, c) => `🏁 Сессия завершена: <b>${n}</b> карточек, <b>${c}</b> верно.`,
    miniDone: (n, c) => `⚡ Мини-тест: ${c}/${n} верно.`,
    added: (n, d) => `✅ Добавлено карточек: ${n} в <b>«${d}»</b>.`, undo: '↩ Отменить', undone: '↩ Отменено.',
    aiThinking: '🤖 ИИ делает карточки…', aiPreview: (n) => `🤖 Готово карточек: ${n}. Добавить?`, addOk: '✅ Добавить', addNo: '❌ Не надо', cancelled: 'Отменено.',
    aiOff: 'ИИ не включён на сервере. Напишите слово как <code>apple - яблоко</code>.', aiFail: (e) => `Ошибка ИИ: ${e}`, aiBusy: 'ИИ сейчас перегружен. Попробуйте через минуту.',
    reportPick: '📊 Какой отчёт нужен?', pdf: '📄 Отчёт PDF', xlsx: '📗 Excel (все карточки)', docx: '📝 Word (трудные слова)', week: '7 дней', month: '30 дней', preparing: '⏳ Готовлю…',
    remind: (n) => `🔔 Вас ждут <b>${n}</b> карточек. Уделите 5 минут!`,
    streakSave: (n) => `🔥 Ваша серия — <b>${n}</b> дн.! Сегодня вы ещё не занимались — не потеряйте её.`,
    weekly: (r, a, s) => `📊 <b>Недельный отчёт</b>\n${r} повторений · ${a}% точность · 🔥 ${s} дн.`,
    goalSet: (g) => `🎯 Цель на месяц: <b>${g}</b> новых слов.`, goalHelp: 'Например: <code>/goal 600</code> — 600 новых слов в этом месяце.',
    goal: (d, g, need, daysLeft) => `🎯 В этом месяце: <b>${d}/${g}</b> новых слов.\n${d >= g ? 'Цель достигнута! 🎉' : `Осталось ${g - d} — примерно ${need} в день (${daysLeft} дн.).`}`,
    rankOff: '🏆 Рейтинг недели — участники видят, кто больше повторил (видно только имя).', join: '✅ Участвовать', leave: '🚪 Выйти',
    rank: (rows, me) => `🏆 <b>Рейтинг недели</b> (7 дней)\n\n${rows || '—'}${me ? `\n\nВы: ${me}-е место` : ''}`,
    settings: '⚙️ <b>Настройки</b>\nВыберите время напоминаний (можно несколько):', streakSaver: 'Напоминание о серии', weeklyReport: 'Недельный отчёт', ranking: 'Участвовать в рейтинге', deckFor: (d) => `➕ Новые карточки: «${d}»`, chooseDeck: 'В какую колоду добавлять новые карточки?',
    unlinked: 'Аккаунт отключён.', help: 'Помощь: /start',
  },
};
// texts for deck / card management, the add-card wizard, daily report and stats (merged into T below)
const T2 = {
  uz: {
    menu: '🏠 <b>Asosiy menyu</b>', mDecks: '🗂 Decklar', mAdd: '➕ Karta qo‘shish', mSearch: '🔎 Qidirish', mStats: '📊 Statistika', mToday: '📅 Bugungi hisobot', mReports: '📄 Hisobotlar', mSettings: '⚙️ Sozlamalar', mMenu: '🏠 Menyu',
    decks: (n) => `🗂 <b>Decklar</b> (${n})\nDeckni tanlang:`, noDecks: 'Hali deck yo‘q. Birinchisini yarating 👇', newDeck: '➕ Yangi deck', back: '⬅️ Orqaga', prev: '◀️', next: '▶️',
    deckInfo: (d, s) => `${d.cover || '📘'} <b>${d.title}</b>${d.archived ? ' · 🗄' : ''}\n\n📚 Jami: <b>${s.total}</b> · 🆕 Yangi: <b>${s.fresh}</b> · ⏰ Bugun: <b>${s.due}</b>`,
    studyDeck: '▶️ Shu deckni o‘qish', addHere: '➕ Shu deckka qo‘shish', cardsList: '📋 Kartalar', rename: '✏️ Nomini o‘zgartirish', archive: '🗄 Arxivlash', unarchive: '📤 Arxivdan chiqarish', del: '🗑 O‘chirish', subdeck: '📁 Ichki deck',
    sureDeck: (t, n) => `⚠️ <b>«${t}»</b> deckini${n > 1 ? ` (${n - 1} ta ichki deck bilan)` : ''} va undagi barcha kartalarni o‘chiraymi? Buni qaytarib bo‘lmaydi.`, yesDel: '🗑 Ha, o‘chirish', no: 'Yo‘q',
    deckDeleted: '🗑 Deck o‘chirildi.', askDeckName: '✏️ Yangi deck nomini yozing:', askRename: '✏️ Yangi nomni yozing:', deckCreated: (t) => `✅ <b>«${t}»</b> deck yaratildi.`, renamed: '✅ Nomi o‘zgardi.',
    cards: (t, n, p, pages) => `📋 <b>${t}</b> — ${n} ta karta${pages > 1 ? ` · ${p}/${pages}` : ''}`, noCards: 'Bu deckda hali karta yo‘q.',
    card: (c) => `🃏 <b>Savol:</b> ${c.q}\n<b>Javob:</b> ${c.a}${c.ex ? `\n\n<b>Misol:</b> <i>${c.ex}</i>` : ''}${c.xp ? `\n<b>Izoh:</b> ${c.xp}` : ''}\n\n📘 ${c.deck} · ${c.status}`,
    stNew: 'yangi', stLearn: 'o‘rganilmoqda', stReview: (d) => `takrorlash: ${d}`, stFrozen: '❄️ muzlatilgan',
    eFront: '✏️ Savol', eBack: '✏️ Javob', eEx: '✏️ Misol', eXp: '✏️ Izoh', bm: '⭐ Belgilash', unbm: '⭐ Belgini olish', freeze: '❄️ Muzlatish', unfreeze: '🔥 Muzdan chiqarish', reset: '🔄 Progressni tiklash', delCard: '🗑 O‘chirish', toDeck: '⬅️ Deckka',
    askField: { front: 'Yangi <b>savol</b>ni yozing:', back: 'Yangi <b>javob</b>ni yozing:', example: 'Yangi <b>misol</b>ni yozing (o‘chirish uchun <code>-</code>):', explanation: 'Yangi <b>izoh</b>ni yozing (o‘chirish uchun <code>-</code>):' },
    edited: '✅ Saqlandi.', sureCard: '⚠️ Kartani o‘chiraymi?', cardDeleted: '🗑 Karta o‘chirildi.', resetDone: '🔄 Karta yana yangi bo‘ldi.', cancel: '✖️ Bekor qilish',
    wFront: (d) => `➕ <b>Yangi karta</b> → «${d}»\n\n1/4 · <b>Savol</b>ni yozing (masalan: <code>apple</code>):`, wBack: '2/4 · <b>Javob</b>ni yozing (masalan: <code>olma</code>):',
    wEx: '3/4 · <b>Misol</b> yozing (masalan: <code>I eat an apple every day.</code>) yoki o‘tkazib yuboring:', wXp: '4/4 · <b>Izoh</b> yozing (qo‘shimcha ma’lumot) yoki o‘tkazib yuboring:', skip: '⏭ O‘tkazish', aiFill: '✨ AI to‘ldirsin',
    wSaved: (d) => `✅ Karta <b>«${d}»</b> deckiga saqlandi:`, addMore: '➕ Yana qo‘shish', enrich: '✨ AI: misol + izoh', enriching: '✨ AI misol va izoh yozyapti…', enriched: (n) => `✨ ${n} ta kartaga misol va izoh qo‘shildi.`,
    askSearch: '🔎 Qidirilayotgan so‘zni yozing:', found: (n, s) => `🔎 «${s}» — ${n} ta natija:`, notFound: (s) => `🔎 «${s}» bo‘yicha hech narsa topilmadi.`,
    stats: (s) => `📊 <b>Statistika</b>\n\n📚 Kartalar: <b>${s.all}</b> (🆕 ${s.new} · 📖 ${s.learning} · 🏆 ${s.mastered})\n🔥 Seriya: <b>${s.streak}</b> kun (eng uzun: ${s.best})\n\n<b>Oxirgi 7 kun</b>\n${s.week}\n\n🗓 7 kunda: ${s.reviews} ta takror · ${s.acc}% aniqlik · ${s.learnedNew} ta yangi so‘z`,
    daily: (d) => `📅 <b>Bugungi hisobot</b>\n\n🔁 Takrorlar: <b>${d.reviews}</b> (${d.cards} ta karta)\n🆕 Yangi so‘zlar: <b>${d.learnedNew}</b>\n🎯 Aniqlik: <b>${d.acc}%</b>\n⏱ Vaqt: <b>${d.minutes}</b> daqiqa\n🔥 Seriya: <b>${d.streak}</b> kun${d.hard ? `\n\n😓 <b>Qiyin bo‘lganlar:</b>\n${d.hard}` : ''}\n\n📆 Ertaga: <b>${d.tomorrow}</b> ta takror kutadi.`,
    dailyNone: (d) => `📅 <b>Bugungi hisobot</b>\n\nBugun hali o‘qimadingiz. 🔥 Seriya: <b>${d.streak}</b> kun.\n⏰ Hozir <b>${d.due}</b> ta karta kutyapti.`,
    revLabel: '🔁 Teskari karta', revNA: 'Cloze kartalarda teskari karta bo‘lmaydi.', dailyReport: 'Kunlik hisobot', newPerDay: (n) => `🆕 Kuniga yangi so‘z: ${n}`, shuffle: 'Aralashtirish', fmtHelp: 'Bir qatorda: <code>savol - javob - misol - izoh +r</code> (<code>+r</code> = 🔁 teskari karta)\n<code>savol - javob | misol | izoh</code>',
  },
  en: {
    menu: '🏠 <b>Main menu</b>', mDecks: '🗂 Decks', mAdd: '➕ Add card', mSearch: '🔎 Search', mStats: '📊 Statistics', mToday: '📅 Today’s report', mReports: '📄 Reports', mSettings: '⚙️ Settings', mMenu: '🏠 Menu',
    decks: (n) => `🗂 <b>Decks</b> (${n})\nChoose a deck:`, noDecks: 'No decks yet. Create your first one 👇', newDeck: '➕ New deck', back: '⬅️ Back', prev: '◀️', next: '▶️',
    deckInfo: (d, s) => `${d.cover || '📘'} <b>${d.title}</b>${d.archived ? ' · 🗄' : ''}\n\n📚 Total: <b>${s.total}</b> · 🆕 New: <b>${s.fresh}</b> · ⏰ Today: <b>${s.due}</b>`,
    studyDeck: '▶️ Study this deck', addHere: '➕ Add to this deck', cardsList: '📋 Cards', rename: '✏️ Rename', archive: '🗄 Archive', unarchive: '📤 Unarchive', del: '🗑 Delete', subdeck: '📁 Subdeck',
    sureDeck: (t, n) => `⚠️ Delete deck <b>«${t}»</b>${n > 1 ? ` (with ${n - 1} subdecks)` : ''} and all its cards? This can’t be undone.`, yesDel: '🗑 Yes, delete', no: 'No',
    deckDeleted: '🗑 Deck deleted.', askDeckName: '✏️ Type the new deck’s name:', askRename: '✏️ Type the new name:', deckCreated: (t) => `✅ Deck <b>«${t}»</b> created.`, renamed: '✅ Renamed.',
    cards: (t, n, p, pages) => `📋 <b>${t}</b> — ${n} cards${pages > 1 ? ` · ${p}/${pages}` : ''}`, noCards: 'No cards in this deck yet.',
    card: (c) => `🃏 <b>Question:</b> ${c.q}\n<b>Answer:</b> ${c.a}${c.ex ? `\n\n<b>Example:</b> <i>${c.ex}</i>` : ''}${c.xp ? `\n<b>Explanation:</b> ${c.xp}` : ''}\n\n📘 ${c.deck} · ${c.status}`,
    stNew: 'new', stLearn: 'learning', stReview: (d) => `review: ${d}`, stFrozen: '❄️ frozen',
    eFront: '✏️ Question', eBack: '✏️ Answer', eEx: '✏️ Example', eXp: '✏️ Explanation', bm: '⭐ Bookmark', unbm: '⭐ Remove bookmark', freeze: '❄️ Freeze', unfreeze: '🔥 Unfreeze', reset: '🔄 Reset progress', delCard: '🗑 Delete', toDeck: '⬅️ To deck',
    askField: { front: 'Type the new <b>question</b>:', back: 'Type the new <b>answer</b>:', example: 'Type the new <b>example</b> (<code>-</code> to clear):', explanation: 'Type the new <b>explanation</b> (<code>-</code> to clear):' },
    edited: '✅ Saved.', sureCard: '⚠️ Delete this card?', cardDeleted: '🗑 Card deleted.', resetDone: '🔄 The card is new again.', cancel: '✖️ Cancel',
    wFront: (d) => `➕ <b>New card</b> → «${d}»\n\n1/4 · Type the <b>question</b> (e.g. <code>apple</code>):`, wBack: '2/4 · Type the <b>answer</b> (e.g. <code>olma</code>):',
    wEx: '3/4 · Type an <b>example</b> (e.g. <code>I eat an apple every day.</code>) or skip:', wXp: '4/4 · Type an <b>explanation</b> (extra info) or skip:', skip: '⏭ Skip', aiFill: '✨ Let AI fill it',
    wSaved: (d) => `✅ Card saved to <b>«${d}»</b>:`, addMore: '➕ Add another', enrich: '✨ AI: example + explanation', enriching: '✨ AI is writing examples and explanations…', enriched: (n) => `✨ Added examples and explanations to ${n} card(s).`,
    askSearch: '🔎 Type a word to search:', found: (n, s) => `🔎 «${s}» — ${n} result(s):`, notFound: (s) => `🔎 Nothing found for «${s}».`,
    stats: (s) => `📊 <b>Statistics</b>\n\n📚 Cards: <b>${s.all}</b> (🆕 ${s.new} · 📖 ${s.learning} · 🏆 ${s.mastered})\n🔥 Streak: <b>${s.streak}</b> days (best: ${s.best})\n\n<b>Last 7 days</b>\n${s.week}\n\n🗓 7 days: ${s.reviews} reviews · ${s.acc}% accuracy · ${s.learnedNew} new words`,
    daily: (d) => `📅 <b>Today’s report</b>\n\n🔁 Reviews: <b>${d.reviews}</b> (${d.cards} cards)\n🆕 New words: <b>${d.learnedNew}</b>\n🎯 Accuracy: <b>${d.acc}%</b>\n⏱ Time: <b>${d.minutes}</b> min\n🔥 Streak: <b>${d.streak}</b> days${d.hard ? `\n\n😓 <b>Hard today:</b>\n${d.hard}` : ''}\n\n📆 Tomorrow: <b>${d.tomorrow}</b> reviews waiting.`,
    dailyNone: (d) => `📅 <b>Today’s report</b>\n\nYou haven’t studied today yet. 🔥 Streak: <b>${d.streak}</b> days.\n⏰ <b>${d.due}</b> cards are waiting now.`,
    revLabel: '🔁 Reverse card', revNA: 'Cloze cards have no reverse.', dailyReport: 'Daily report', newPerDay: (n) => `🆕 New words per day: ${n}`, shuffle: 'Shuffle', fmtHelp: 'One line: <code>question - answer - example - explanation +r</code> (<code>+r</code> = 🔁 reverse card)',
  },
  ru: {
    menu: '🏠 <b>Главное меню</b>', mDecks: '🗂 Колоды', mAdd: '➕ Добавить карточку', mSearch: '🔎 Поиск', mStats: '📊 Статистика', mToday: '📅 Отчёт за день', mReports: '📄 Отчёты', mSettings: '⚙️ Настройки', mMenu: '🏠 Меню',
    decks: (n) => `🗂 <b>Колоды</b> (${n})\nВыберите колоду:`, noDecks: 'Колод пока нет. Создайте первую 👇', newDeck: '➕ Новая колода', back: '⬅️ Назад', prev: '◀️', next: '▶️',
    deckInfo: (d, s) => `${d.cover || '📘'} <b>${d.title}</b>${d.archived ? ' · 🗄' : ''}\n\n📚 Всего: <b>${s.total}</b> · 🆕 Новых: <b>${s.fresh}</b> · ⏰ Сегодня: <b>${s.due}</b>`,
    studyDeck: '▶️ Учить эту колоду', addHere: '➕ Добавить сюда', cardsList: '📋 Карточки', rename: '✏️ Переименовать', archive: '🗄 В архив', unarchive: '📤 Из архива', del: '🗑 Удалить', subdeck: '📁 Подколода',
    sureDeck: (t, n) => `⚠️ Удалить колоду <b>«${t}»</b>${n > 1 ? ` (с ${n - 1} подколодами)` : ''} и все её карточки? Это нельзя отменить.`, yesDel: '🗑 Да, удалить', no: 'Нет',
    deckDeleted: '🗑 Колода удалена.', askDeckName: '✏️ Напишите название новой колоды:', askRename: '✏️ Напишите новое название:', deckCreated: (t) => `✅ Колода <b>«${t}»</b> создана.`, renamed: '✅ Переименовано.',
    cards: (t, n, p, pages) => `📋 <b>${t}</b> — карточек: ${n}${pages > 1 ? ` · ${p}/${pages}` : ''}`, noCards: 'В этой колоде пока нет карточек.',
    card: (c) => `🃏 <b>Вопрос:</b> ${c.q}\n<b>Ответ:</b> ${c.a}${c.ex ? `\n\n<b>Пример:</b> <i>${c.ex}</i>` : ''}${c.xp ? `\n<b>Пояснение:</b> ${c.xp}` : ''}\n\n📘 ${c.deck} · ${c.status}`,
    stNew: 'новая', stLearn: 'изучается', stReview: (d) => `повтор: ${d}`, stFrozen: '❄️ заморожена',
    eFront: '✏️ Вопрос', eBack: '✏️ Ответ', eEx: '✏️ Пример', eXp: '✏️ Пояснение', bm: '⭐ В закладки', unbm: '⭐ Убрать закладку', freeze: '❄️ Заморозить', unfreeze: '🔥 Разморозить', reset: '🔄 Сбросить прогресс', delCard: '🗑 Удалить', toDeck: '⬅️ К колоде',
    askField: { front: 'Напишите новый <b>вопрос</b>:', back: 'Напишите новый <b>ответ</b>:', example: 'Напишите новый <b>пример</b> (<code>-</code> — очистить):', explanation: 'Напишите новое <b>пояснение</b> (<code>-</code> — очистить):' },
    edited: '✅ Сохранено.', sureCard: '⚠️ Удалить карточку?', cardDeleted: '🗑 Карточка удалена.', resetDone: '🔄 Карточка снова новая.', cancel: '✖️ Отмена',
    wFront: (d) => `➕ <b>Новая карточка</b> → «${d}»\n\n1/4 · Напишите <b>вопрос</b> (например: <code>apple</code>):`, wBack: '2/4 · Напишите <b>ответ</b> (например: <code>яблоко</code>):',
    wEx: '3/4 · Напишите <b>пример</b> (например: <code>I eat an apple every day.</code>) или пропустите:', wXp: '4/4 · Напишите <b>пояснение</b> или пропустите:', skip: '⏭ Пропустить', aiFill: '✨ Пусть ИИ заполнит',
    wSaved: (d) => `✅ Карточка сохранена в <b>«${d}»</b>:`, addMore: '➕ Добавить ещё', enrich: '✨ ИИ: пример + пояснение', enriching: '✨ ИИ пишет примеры и пояснения…', enriched: (n) => `✨ Добавлены примеры и пояснения: ${n}.`,
    askSearch: '🔎 Напишите слово для поиска:', found: (n, s) => `🔎 «${s}» — найдено: ${n}`, notFound: (s) => `🔎 По «${s}» ничего не найдено.`,
    stats: (s) => `📊 <b>Статистика</b>\n\n📚 Карточек: <b>${s.all}</b> (🆕 ${s.new} · 📖 ${s.learning} · 🏆 ${s.mastered})\n🔥 Серия: <b>${s.streak}</b> дн. (рекорд: ${s.best})\n\n<b>Последние 7 дней</b>\n${s.week}\n\n🗓 За 7 дней: ${s.reviews} повторений · ${s.acc}% точность · ${s.learnedNew} новых слов`,
    daily: (d) => `📅 <b>Отчёт за день</b>\n\n🔁 Повторений: <b>${d.reviews}</b> (${d.cards} карточек)\n🆕 Новых слов: <b>${d.learnedNew}</b>\n🎯 Точность: <b>${d.acc}%</b>\n⏱ Время: <b>${d.minutes}</b> мин\n🔥 Серия: <b>${d.streak}</b> дн.${d.hard ? `\n\n😓 <b>Трудные сегодня:</b>\n${d.hard}` : ''}\n\n📆 Завтра: <b>${d.tomorrow}</b> повторений.`,
    dailyNone: (d) => `📅 <b>Отчёт за день</b>\n\nСегодня вы ещё не занимались. 🔥 Серия: <b>${d.streak}</b> дн.\n⏰ Сейчас ждут <b>${d.due}</b> карточек.`,
    revLabel: '🔁 Обратная карточка', revNA: 'У cloze-карточек нет обратной.', dailyReport: 'Ежедневный отчёт', newPerDay: (n) => `🆕 Новых слов в день: ${n}`, shuffle: 'Перемешивать', fmtHelp: 'Одной строкой: <code>вопрос - ответ - пример - пояснение +r</code> (<code>+r</code> = 🔁 обратная карточка)',
  },
};
for (const l of Object.keys(T)) Object.assign(T[l], T2[l]);

const REMINDER_TIMES = ['08:00', '12:00', '14:00', '18:00', '20:00', '22:00'];
const DAILY_TIMES = ['19:00', '20:00', '21:00', '22:00', '23:00'];
const DEFAULT_PREFS = { reminders: ['20:00'], streakSaver: true, weeklyReport: true, leaderboard: false, dailyReport: true, dailyTime: '21:00', reverse: false };

// ---------------- Telegram API ----------------
async function tg(method, body) {
  if (!TOKEN) return null;
  const isForm = body instanceof FormData;
  const r = await fetch(`${API}/bot${TOKEN}/${method}`, { method: 'POST', headers: isForm ? undefined : { 'content-type': 'application/json' }, body: isForm ? body : JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { const e = new Error(j.description ?? `Telegram ${method} ${r.status}`); e.tg = j; throw e; }
  return j.result;
}
const send = (chat_id, text, extra = {}) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const kb = (rows) => ({ reply_markup: { inline_keyboard: rows } });
async function sendFile(chat_id, buffer, name, mime, caption) {
  const f = new FormData();
  f.append('chat_id', String(chat_id)); if (caption) { f.append('caption', caption); f.append('parse_mode', 'HTML'); }
  f.append('document', new Blob([buffer], { type: mime }), name);
  return tg('sendDocument', f);
}
async function download(file_id) {
  const f = await tg('getFile', { file_id });
  if (!f?.file_path) throw new Error('file not found');
  if (f.file_size > 18 * 1024 * 1024) throw new Error('file too large (max 18 MB)');
  const r = await fetch(`${API}/file/bot${TOKEN}/${f.file_path}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------------- helpers ----------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Rich card HTML → the small HTML subset Telegram supports. */
export function tgHtml(html) {
  const keep = [];
  let s = String(html ?? '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/?(b|strong|i|em|u|s|strike|del|code|pre)(\s[^>]*)?>/gi, (m, tag) => {
      const closing = m.startsWith('</'); const t = { strong: 'b', em: 'i', strike: 's', del: 's' }[tag.toLowerCase()] ?? tag.toLowerCase();
      keep.push(`<${closing ? '/' : ''}${t}>`); return `\u0000${keep.length - 1}\u0000`;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  s = esc(s).replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]).replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
const plainText = (h) => tgHtml(h).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Question / answer of a card as shown in Telegram (reverse and cloze cards included). */
function faces(card) {
  if (card.cardType === 'cloze') {
    let c = 1; try { c = JSON.parse(card.extra || '{}').c ?? 1; } catch { /* default */ }
    const re = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;
    return { q: tgHtml(card.front.replace(re, (_, i, a, h) => (+i === c ? `[${h || '…'}]` : a))), a: tgHtml(card.front.replace(re, (_, i, a) => (+i === c ? `<b><u>${a}</u></b>` : a))) + (card.back ? `\n\n${tgHtml(card.back)}` : '') };
  }
  const rev = card.cardType === 'reverse';
  const q = tgHtml(rev ? card.back : card.front), a = tgHtml(rev ? card.front : card.back);
  return { q, a: a + (card.example ? `\n\n<i>${tgHtml(card.example)}</i>` : '') + (card.explanation ? `\n💡 ${tgHtml(card.explanation)}` : '') };
}

async function linkOf(chatId) {
  const { rows } = await q('select l.*, u.name, u.email from telegram_links l join users u on u.id=l.user_id where l.chat_id=$1', [chatId]);
  if (!rows[0]) return null;
  const s = (await q('select data from user_settings where user_id=$1', [rows[0].user_id])).rows[0]?.data ?? {};
  return { ...rows[0], prefs: { ...DEFAULT_PREFS, ...rows[0].prefs }, lang: T[s.lang] ? s.lang : null };
}
const setState = (userId, patch) => q(`update telegram_links set state = state || $2::jsonb where user_id=$1`, [userId, JSON.stringify(patch)]);
const setPrefs = (userId, patch) => q(`update telegram_links set prefs = prefs || $2::jsonb where user_id=$1`, [userId, JSON.stringify(patch)]);
const langOf = (link, from) => link?.lang ?? (T[from?.language_code] ? from.language_code : 'uz');
const appButton = (t) => [{ text: t.openApp, web_app: { url: PUBLIC_URL } }];

// ---------------- study in chat ----------------
async function sendNext(link, t, chatId) {
  const st = link.state ?? {};
  const mini = st.mini;
  if (mini && mini.done >= mini.total) {
    await setState(link.user_id, { mini: null });
    return send(chatId, t.miniDone(mini.total, mini.correct), kb([[{ text: t.study(0), callback_data: 'st' }]]));
  }
  const n = await nextCard(link.user_id, Date.now(), [], st.scope ?? null);
  const again = st.scope?.length ? `sd:${st.scope[0]}` : 'st';
  if (!n.card) {
    const sess = st.session;
    if (sess?.n) await setState(link.user_id, { session: null, mini: null });
    if (n.waitMs != null) return send(chatId, (sess?.n ? t.done(sess.n, sess.c) + '\n\n' : '') + t.wait(Math.max(1, Math.ceil(n.waitMs / 60000))), kb([[{ text: t.study(0), callback_data: again }, { text: t.mMenu, callback_data: 'menu' }]]));
    return send(chatId, (sess?.n ? t.done(sess.n, sess.c) + '\n\n' : '') + t.nothing, kb([[{ text: t.mAdd, callback_data: 'wz' }, { text: t.mMenu, callback_data: 'menu' }], appButton(t)]));
  }
  const { card, deck, left } = n;
  const head = `📘 <b>${esc(deck.title)}</b> · ${mini ? `${mini.done + 1}/${mini.total}` : t.left(left)}`;
  const text = `${head}\n\n${faces(card).q}`;
  const markup = kb([[{ text: t.show, callback_data: `sh:${card.id}:${Date.now().toString(36)}` }], [{ text: t.stop, callback_data: 'stop' }]]);
  if (card.image && /^(https?:|\/api\/files\/)/.test(card.image)) {
    const url = card.image.startsWith('/') ? PUBLIC_URL + card.image : card.image;
    try { return await tg('sendPhoto', { chat_id: chatId, photo: url, caption: text.slice(0, 1000), parse_mode: 'HTML', ...markup }); } catch { /* fall back to text */ }
  }
  return send(chatId, text, markup);
}

async function reveal(link, t, cb, cardId, shown) {
  const { rows: [row] } = await q(`select f.*, d.title deck_title, d.algorithm, d.preset, d.tts_front from flashcards f join decks d on d.id=f.deck_id where f.id=$1 and f.user_id=$2`, [cardId, link.user_id]);
  if (!row) return;
  const card = toCard(row), deck = { title: row.deck_title, algorithm: row.algorithm, preset: row.preset };
  const lb = labels(card, deck, presetFor(deck, await settingsOf(link.user_id)));
  const f = faces(card);
  const text = `📘 <b>${esc(deck.title)}</b>\n\n${f.q}\n━━━━━━━━━━\n${f.a}`;
  const buttons = kb([
    t.ratings.map((r, i) => ({ text: `${['🔴', '🟠', '🟢', '🔵'][i]} ${r} · ${lb[i]}`, callback_data: `r:${cardId}:${i + 1}:${shown}` })).slice(0, 2),
    t.ratings.map((r, i) => ({ text: `${['🔴', '🟠', '🟢', '🔵'][i]} ${r} · ${lb[i]}`, callback_data: `r:${cardId}:${i + 1}:${shown}` })).slice(2),
    [{ text: t.listen, callback_data: `tts:${cardId}` }, { text: t.stop, callback_data: 'stop' }],
  ]);
  const m = cb.message;
  if (m.photo) await tg('editMessageCaption', { chat_id: m.chat.id, message_id: m.message_id, caption: text.slice(0, 1000), parse_mode: 'HTML', ...buttons });
  else await tg('editMessageText', { chat_id: m.chat.id, message_id: m.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...buttons });
}

async function rate(link, t, cb, cardId, rating, shown) {
  const shownAt = parseInt(shown, 36) || Date.now();
  // a double tap must not answer twice: ignore if the card was already answered after it was shown
  const { rows: [cur] } = await q('select last_review from flashcards where id=$1 and user_id=$2', [cardId, link.user_id]);
  if (!cur || (cur.last_review && new Date(cur.last_review).getTime() >= shownAt)) return;
  const r = await review(link.user_id, cardId, rating, Date.now() - shownAt);
  if (!r) return;
  const st = link.state ?? {};
  const session = { n: (st.session?.n ?? 0) + 1, c: (st.session?.c ?? 0) + (rating >= 3 ? 1 : 0) };
  const mini = st.mini ? { ...st.mini, done: st.mini.done + 1, correct: st.mini.correct + (rating >= 3 ? 1 : 0) } : null;
  await setState(link.user_id, { session, mini });
  const m = cb.message, mark = `\n\n${['🔴', '🟠', '🟢', '🔵'][rating - 1]} <b>${t.ratings[rating - 1]}</b> · ${r.label}`;
  const body = (m.caption ?? m.text ?? '').slice(0, 3500);
  try {
    if (m.photo) await tg('editMessageCaption', { chat_id: m.chat.id, message_id: m.message_id, caption: (esc(body) + mark).slice(0, 1000), parse_mode: 'HTML' });
    else await tg('editMessageText', { chat_id: m.chat.id, message_id: m.message_id, text: esc(body) + mark, parse_mode: 'HTML' });
  } catch { /* message too old to edit — fine */ }
  await sendNext({ ...link, state: { ...st, session, mini } }, t, m.chat.id);
}

async function tts(link, chatId, cardId) {
  const { rows: [row] } = await q(`select f.front, f.back, f.card_type, d.tts_front from flashcards f join decks d on d.id=f.deck_id where f.id=$1 and f.user_id=$2`, [cardId, link.user_id]);
  if (!row) return;
  const text = plainText(row.card_type === 'reverse' ? row.back : row.front).replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').slice(0, 180);
  const lang = (row.tts_front || '').slice(0, 2) || (/[а-яё]/i.test(text) ? 'ru' : /[؀-ۿ]/.test(text) ? 'ar' : /[一-鿿]/.test(text) ? 'zh' : 'en');
  const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return;
  const f = new FormData(); f.append('chat_id', String(chatId)); f.append('title', text.slice(0, 60)); f.append('audio', new Blob([Buffer.from(await r.arrayBuffer())], { type: 'audio/mpeg' }), 'word.mp3');
  await tg('sendAudio', f);
}

// ---------------- adding cards ----------------
const withRev = (link, cards) => cards.map((c) => ({ ...c, reverse: c.reverse ?? !!link.prefs.reverse }));
const PAIR = /^\s*(.+?)\s+[-–—=]\s+(.+?)\s*$/;
async function addFromText(link, t, chatId, text) {
  const { cards, other } = parsePairs(text);
  if (cards.length && cards.length >= (cards.length + other) * 0.6) {
    const deck = await targetDeck(link.user_id, link.prefs.deckId);
    const ids = await addCards(link.user_id, deck.id, withRev(link, cards));
    await setState(link.user_id, { lastAdded: ids });
    const list = cards.slice(0, 15).map((c) => `• <b>${esc(c.front)}</b> — ${esc(c.back)}${c.example ? `\n   <i>${esc(c.example)}</i>` : ''}${c.explanation ? `\n   💡 ${esc(c.explanation)}` : ''}`).join('\n');
    const rows = [[{ text: t.undo, callback_data: 'undo' }, { text: t.study(0), callback_data: 'st' }]];
    if (cards.some((c) => !c.example || !c.explanation) && aiConfigured()) rows.unshift([{ text: t.enrich, callback_data: 'enrich' }]);
    return send(chatId, `${t.added(ids.length, esc(deck.title))}\n\n${list}`.slice(0, 4000), kb(rows));
  }
  return aiCards(link, t, chatId, { text });
}

async function aiCards(link, t, chatId, { text, media }) {
  if (!aiConfigured()) return send(chatId, t.aiOff);
  const wait = await send(chatId, t.aiThinking);
  try {
    const lang = { uz: 'Uzbek', ru: 'Russian', en: 'English' }[link.lang ?? 'uz'];
    const short = text && text.trim().length < 40 && !text.includes('\n');
    const count = short ? 1 : media ? 15 : Math.min(20, Math.max(3, Math.round((text?.length ?? 0) / 120)));
    const instructions = short
      ? `The learner sent a single word or phrase. Make exactly 1 card: front = the word/phrase exactly as written; back = its translation into ${lang} (or the meaning in ${lang}); example = one short natural sentence using it.`
      : media ? `Read the attached ${media.mime.startsWith('image/') ? 'image (a book page, notes or a vocabulary list)' : 'audio'} and make flashcards of the useful words/phrases or facts in it. Front in the source language, back in ${lang}.` : `Back side in ${lang}.`;
    const fill = ` Every card must also have "example" (a short natural sentence using the front, in the front's language) and "explanation" (a brief note in ${lang}: meaning nuance, usage or grammar, max 25 words).`;
    const prompt = buildPrompt({ text: media ? undefined : text, topic: media ? 'the attached material' : undefined, count, language: lang, format: 'qa', detail: 'brief', instructions: instructions + fill });
    const cards = parseCards(await callAI(prompt, undefined, media)).slice(0, count);
    if (!cards.length) throw new Error('no cards');
    await setState(link.user_id, { pending: cards });
    const list = cards.slice(0, 20).map((c, i) => `${i + 1}. <b>${esc(c.front)}</b> — ${esc(c.back)}${c.example ? `\n   <i>${esc(c.example)}</i>` : ''}${c.explanation ? `\n   💡 ${esc(c.explanation)}` : ''}`).join('\n');
    await tg('editMessageText', { chat_id: chatId, message_id: wait.message_id, text: `${t.aiPreview(cards.length)}\n\n${list}`.slice(0, 4000), parse_mode: 'HTML', ...kb([[{ text: t.addOk, callback_data: 'add:ok' }, { text: t.addNo, callback_data: 'add:no' }]]) });
  } catch (e) {
    const msg = e.code === 'aiBusy' ? t.aiBusy : t.aiFail(esc(e.message));
    await tg('editMessageText', { chat_id: chatId, message_id: wait.message_id, text: msg, parse_mode: 'HTML' }).catch(() => send(chatId, msg));
  }
}

// ---------------- reports, goal, ranking, settings ----------------
async function sendReport(link, t, chatId, fmt, period = 'week') {
  const r = await buildReport(link.user_id, fmt, period);
  await sendFile(chatId, r.buffer, r.name, r.mime);
}

async function goalText(link, t) {
  const g = link.prefs.goal;
  if (!g) return t.goalHelp;
  const n = new Date(), start = new Date(n.getFullYear(), n.getMonth(), 1), end = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  const { rows: [r] } = await q(`select count(distinct card_id)::int n from review_logs where user_id=$1 and prev_status='new' and ts >= $2`, [link.user_id, start]);
  const daysLeft = Math.max(1, Math.ceil((end - n) / DAY));
  return t.goal(r.n, g, Math.ceil(Math.max(0, g - r.n) / daysLeft), daysLeft);
}

async function ranking(link, t, chatId) {
  if (!link.prefs.leaderboard) return send(chatId, t.rankOff, kb([[{ text: t.join, callback_data: 'lb:on' }]]));
  const { rows } = await q(`select l.user_id, u.name, count(r.*)::int n from telegram_links l join users u on u.id=l.user_id
    left join review_logs r on r.user_id=l.user_id and r.ts >= now() - interval '7 days'
    where (l.prefs->>'leaderboard')::boolean is true group by l.user_id, u.name order by n desc limit 50`);
  const medal = ['🥇', '🥈', '🥉'];
  const lines = rows.slice(0, 10).map((r, i) => `${medal[i] ?? `${i + 1}.`} ${esc((r.name || '—').split(' ')[0])} — ${r.n}`).join('\n');
  const me = rows.findIndex((r) => r.user_id === link.user_id) + 1;
  return send(chatId, t.rank(lines, me || null), kb([[{ text: t.leave, callback_data: 'lb:off' }]]));
}

function settingsKb(link, t, deckTitle, app = {}) {
  const p = link.prefs, on = (b) => (b ? '✅' : '⬜');
  const times = REMINDER_TIMES.map((h) => ({ text: `${p.reminders.includes(h) ? '🔔' : '·'} ${h}`, callback_data: `rem:${h}` }));
  return kb([times.slice(0, 3), times.slice(3),
    [{ text: `${on(p.dailyReport)} ${t.dailyReport}`, callback_data: 'set:dailyReport' }, { text: `🕘 ${p.dailyTime ?? '21:00'}`, callback_data: 'dt' }],
    [{ text: `${on(p.reverse)} ${t.revLabel}`, callback_data: 'set:reverse' }],
    [{ text: `${on(p.streakSaver)} ${t.streakSaver}`, callback_data: 'set:streakSaver' }],
    [{ text: `${on(p.weeklyReport)} ${t.weeklyReport}`, callback_data: 'set:weeklyReport' }],
    [{ text: `${on(p.leaderboard)} ${t.ranking}`, callback_data: 'set:leaderboard' }],
    [{ text: '−5', callback_data: 'np:-5' }, { text: t.newPerDay(app.newPerDay ?? 20), callback_data: 'noop' }, { text: '+5', callback_data: 'np:5' }],
    [{ text: `${on(app.shuffle)} ${t.shuffle}`, callback_data: 'shf' }],
    [{ text: t.deckFor(deckTitle), callback_data: 'decks' }],
    [{ text: t.mMenu, callback_data: 'menu' }]]);
}
async function showSettings(link, t, chatId, editMsg) {
  const deck = await targetDeck(link.user_id, link.prefs.deckId);
  const body = { text: t.settings, parse_mode: 'HTML', ...settingsKb(link, t, deck.title, await settingsOf(link.user_id)) };
  if (editMsg) return tg('editMessageText', { chat_id: chatId, message_id: editMsg.message_id, ...body }).catch(() => {});
  return tg('sendMessage', { chat_id: chatId, ...body });
}

// ---------------- menu & navigation ----------------
async function menuKb(link, t) {
  const n = await dueCount(link.user_id);
  return kb([
    [{ text: t.study(n), callback_data: 'st' }, { text: t.mini, callback_data: 'mini' }],
    [{ text: t.mDecks, callback_data: 'dl:0' }, { text: t.mAdd, callback_data: 'wz' }],
    [{ text: t.mSearch, callback_data: 'sr' }, { text: t.mStats, callback_data: 'stats' }],
    [{ text: t.mToday, callback_data: 'today' }, { text: t.mReports, callback_data: 'reps' }],
    [{ text: t.mSettings, callback_data: 'settings' }, appButton(t)[0]],
  ]);
}
/** Edits the message the button belongs to (keeps the chat tidy); sends a new one when that isn't possible. */
async function editOrSend(chatId, msg, body) {
  const b = { parse_mode: 'HTML', disable_web_page_preview: true, ...body, text: String(body.text).slice(0, 4000) };
  if (msg && !msg.photo && !msg.document && !msg.audio) {
    try { return await tg('editMessageText', { chat_id: chatId, message_id: msg.message_id, ...b }); } catch (e) { if (/not modified/i.test(e.message)) return null; }
  }
  return tg('sendMessage', { chat_id: chatId, ...b });
}
const showMenu = async (link, t, chatId, msg, head) => editOrSend(chatId, msg, { text: head ?? t.menu, ...(await menuKb(link, t)) });
const setInput = (userId, input) => setState(userId, { input });
const cancelRow = (t) => [{ text: t.cancel, callback_data: 'cancel' }];
const short = (h, n) => { const s = plainText(String(h ?? '').replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1')).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ---------------- decks ----------------
async function showDecks(link, t, chatId, msg, page = 0) {
  const all = await deckList(link.user_id);
  const per = 12, pages = Math.max(1, Math.ceil(all.length / per));
  page = Math.min(Math.max(0, page), pages - 1);
  const rows = all.slice(page * per, page * per + per).map((d) => [{
    text: cut(`${d.depth ? '   '.repeat(d.depth - 1) + '↳ ' : ''}${d.cover || '📘'} ${d.title}${d.archived ? ' 🗄' : ''} · ${d.total}${d.due ? ` ⏰${d.due}` : ''}`, 60),
    callback_data: `dk:${d.id}`,
  }]);
  if (pages > 1) rows.push([{ text: t.prev, callback_data: `dl:${page - 1}` }, { text: `${page + 1}/${pages}`, callback_data: 'noop' }, { text: t.next, callback_data: `dl:${page + 1}` }]);
  rows.push([{ text: t.newDeck, callback_data: 'dn' }, { text: t.mMenu, callback_data: 'menu' }]);
  return editOrSend(chatId, msg, { text: all.length ? t.decks(all.length) : t.noDecks, ...kb(rows) });
}

async function showDeck(link, t, chatId, msg, deckId) {
  const all = await deckList(link.user_id);
  const d = all.find((x) => x.id === deckId);
  if (!d) return showDecks(link, t, chatId, msg);
  const tree = await deckTree(link.user_id, deckId);
  const mine = all.filter((x) => tree.includes(x.id));
  const s = { total: mine.reduce((a, x) => a + x.total, 0), fresh: mine.reduce((a, x) => a + x.fresh, 0), due: await dueCount(link.user_id, Date.now(), tree) };
  const kids = all.filter((x) => x.parent_id === deckId).map((x) => [{ text: cut(`↳ ${x.cover || '📘'} ${x.title} · ${x.total}`, 60), callback_data: `dk:${x.id}` }]);
  return editOrSend(chatId, msg, {
    text: t.deckInfo({ ...d, title: esc(d.title) }, s),
    ...kb([
      [{ text: t.studyDeck, callback_data: `sd:${deckId}` }],
      [{ text: t.addHere, callback_data: `wz:${deckId}` }, { text: t.cardsList, callback_data: `cl:${deckId}:0` }],
      ...kids,
      [{ text: t.rename, callback_data: `dr:${deckId}` }, { text: d.archived ? t.unarchive : t.archive, callback_data: `da:${deckId}` }],
      [{ text: t.subdeck, callback_data: `ds:${deckId}` }, { text: t.del, callback_data: `dx:${deckId}` }],
      [{ text: t.back, callback_data: d.parent_id ? `dk:${d.parent_id}` : 'dl:0' }, { text: t.mMenu, callback_data: 'menu' }],
    ]),
  });
}

async function showCards(link, t, chatId, msg, deckId, page = 0) {
  const { rows: [deck] } = await q('select id, title from decks where id=$1 and user_id=$2', [deckId, link.user_id]);
  if (!deck) return showDecks(link, t, chatId, msg);
  const per = 8;
  let r = await deckCards(link.user_id, deckId, page * per, per);
  const pages = Math.max(1, Math.ceil(r.total / per));
  if (page >= pages) { page = pages - 1; r = await deckCards(link.user_id, deckId, page * per, per); }
  const rows = r.cards.map((c) => [{ text: cut(`${c.frozen ? '❄️ ' : c.bookmarked ? '⭐ ' : ''}${short(c.front, 30)} — ${short(c.back, 24) || '…'}`, 60), callback_data: `cd:${c.id}` }]);
  if (pages > 1) rows.push([{ text: t.prev, callback_data: `cl:${deckId}:${Math.max(0, page - 1)}` }, { text: `${page + 1}/${pages}`, callback_data: 'noop' }, { text: t.next, callback_data: `cl:${deckId}:${Math.min(pages - 1, page + 1)}` }]);
  rows.push([{ text: t.addHere, callback_data: `wz:${deckId}` }], [{ text: t.back, callback_data: `dk:${deckId}` }, { text: t.mMenu, callback_data: 'menu' }]);
  return editOrSend(chatId, msg, { text: r.total ? t.cards(esc(deck.title), r.total, page + 1, pages) : t.noCards, ...kb(rows) });
}

// ---------------- one card ----------------
async function showCard(link, t, chatId, msg, cardId) {
  const { rows: [row] } = await q('select f.*, d.title deck_title from flashcards f join decks d on d.id=f.deck_id where f.id=$1 and f.user_id=$2', [cardId, link.user_id]);
  if (!row) return showMenu(link, t, chatId, msg);
  const c = toCard(row);
  const status = c.frozen ? t.stFrozen : c.status === 'new' ? t.stNew : c.status === 'review'
    ? t.stReview(new Date(c.due).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: process.env.TZ || 'Asia/Tashkent' })) : t.stLearn;
  const qText = tgHtml(c.front.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '[$1]'));
  const text = t.card({ q: qText || '—', a: tgHtml(c.back) || '—', ex: tgHtml(c.example), xp: tgHtml(c.explanation), deck: esc(row.deck_title), status });
  const rv = await hasReverse(link.user_id, c.id);
  const rows = [
    [{ text: t.eFront, callback_data: `ce:front:${c.id}` }, { text: t.eBack, callback_data: `ce:back:${c.id}` }],
    [{ text: t.eEx, callback_data: `ce:example:${c.id}` }, { text: t.eXp, callback_data: `ce:explanation:${c.id}` }],
    [{ text: c.bookmarked ? t.unbm : t.bm, callback_data: `cf:bookmarked:${c.id}` }, { text: c.frozen ? t.unfreeze : t.freeze, callback_data: `cf:frozen:${c.id}` }],
  ];
  if (!/\{\{c\d+::/.test(c.front) && c.cardType !== 'occlusion') rows.push([{ text: `${rv ? '✅' : '⬜'} ${t.revLabel}`, callback_data: `cv:${c.id}` }]);
  if ((!c.example || !c.explanation) && aiConfigured()) rows.push([{ text: t.enrich, callback_data: `ci:${c.id}` }]);
  rows.push([{ text: t.reset, callback_data: `cr:${c.id}` }, { text: t.delCard, callback_data: `cx:${c.id}` }]);
  rows.push([{ text: t.toDeck, callback_data: `cl:${c.deckId}:0` }, { text: t.mMenu, callback_data: 'menu' }]);
  return editOrSend(chatId, msg, { text, ...kb(rows) });
}

// ---------------- adding cards: step by step ----------------
const revOn = (link, card) => card?.reverse ?? !!link.prefs.reverse;
/** Keyboard of a wizard step: skip / AI / reverse toggle / cancel. */
function wzKb(link, t, step, card) {
  const rows = [];
  if (step !== 'front' && step !== 'back') rows.push([{ text: t.skip, callback_data: 'wzs' }, ...(aiConfigured() ? [{ text: t.aiFill, callback_data: 'wza' }] : [])]);
  rows.push([{ text: `${revOn(link, card) ? '✅' : '⬜'} ${t.revLabel}`, callback_data: 'wzr' }]);
  rows.push(cancelRow(t));
  return kb(rows);
}
async function wizardStart(link, t, chatId, msg, deckId) {
  const deck = await targetDeck(link.user_id, deckId || link.prefs.deckId);
  await setInput(link.user_id, { k: 'wz', step: 'front', deckId: deck.id, card: {} });
  return editOrSend(chatId, msg, { text: `${t.wFront(esc(deck.title))}\n\n💡 ${t.fmtHelp}`, ...wzKb(link, t, 'front', {}) });
}
const WZ = ['front', 'back', 'example', 'explanation'];
async function wizardInput(link, t, chatId, input, value) {
  const card = { ...input.card };
  if (input.step === 'front') {
    const one = parseLine(value); // the whole card typed in one line: "apple - olma - example - explanation +r"
    if (one) return wizardSave(link, t, chatId, input.deckId, { ...one, reverse: one.reverse ?? card.reverse });
    card.front = value;
  } else card[input.step] = value === '-' && input.step !== 'back' ? '' : value;
  const next = WZ[WZ.indexOf(input.step) + 1];
  if (!next) return wizardSave(link, t, chatId, input.deckId, card);
  await setInput(link.user_id, { ...input, step: next, card });
  const prompt = { back: t.wBack, example: t.wEx, explanation: t.wXp }[next];
  return send(chatId, prompt, wzKb(link, t, next, card));
}
async function wizardSave(link, t, chatId, deckId, card, msg) {
  await setInput(link.user_id, null);
  const deck = await targetDeck(link.user_id, deckId);
  const ids = await addCards(link.user_id, deck.id, withRev(link, [card]));
  await setState(link.user_id, { lastAdded: ids });
  const view = t.card({ q: esc(card.front), a: esc(card.back ?? '') || '—', ex: esc(card.example ?? ''), xp: esc(card.explanation ?? ''), deck: esc(deck.title), status: t.stNew });
  const rows = [[{ text: t.addMore, callback_data: `wz:${deck.id}` }, { text: t.undo, callback_data: 'undo' }]];
  if (ids[0] && !/\{\{c\d+::/.test(card.front)) rows.push([{ text: `${(await hasReverse(link.user_id, ids[0])) ? '✅' : '⬜'} ${t.revLabel}`, callback_data: `cv:${ids[0]}` }]);
  if ((!card.example || !card.explanation) && aiConfigured()) rows.push([{ text: t.enrich, callback_data: 'enrich' }]);
  rows.push([{ text: t.study(0), callback_data: 'st' }, { text: t.mMenu, callback_data: 'menu' }]);
  return editOrSend(chatId, msg, { text: `${t.wSaved(esc(deck.title))}\n\n${view}`, ...kb(rows) });
}

// ---------------- AI: example + explanation for existing cards ----------------
async function enrich(link, t, chatId, ids) {
  if (!aiConfigured()) return send(chatId, t.aiOff);
  const { rows } = await q(`select id, front, back, example, explanation from flashcards where user_id=$1 and id = any($2::uuid[]) and card_type <> 'reverse'`, [link.user_id, ids]);
  const todo = rows.filter((r) => !r.example || !r.explanation).slice(0, 25);
  if (!todo.length) return null;
  const wait = await send(chatId, t.enriching);
  try {
    const lang = { uz: 'Uzbek', ru: 'Russian', en: 'English' }[link.lang ?? 'uz'];
    const prompt = `For each flashcard below write:\n- "example": one short, natural sentence that uses the question word/phrase, in the question's language;\n- "explanation": a brief note in ${lang} (meaning nuance, usage or grammar, max 25 words).\nReturn only JSON: {"cards":[{"i":1,"example":"…","explanation":"…"}]}\n\n`
      + todo.map((r, i) => `${i + 1}. ${short(r.front, 200)} — ${short(r.back, 200)}`).join('\n');
    const raw = await callAI(prompt);
    const json = JSON.parse(String(raw).slice(String(raw).indexOf('{'), String(raw).lastIndexOf('}') + 1));
    let n = 0;
    for (const x of json.cards ?? []) {
      const r = todo[(Number(x.i) || 0) - 1];
      if (!r) continue;
      const patch = {};
      if (!r.example && typeof x.example === 'string' && x.example.trim()) patch.example = x.example;
      if (!r.explanation && typeof x.explanation === 'string' && x.explanation.trim()) patch.explanation = x.explanation;
      if (Object.keys(patch).length && (await editNote(link.user_id, r.id, patch))) n++;
    }
    await tg('editMessageText', { chat_id: chatId, message_id: wait.message_id, text: t.enriched(n), parse_mode: 'HTML', ...kb([[{ text: t.study(0), callback_data: 'st' }, { text: t.mMenu, callback_data: 'menu' }]]) });
    return n;
  } catch (e) {
    const m = e.code === 'aiBusy' ? t.aiBusy : t.aiFail(esc(e.message));
    await tg('editMessageText', { chat_id: chatId, message_id: wait.message_id, text: m, parse_mode: 'HTML' }).catch(() => send(chatId, m));
    return null;
  }
}

// ---------------- search, stats, daily report ----------------
async function doSearch(link, t, chatId, msg, text) {
  const s = text.trim().slice(0, 100);
  const found = await searchCards(link.user_id, s, 15);
  const rows = found.map((c) => [{ text: cut(`${short(c.front, 30)} — ${short(c.back, 22) || '…'} · ${c.deckTitle}`, 60), callback_data: `cd:${c.id}` }]);
  rows.push([{ text: t.mSearch, callback_data: 'sr' }, { text: t.mMenu, callback_data: 'menu' }]);
  return editOrSend(chatId, msg, { text: found.length ? t.found(found.length, esc(s)) : t.notFound(esc(s)), ...kb(rows) });
}

async function statsText(link, t) {
  const d = await reportData(link.user_id, 7);
  const max = Math.max(1, ...d.daily.map((x) => x.n));
  const week = d.daily.map((x) => {
    const day = new Date(x.day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: process.env.TZ || 'Asia/Tashkent' });
    return `<code>${day} ${'█'.repeat(Math.round((x.n / max) * 10)).padEnd(10, '·')} ${x.n}</code>`;
  }).join('\n');
  return t.stats({ ...d.totals, streak: d.streak.current, best: d.streak.best, week, reviews: d.reviews, acc: d.reviews ? Math.round((d.correct / d.reviews) * 100) : 0, learnedNew: d.learnedNew });
}

async function dailyText(link, t) {
  const d = await todayData(link.user_id);
  if (!d.reviews) return t.dailyNone({ streak: d.streak.current, due: await dueCount(link.user_id) });
  const hard = d.hard.map((h) => `• ${esc(short(h.front, 60))}${h.n > 1 ? ` ×${h.n}` : ''}`).join('\n');
  return t.daily({ ...d, acc: Math.round((d.correct / d.reviews) * 100), streak: d.streak.current, hard }) + (link.prefs.goal ? '\n\n' + (await goalText(link, t)) : '');
}

// ---------------- typed input (wizard, edits, names, search) ----------------
async function onInput(link, t, chatId, input, text) {
  const uid = link.user_id;
  if (input.k === 'wz') return wizardInput(link, t, chatId, input, text);
  await setInput(uid, null);
  if (input.k === 'edit') {
    const v = text === '-' && (input.field === 'example' || input.field === 'explanation') ? '' : text;
    if (!v && (input.field === 'front' || input.field === 'back')) return send(chatId, t.askField[input.field], kb([cancelRow(t)])).then(() => setInput(uid, input));
    await editNote(uid, input.id, { [input.field]: v });
    await send(chatId, t.edited);
    return showCard(link, t, chatId, null, input.id);
  }
  if (input.k === 'rename') {
    await q('update decks set title=$3, updated_at=now() where id=$1 and user_id=$2', [input.id, uid, text.trim().slice(0, 100) || 'Deck']);
    await send(chatId, t.renamed);
    return showDeck(link, t, chatId, null, input.id);
  }
  if (input.k === 'newdeck') {
    const d = await createDeck(uid, text, { parentId: input.parent });
    await send(chatId, t.deckCreated(esc(d.title)));
    return showDeck(link, t, chatId, null, d.id);
  }
  if (input.k === 'search') return doSearch(link, t, chatId, null, text);
}

/** "front - back - example - explanation" ("|" also works) (example and explanation optional). */
function parseLine(line) {
  const rvFlag = /\s+\+(r|t|rev|reverse|teskari)\s*$/i;
  const rv = rvFlag.test(String(line));
  const str = String(line).replace(rvFlag, '');
  const parts = str.includes('|') ? str.split('|') : str.split(/\s+[-–—=]\s+/);
  const m = parts.length > 1 && str.includes('|') ? parts[0].match(PAIR) : null;
  const [front, back, example, ...xp] = m ? [m[1], m[2], parts[1], ...parts.slice(2)] : parts;
  if (!front || !back || !front.trim() || !back.trim()) return null;
  return { front: front.trim(), back: back.trim(), example: (example ?? '').trim(), explanation: xp.join(' - ').trim(), ...(rv ? { reverse: true } : {}) };
}
const LABEL_EX = /^\s*(misol|example|ex|пример|e\.g\.)\s*[:：-]\s*(.+)$/i;
const LABEL_XP = /^\s*(izoh|explanation|note|izohi|пояснение|объяснение|примечание)\s*[:：-]\s*(.+)$/i;
/** Lines of pairs; "misol: …" / "izoh: …" lines attach to the card above them. */
function parsePairs(text) {
  const cards = []; let other = 0;
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const ex = line.match(LABEL_EX), xp = line.match(LABEL_XP);
    if ((ex || xp) && cards.length) { const c = cards.at(-1); if (ex) c.example = ex[2].trim(); else c.explanation = xp[2].trim(); continue; }
    const one = parseLine(line);
    if (one) cards.push(one); else other++;
  }
  return { cards, other };
}

// ---------------- updates ----------------
async function onMessage(m) {
  const chatId = m.chat.id;
  if (m.chat.type !== 'private') return;
  let link = await linkOf(chatId);
  const t = T[langOf(link, m.from)];
  const text = (m.text ?? '').trim();
  const [cmd, ...args] = text.startsWith('/') ? text.split(/\s+/) : [''];
  const c = cmd.replace(/@.*$/, '').toLowerCase();

  if (c === '/start' && args[0]) {
    const { rows: [code] } = await q('delete from telegram_codes where code=$1 and expires_at > now() returning user_id', [args[0]]);
    if (!code) return send(chatId, t.badCode, kb([appButton(t)]));
    await q('delete from telegram_links where chat_id=$1 and user_id <> $2', [chatId, code.user_id]);
    await q(`insert into telegram_links (user_id, chat_id, tg_name, prefs) values ($1,$2,$3,$4)
      on conflict (user_id) do update set chat_id=excluded.chat_id, tg_name=excluded.tg_name`, [code.user_id, chatId, [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' '), JSON.stringify(DEFAULT_PREFS)]);
    link = await linkOf(chatId);
    const tt = T[langOf(link, m.from)];
    await send(chatId, tt.linked(esc(link.name || link.email)));
    return send(chatId, tt.hello(esc(link.name?.split(' ')[0])), await menuKb(link, tt));
  }
  if (!link) return send(chatId, t.notLinked, kb([appButton(t)]));

  const input = link.state?.input;
  if (c && input) await setInput(link.user_id, null); // any command cancels a pending question
  if (['/start', '/help'].includes(c)) return send(chatId, t.hello(esc(link.name?.split(' ')[0])), await menuKb(link, t));
  if (['/menu', '/menyu', '/меню'].includes(c)) return showMenu(link, t, chatId);
  if (['/oqish', '/study', '/learn', '/учить'].includes(c)) { await setState(link.user_id, { session: null, mini: null, scope: null }); return sendNext({ ...link, state: {} }, t, chatId); }
  if (['/test', '/mini'].includes(c)) { const mini = { total: 5, done: 0, correct: 0 }; await setState(link.user_id, { mini, session: null, scope: null }); return sendNext({ ...link, state: { mini } }, t, chatId); }
  if (['/decklar', '/decks', '/deck', '/kolody', '/колоды'].includes(c)) return showDecks(link, t, chatId);
  if (['/qoshish', '/add', '/karta', '/new', '/добавить'].includes(c)) {
    if (args.length) return addFromText(link, t, chatId, args.join(' '));
    return wizardStart(link, t, chatId);
  }
  if (['/teskari', '/reverse', '/obratnaya', '/обратная'].includes(c)) {
    const v = !link.prefs.reverse; await setPrefs(link.user_id, { reverse: v });
    return send(chatId, `${v ? '✅' : '⬜'} ${t.revLabel}: ${v ? 'ON' : 'OFF'}`, await menuKb(link, t));
  }
  if (['/qidir', '/search', '/find', '/poisk', '/поиск'].includes(c)) {
    if (args.length) return doSearch(link, t, chatId, null, args.join(' '));
    await setInput(link.user_id, { k: 'search' }); return send(chatId, t.askSearch, kb([cancelRow(t)]));
  }
  if (['/statistika', '/stats', '/stat', '/статистика'].includes(c)) return send(chatId, await statsText(link, t), kb([[{ text: t.mToday, callback_data: 'today' }, { text: t.mMenu, callback_data: 'menu' }]]));
  if (['/bugun', '/today', '/kunlik', '/segodnya', '/сегодня'].includes(c)) return send(chatId, await dailyText(link, t), kb([[{ text: t.study(0), callback_data: 'st' }, { text: t.pdf, callback_data: 'rep:pdf:week' }], [{ text: t.mMenu, callback_data: 'menu' }]]));
  if (['/yangideck', '/newdeck'].includes(c)) {
    if (args.length) { const d = await createDeck(link.user_id, args.join(' ')); await send(chatId, t.deckCreated(esc(d.title))); return showDeck(link, t, chatId, null, d.id); }
    await setInput(link.user_id, { k: 'newdeck' }); return send(chatId, t.askDeckName, kb([cancelRow(t)]));
  }
  if (['/hisobot', '/report', '/otchet'].includes(c)) return send(chatId, t.reportPick, kb([[{ text: t.pdf, callback_data: 'rep:pdf:week' }], [{ text: t.xlsx, callback_data: 'rep:xlsx:week' }], [{ text: t.docx, callback_data: 'rep:docx:week' }], [{ text: `📄 PDF · ${t.month}`, callback_data: 'rep:pdf:month' }]]));
  if (['/maqsad', '/goal'].includes(c)) {
    const g = parseInt(args[0], 10);
    if (g > 0 && g <= 20000) { await setPrefs(link.user_id, { goal: g }); link.prefs.goal = g; await send(chatId, t.goalSet(g)); }
    return send(chatId, await goalText(link, t));
  }
  if (['/reyting', '/top', '/rating'].includes(c)) return ranking(link, t, chatId);
  if (['/sozlamalar', '/settings'].includes(c)) return showSettings(link, t, chatId);
  if (c === '/unlink') { await q('delete from telegram_links where user_id=$1', [link.user_id]); return send(chatId, t.unlinked); }
  if (c) return send(chatId, t.help);

  // content → cards
  const photo = m.photo?.at(-1) ?? (m.document?.mime_type?.startsWith('image/') ? m.document : null);
  const audio = m.voice ?? m.audio ?? (m.document?.mime_type?.startsWith('audio/') ? m.document : null);
  if (photo || audio) {
    const file = photo ?? audio;
    const mime = photo ? (m.document?.mime_type ?? 'image/jpeg') : (audio.mime_type ?? 'audio/ogg');
    const buf = await download(file.file_id);
    return aiCards(link, t, chatId, { media: { mime, data: buf.toString('base64') }, text: m.caption });
  }
  if (text && input) return onInput(link, t, chatId, input, text);
  if (text) return addFromText(link, t, chatId, text);
}

async function onCallback(cb) {
  const chatId = cb.message?.chat?.id;
  await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
  if (!chatId) return;
  const link = await linkOf(chatId);
  const t = T[langOf(link, cb.from)];
  if (!link) return send(chatId, t.notLinked, kb([appButton(t)]));
  const [k, a, b, c] = cb.data.split(':');
  const uid = link.user_id, msg = cb.message;
  // ids in buttons are checked against the user's own rows in every query; reject anything malformed early
  if (['dk', 'sd', 'cl', 'cd', 'ci', 'cr', 'cx', 'cy', 'dr', 'da', 'ds', 'dx', 'dy'].includes(k) && !isUuid(a)) return;
  if (['ce', 'cf'].includes(k) && !isUuid(b)) return;
  if (k === 'noop') return;
  if (k === 'st') { await setState(uid, { session: null, mini: null, scope: null, input: null }); return sendNext({ ...link, state: {} }, t, chatId); }
  if (k === 'mini') { const mini = { total: 5, done: 0, correct: 0 }; await setState(uid, { mini, session: null, scope: null, input: null }); return sendNext({ ...link, state: { mini } }, t, chatId); }
  if (k === 'menu') { await setInput(uid, null); return showMenu(link, t, chatId, msg); }
  if (k === 'cancel') { await setInput(uid, null); return showMenu(link, t, chatId, msg, t.cancelled); }
  // decks
  if (k === 'dl') return showDecks(link, t, chatId, msg, Number(a) || 0);
  if (k === 'dk') return showDeck(link, t, chatId, msg, a);
  if (k === 'sd') {
    const scope = await deckTree(uid, a);
    if (!scope.length) return showDecks(link, t, chatId, msg);
    await setState(uid, { session: null, mini: null, scope, input: null });
    return sendNext({ ...link, state: { scope } }, t, chatId);
  }
  if (k === 'cl') return showCards(link, t, chatId, msg, a, Number(b) || 0);
  if (k === 'dr') { await setInput(uid, { k: 'rename', id: a }); return send(chatId, t.askRename, kb([cancelRow(t)])); }
  if (k === 'ds') { await setInput(uid, { k: 'newdeck', parent: a }); return send(chatId, t.askDeckName, kb([cancelRow(t)])); }
  if (k === 'dn') { await setInput(uid, { k: 'newdeck' }); return send(chatId, t.askDeckName, kb([cancelRow(t)])); }
  if (k === 'da') { await q('update decks set archived = not archived, updated_at=now() where id=$1 and user_id=$2', [a, uid]); return showDeck(link, t, chatId, msg, a); }
  if (k === 'dx') {
    const { rows: [d] } = await q('select title from decks where id=$1 and user_id=$2', [a, uid]);
    if (!d) return showDecks(link, t, chatId, msg);
    const n = (await deckTree(uid, a)).length;
    return editOrSend(chatId, msg, { text: t.sureDeck(esc(d.title), n), ...kb([[{ text: t.yesDel, callback_data: `dy:${a}` }, { text: t.no, callback_data: `dk:${a}` }]]) });
  }
  if (k === 'dy') {
    await deleteDeck(uid, a);
    if (link.prefs.deckId === a) await setPrefs(uid, { deckId: null });
    return showDecks(link, t, chatId, msg).then(() => send(chatId, t.deckDeleted));
  }
  // cards
  if (k === 'cd') return showCard(link, t, chatId, msg, a);
  if (k === 'cv') {
    if (!isUuid(a)) return;
    const now = await setReverse(uid, a, !(await hasReverse(uid, a)));
    if (now === null) return send(chatId, t.revNA);
    return showCard(link, t, chatId, msg, a);
  }
  if (k === 'ce') {
    if (!t.askField[a]) return;
    await setInput(uid, { k: 'edit', id: b, field: a });
    return send(chatId, t.askField[a], kb([cancelRow(t)]));
  }
  if (k === 'cf') {
    const { rows: [r] } = await q(`select ${a === 'frozen' ? 'frozen' : 'bookmarked'} v from flashcards where id=$1 and user_id=$2`, [b, uid]);
    if (r) await flagNote(uid, b, a === 'frozen' ? 'frozen' : 'bookmarked', !r.v);
    return showCard(link, t, chatId, msg, b);
  }
  if (k === 'cr') {
    const { rows } = await q('select id from flashcards where user_id=$1 and coalesce(note_id, id) = (select coalesce(note_id, id) from flashcards where id=$2 and user_id=$1)', [uid, a]);
    await resetCards(uid, rows.map((r) => r.id));
    await send(chatId, t.resetDone);
    return showCard(link, t, chatId, null, a);
  }
  if (k === 'cx') return editOrSend(chatId, msg, { text: t.sureCard, ...kb([[{ text: t.yesDel, callback_data: `cy:${a}` }, { text: t.no, callback_data: `cd:${a}` }]]) });
  if (k === 'cy') {
    const { rows: [r] } = await q('select deck_id from flashcards where id=$1 and user_id=$2', [a, uid]);
    await deleteNotes(uid, [a]);
    await editOrSend(chatId, msg, { text: t.cardDeleted });
    return r ? showCards(link, t, chatId, null, r.deck_id, 0) : null;
  }
  if (k === 'ci') return enrich(link, t, chatId, [a]);
  if (k === 'enrich') return enrich(link, t, chatId, link.state?.lastAdded ?? []);
  // add-card wizard
  if (k === 'wz') return wizardStart(link, t, chatId, msg, isUuid(a) ? a : undefined);
  if (k === 'wzr') {
    const input = link.state?.input;
    if (input?.k !== 'wz') return null;
    const card = { ...input.card, reverse: !revOn(link, input.card) };
    await setInput(uid, { ...input, card });
    return tg('editMessageReplyMarkup', { chat_id: chatId, message_id: msg.message_id, ...wzKb(link, t, input.step, card) }).catch(() => null);
  }
  if (k === 'wzs' || k === 'wza') {
    const input = link.state?.input;
    if (input?.k !== 'wz' || !input.card?.front) return null;
    if (k === 'wza') {
      await wizardSave(link, t, chatId, input.deckId, input.card);
      const fresh = await linkOf(chatId);
      return enrich(fresh, t, chatId, fresh.state?.lastAdded ?? []);
    }
    const next = WZ[WZ.indexOf(input.step) + 1];
    if (!next) return wizardSave(link, t, chatId, input.deckId, input.card);
    await setInput(uid, { ...input, step: next });
    return send(chatId, t.wXp, wzKb(link, t, next, input.card));
  }
  // search, stats, reports, settings
  if (k === 'sr') { await setInput(uid, { k: 'search' }); return send(chatId, t.askSearch, kb([cancelRow(t)])); }
  if (k === 'stats') return editOrSend(chatId, msg, { text: await statsText(link, t), ...kb([[{ text: t.mToday, callback_data: 'today' }, { text: t.mMenu, callback_data: 'menu' }]]) });
  if (k === 'today') return editOrSend(chatId, msg, { text: await dailyText(link, t), ...kb([[{ text: t.study(0), callback_data: 'st' }, { text: t.pdf, callback_data: 'rep:pdf:week' }], [{ text: t.mMenu, callback_data: 'menu' }]]) });
  if (k === 'reps') return editOrSend(chatId, msg, { text: t.reportPick, ...kb([[{ text: t.pdf, callback_data: 'rep:pdf:week' }], [{ text: t.xlsx, callback_data: 'rep:xlsx:week' }], [{ text: t.docx, callback_data: 'rep:docx:week' }], [{ text: `📄 PDF · ${t.month}`, callback_data: 'rep:pdf:month' }], [{ text: t.mMenu, callback_data: 'menu' }]]) });
  if (k === 'settings') return showSettings(link, t, chatId, msg);
  if (k === 'np') {
    const cur = (await settingsOf(uid)).newPerDay ?? 20;
    const v = Math.min(500, Math.max(0, cur + (Number(a) || 0)));
    if (v !== cur) await updateSettings(uid, { newPerDay: v });
    return showSettings(link, t, chatId, msg);
  }
  if (k === 'shf') { await updateSettings(uid, { shuffle: !(await settingsOf(uid)).shuffle }); return showSettings(link, t, chatId, msg); }
  if (k === 'dt') {
    const cur = link.prefs.dailyTime ?? '21:00', next = DAILY_TIMES[(DAILY_TIMES.indexOf(cur) + 1) % DAILY_TIMES.length];
    await setPrefs(uid, { dailyTime: next });
    return showSettings({ ...link, prefs: { ...link.prefs, dailyTime: next } }, t, chatId, msg);
  }
  if (k === 'sh') return reveal(link, t, cb, a, b);
  if (k === 'r') return rate(link, t, cb, a, Number(b), c);
  if (k === 'tts') return tts(link, chatId, a).catch(() => {});
  if (k === 'stop') {
    const s = link.state?.session; await setState(link.user_id, { session: null, mini: null });
    return send(chatId, s?.n ? t.done(s.n, s.c) : t.cancelled, kb([[{ text: t.study(0), callback_data: 'st' }]]));
  }
  if (k === 'undo') {
    const ids = link.state?.lastAdded ?? []; if (ids.length) await deleteCards(link.user_id, ids);
    await setState(link.user_id, { lastAdded: [] });
    return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t.undone });
  }
  if (k === 'add') {
    const cards = link.state?.pending ?? [];
    await setState(link.user_id, { pending: null });
    if (a !== 'ok' || !cards.length) return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t.cancelled });
    const deck = await targetDeck(link.user_id, link.prefs.deckId);
    const ids = await addCards(link.user_id, deck.id, withRev(link, cards));
    await setState(link.user_id, { lastAdded: ids });
    return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t.added(ids.length, esc(deck.title)), parse_mode: 'HTML', ...kb([[{ text: t.undo, callback_data: 'undo' }, { text: t.study(0), callback_data: 'st' }]]) });
  }
  if (k === 'rep') { const w = await send(chatId, t.preparing); await sendReport(link, t, chatId, a, b); return tg('deleteMessage', { chat_id: chatId, message_id: w.message_id }).catch(() => {}); }
  if (k === 'lb') { await setPrefs(link.user_id, { leaderboard: a === 'on' }); return ranking({ ...link, prefs: { ...link.prefs, leaderboard: a === 'on' } }, t, chatId); }
  if (k === 'rem') {
    const h = `${a}:${b}`, cur = link.prefs.reminders;
    const reminders = cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h].sort();
    await setPrefs(link.user_id, { reminders });
    return showSettings({ ...link, prefs: { ...link.prefs, reminders } }, t, chatId, cb.message);
  }
  if (k === 'set') {
    if (!['streakSaver', 'weeklyReport', 'leaderboard', 'dailyReport', 'reverse'].includes(a)) return;
    const v = !link.prefs[a]; await setPrefs(link.user_id, { [a]: v });
    return showSettings({ ...link, prefs: { ...link.prefs, [a]: v } }, t, chatId, cb.message);
  }
  if (k === 'decks') {
    const { rows } = await q('select id, title from decks where user_id=$1 and not archived order by title limit 40', [link.user_id]);
    return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t.chooseDeck, ...kb(rows.map((d) => [{ text: (d.id === link.prefs.deckId ? '✅ ' : '') + d.title, callback_data: `deck:${d.id}` }])) });
  }
  if (k === 'deck') { if (!isUuid(a)) return; await setPrefs(link.user_id, { deckId: a }); return showSettings({ ...link, prefs: { ...link.prefs, deckId: a } }, t, chatId, cb.message); }
}

async function onUpdate(u) {
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error('telegram update failed', e);
    const chatId = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
    if (chatId) send(chatId, '⚠️ ' + esc(e.code === 'aiBusy' ? T.uz.aiBusy : e.message ?? 'error')).catch(() => {});
  }
}

// ---------------- scheduled messages ----------------
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export async function tick(now = new Date()) {
  const { rows } = await q('select l.*, u.name from telegram_links l join users u on u.id=l.user_id');
  const time = hhmm(now), today = dayKey(now);
  for (const r of rows) {
    const link = { ...r, prefs: { ...DEFAULT_PREFS, ...r.prefs } };
    const s = (await q('select data from user_settings where user_id=$1', [r.user_id])).rows[0]?.data ?? {};
    const t = T[s.lang] ?? T.uz;
    const sent = r.state?.sent ?? {};
    const once = async (key, fn) => { if (sent[key] === today) return; sent[key] = today; await setState(r.user_id, { sent }); await fn(); };
    try {
      if (link.prefs.reminders.includes(time)) await once(`r${time}`, async () => {
        const n = await dueCount(r.user_id);
        if (n > 0) await send(r.chat_id, t.remind(n), kb([[{ text: t.study(n), callback_data: 'st' }], [{ text: t.mini, callback_data: 'mini' }]]));
      });
      if (link.prefs.streakSaver && time === (link.prefs.streakTime ?? '21:30')) await once('streak', async () => {
        const { rows: days } = await q(`select distinct date_trunc('day', ts at time zone $2) d from review_logs where user_id=$1 and ts > now() - interval '400 days'`, [r.user_id, process.env.TZ]);
        const keys = days.map((x) => startOfDay(new Date(x.d).getTime() + 12 * 3600_000));
        const studiedToday = keys.includes(startOfDay(now.getTime()));
        const st = streaks(keys);
        if (!studiedToday && st.current > 0) await send(r.chat_id, t.streakSave(st.current), kb([[{ text: t.mini, callback_data: 'mini' }]]));
      });
      if (link.prefs.dailyReport && time === (link.prefs.dailyTime ?? '21:00')) await once('daily', async () => {
        await send(r.chat_id, await dailyText(link, t), kb([[{ text: t.study(0), callback_data: 'st' }, { text: t.mStats, callback_data: 'stats' }], [{ text: t.mMenu, callback_data: 'menu' }]]));
      });
      if (link.prefs.weeklyReport && now.getDay() === 0 && time === '20:00') await once('weekly', async () => {
        const d = await reportData(r.user_id, 7);
        await send(r.chat_id, t.weekly(d.reviews, d.reviews ? Math.round((d.correct / d.reviews) * 100) : 0, d.streak.current) + (link.prefs.goal ? '\n' + (await goalText(link, t)) : ''));
        await sendReport(link, t, r.chat_id, 'pdf', 'week');
        await send(r.chat_id, t.reportPick, kb([[{ text: t.xlsx, callback_data: 'rep:xlsx:week' }], [{ text: t.docx, callback_data: 'rep:docx:week' }]]));
      });
    } catch (e) {
      console.error('telegram tick', r.chat_id, e.message);
      if (/blocked|deactivated|chat not found/i.test(e.message)) await q('delete from telegram_links where user_id=$1', [r.user_id]); // user blocked the bot
    }
  }
}

// ---------------- setup & routes ----------------
export async function setupTelegram() {
  if (!TOKEN) return;
  try {
    await tg('setWebhook', { url: `${PUBLIC_URL}/api/telegram/webhook/${HOOK}`, secret_token: HOOK, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
    const cmds = (l) => ({
      uz: [['menu', 'Asosiy menyu'], ['oqish', 'Kartalarni takrorlash'], ['qoshish', 'Karta qo‘shish (savol, javob, misol, izoh)'], ['decklar', 'Decklar va kartalar'], ['qidir', 'Karta qidirish'], ['bugun', 'Bugungi hisobot'], ['statistika', 'Statistika'], ['test', '5 ta so‘zli mini-test'], ['hisobot', 'PDF / Excel / Word hisobot'], ['maqsad', 'Oylik maqsad'], ['reyting', 'Haftalik reyting'], ['sozlamalar', 'Eslatmalar va sozlamalar']],
      en: [['menu', 'Main menu'], ['study', 'Review cards'], ['add', 'Add a card (question, answer, example, explanation)'], ['decks', 'Decks and cards'], ['search', 'Search cards'], ['today', 'Today’s report'], ['stats', 'Statistics'], ['test', '5-card mini test'], ['report', 'PDF / Excel / Word report'], ['goal', 'Monthly goal'], ['top', 'Weekly ranking'], ['settings', 'Reminders and settings']],
      ru: [['menu', 'Главное меню'], ['study', 'Повторять карточки'], ['add', 'Добавить карточку'], ['decks', 'Колоды и карточки'], ['search', 'Поиск карточек'], ['today', 'Отчёт за день'], ['stats', 'Статистика'], ['test', 'Мини-тест (5)'], ['report', 'Отчёт PDF / Excel / Word'], ['goal', 'Цель на месяц'], ['top', 'Рейтинг недели'], ['settings', 'Напоминания и настройки']],
    })[l].map(([command, description]) => ({ command, description }));
    await tg('setMyCommands', { commands: cmds('uz') });
    await tg('setMyCommands', { commands: cmds('en'), language_code: 'en' });
    await tg('setMyCommands', { commands: cmds('ru'), language_code: 'ru' });
    await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Yodla', web_app: { url: PUBLIC_URL } } });
    console.log(`Telegram bot @${BOT} ready (webhook set)`);
  } catch (e) { console.error('Telegram setup failed:', e.message); }
  // scheduled messages every minute (aligned to the minute)
  setTimeout(() => { tick().catch(() => {}); setInterval(() => tick().catch((e) => console.error('tick', e.message)), 60_000); }, 60_000 - (Date.now() % 60_000) + 2000);
  // Render's free plan sleeps after 15 idle minutes; a self-ping keeps reminders on time
  if (process.env.RENDER && process.env.KEEP_AWAKE !== '0') setInterval(() => fetch(`${PUBLIC_URL}/api/health`).catch(() => {}), 10 * 60_000);
}

export const telegramRouter = Router();
telegramRouter.post('/webhook/:hook', (req, res) => {
  if (!TOKEN || req.params.hook !== HOOK || req.get('X-Telegram-Bot-Api-Secret-Token') !== HOOK) return res.sendStatus(404);
  res.sendStatus(200);
  onUpdate(req.body ?? {});
});
telegramRouter.get('/status', requireAuth, wrap(async (req, res) => {
  const { rows } = await q('select tg_name from telegram_links where user_id=$1', [req.userId]);
  res.json({ enabled: telegramEnabled, bot: BOT, linked: !!rows[0], name: rows[0]?.tg_name ?? '' });
}));
telegramRouter.post('/link', requireAuth, wrap(async (req, res) => {
  if (!telegramEnabled) return res.status(503).json({ error: 'telegramOff' });
  const code = randomBytes(12).toString('base64url');
  await q('delete from telegram_codes where user_id=$1 or expires_at < now()', [req.userId]);
  await q(`insert into telegram_codes (code, user_id, expires_at) values ($1,$2, now() + interval '15 minutes')`, [code, req.userId]);
  res.json({ url: `https://t.me/${BOT}?start=${code}` });
}));
telegramRouter.delete('/link', requireAuth, wrap(async (req, res) => {
  await q('delete from telegram_links where user_id=$1', [req.userId]);
  res.json({ ok: true });
}));

/** Telegram Mini App sign-in: verifies initData (HMAC with the bot token) and signs in the linked account. */
export const miniAppAuth = wrap(async (req, res) => {
  const init = String(req.body?.initData ?? '');
  if (!TOKEN || !init) return res.status(400).json({ error: 'telegramOff' });
  const p = new URLSearchParams(init), hash = p.get('hash') ?? '';
  p.delete('hash');
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const calc = createHmac('sha256', secret).update(check).digest('hex');
  if (hash.length !== calc.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(calc))) return res.status(401).json({ error: 'telegramInvalid' });
  if (Date.now() / 1000 - Number(p.get('auth_date') ?? 0) > 24 * 3600) return res.status(401).json({ error: 'telegramInvalid' });
  const tgUser = JSON.parse(p.get('user') ?? '{}');
  const { rows: [u] } = await q('select u.* from telegram_links l join users u on u.id=l.user_id where l.chat_id=$1', [tgUser.id]);
  if (!u) return res.status(404).json({ error: 'telegramNotLinked' });
  res.json({ token: signToken(u), user: publicUser(u) });
});

export const _test = { onUpdate, tgHtml, faces, HOOK };

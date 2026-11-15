// Telegram bot @yodlaPro_bot: study cards in chat, add cards (text / photo / voice via AI), reminders,
// streak saver, mini-tests, monthly goal, opt-in weekly ranking, PDF/Excel/Word reports and the Mini App.
import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';
import { requireAuth, signToken, publicUser } from './auth.js';
import { wrap } from './util.js';
import { nextCard, dueCount, labels, review, targetDeck, addCards, deleteCards, streaks, startOfDay, DAY, toCard, presetFor, settingsOf, reportData } from './cards.js';
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
    hello: (n) => `Salom${n ? ', ' + n : ''}! 👋 Men <b>Yodla</b> botiman.\n\n▶️ /oqish — kartalarni shu yerda takrorlash\n⚡ /test — 5 ta so'zli mini-test\n➕ So'z qo'shish: <code>apple - olma</code> deb yozing, yoki rasm 📷 / ovozli xabar 🎤 / matn yuboring — AI karta yasaydi\n📊 /hisobot — PDF, Excel, Word hisobot\n🎯 /maqsad 600 — oylik maqsad\n🏆 /reyting — haftalik reyting\n⚙️ /sozlamalar — eslatmalar va boshqalar`,
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
    hello: (n) => `Hi${n ? ', ' + n : ''}! 👋 I'm the <b>Yodla</b> bot.\n\n▶️ /study — review your cards right here\n⚡ /test — 5-word mini test\n➕ Add words: type <code>apple - olma</code>, or send a photo 📷 / voice 🎤 / text — AI makes cards\n📊 /report — PDF, Excel, Word reports\n🎯 /goal 600 — monthly goal\n🏆 /top — weekly ranking\n⚙️ /settings — reminders and more`,
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
    hello: (n) => `Привет${n ? ', ' + n : ''}! 👋 Я бот <b>Yodla</b>.\n\n▶️ /study — повторять карточки прямо здесь\n⚡ /test — мини-тест из 5 слов\n➕ Добавить слова: напишите <code>apple - яблоко</code>, или отправьте фото 📷 / голосовое 🎤 / текст — ИИ сделает карточки\n📊 /report — отчёты PDF, Excel, Word\n🎯 /goal 600 — цель на месяц\n🏆 /top — рейтинг недели\n⚙️ /settings — напоминания и другое`,
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
const REMINDER_TIMES = ['08:00', '12:00', '14:00', '18:00', '20:00', '22:00'];
const DEFAULT_PREFS = { reminders: ['20:00'], streakSaver: true, weeklyReport: true, leaderboard: false };

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
  return { q, a: a + (card.example ? `\n\n<i>${tgHtml(card.example)}</i>` : '') };
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
  const n = await nextCard(link.user_id);
  if (!n.card) {
    const sess = st.session;
    if (sess?.n) await setState(link.user_id, { session: null, mini: null });
    if (n.waitMs != null) return send(chatId, (sess?.n ? t.done(sess.n, sess.c) + '\n\n' : '') + t.wait(Math.max(1, Math.ceil(n.waitMs / 60000))), kb([[{ text: t.study(0), callback_data: 'st' }]]));
    return send(chatId, (sess?.n ? t.done(sess.n, sess.c) + '\n\n' : '') + t.nothing, kb([appButton(t)]));
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
const PAIR = /^\s*(.+?)\s+[-–—=]\s+(.+?)\s*$/;
async function addFromText(link, t, chatId, text) {
  const pairs = text.split('\n').map((l) => l.match(PAIR)).filter(Boolean);
  if (pairs.length && pairs.length >= text.split('\n').filter((l) => l.trim()).length * 0.6) {
    const deck = await targetDeck(link.user_id, link.prefs.deckId);
    const ids = await addCards(link.user_id, deck.id, pairs.map((m) => ({ front: m[1], back: m[2] })));
    await setState(link.user_id, { lastAdded: ids });
    return send(chatId, t.added(ids.length, esc(deck.title)), kb([[{ text: t.undo, callback_data: 'undo' }, { text: t.study(0), callback_data: 'st' }]]));
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
    const prompt = buildPrompt({ text: media ? undefined : text, topic: media ? 'the attached material' : undefined, count, language: lang, format: 'qa', detail: 'brief', instructions });
    const cards = parseCards(await callAI(prompt, undefined, media)).slice(0, count);
    if (!cards.length) throw new Error('no cards');
    await setState(link.user_id, { pending: cards });
    const list = cards.slice(0, 20).map((c, i) => `${i + 1}. <b>${esc(c.front)}</b> — ${esc(c.back)}`).join('\n');
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

function settingsKb(link, t, deckTitle) {
  const p = link.prefs, on = (b) => (b ? '✅' : '⬜');
  const times = REMINDER_TIMES.map((h) => ({ text: `${p.reminders.includes(h) ? '🔔' : '·'} ${h}`, callback_data: `rem:${h}` }));
  return kb([times.slice(0, 3), times.slice(3),
    [{ text: `${on(p.streakSaver)} ${t.streakSaver}`, callback_data: 'set:streakSaver' }],
    [{ text: `${on(p.weeklyReport)} ${t.weeklyReport}`, callback_data: 'set:weeklyReport' }],
    [{ text: `${on(p.leaderboard)} ${t.ranking}`, callback_data: 'set:leaderboard' }],
    [{ text: t.deckFor(deckTitle), callback_data: 'decks' }]]);
}
async function showSettings(link, t, chatId, editMsg) {
  const deck = await targetDeck(link.user_id, link.prefs.deckId);
  const body = { text: t.settings, parse_mode: 'HTML', ...settingsKb(link, t, deck.title) };
  if (editMsg) return tg('editMessageText', { chat_id: chatId, message_id: editMsg.message_id, ...body }).catch(() => {});
  return tg('sendMessage', { chat_id: chatId, ...body });
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
    return send(chatId, tt.hello(esc(link.name?.split(' ')[0])), kb([[{ text: tt.study(await dueCount(link.user_id)), callback_data: 'st' }, { text: tt.mini, callback_data: 'mini' }], appButton(tt)]));
  }
  if (!link) return send(chatId, t.notLinked, kb([appButton(t)]));

  if (['/start', '/help', '/menu'].includes(c)) return send(chatId, t.hello(esc(link.name?.split(' ')[0])), kb([[{ text: t.study(await dueCount(link.user_id)), callback_data: 'st' }, { text: t.mini, callback_data: 'mini' }], appButton(t)]));
  if (['/oqish', '/study', '/learn', '/учить'].includes(c)) { await setState(link.user_id, { session: null, mini: null }); return sendNext({ ...link, state: {} }, t, chatId); }
  if (['/test', '/mini'].includes(c)) { const mini = { total: 5, done: 0, correct: 0 }; await setState(link.user_id, { mini, session: null }); return sendNext({ ...link, state: { mini } }, t, chatId); }
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
  if (k === 'st') { await setState(link.user_id, { session: null, mini: null }); return sendNext({ ...link, state: {} }, t, chatId); }
  if (k === 'mini') { const mini = { total: 5, done: 0, correct: 0 }; await setState(link.user_id, { mini, session: null }); return sendNext({ ...link, state: { mini } }, t, chatId); }
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
    const ids = await addCards(link.user_id, deck.id, cards);
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
    const v = !link.prefs[a]; await setPrefs(link.user_id, { [a]: v });
    return showSettings({ ...link, prefs: { ...link.prefs, [a]: v } }, t, chatId, cb.message);
  }
  if (k === 'decks') {
    const { rows } = await q('select id, title from decks where user_id=$1 and not archived order by title limit 40', [link.user_id]);
    return tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t.chooseDeck, ...kb(rows.map((d) => [{ text: (d.id === link.prefs.deckId ? '✅ ' : '') + d.title, callback_data: `deck:${d.id}` }])) });
  }
  if (k === 'deck') { await setPrefs(link.user_id, { deckId: a }); return showSettings({ ...link, prefs: { ...link.prefs, deckId: a } }, t, chatId, cb.message); }
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
      uz: [['oqish', 'Kartalarni takrorlash'], ['test', '5 ta so‘zli mini-test'], ['hisobot', 'PDF / Excel / Word hisobot'], ['maqsad', 'Oylik maqsad'], ['reyting', 'Haftalik reyting'], ['sozlamalar', 'Eslatmalar va sozlamalar']],
      en: [['study', 'Review cards'], ['test', '5-card mini test'], ['report', 'PDF / Excel / Word report'], ['goal', 'Monthly goal'], ['top', 'Weekly ranking'], ['settings', 'Reminders and settings']],
      ru: [['study', 'Повторять карточки'], ['test', 'Мини-тест (5)'], ['report', 'Отчёт PDF / Excel / Word'], ['goal', 'Цель на месяц'], ['top', 'Рейтинг недели'], ['settings', 'Напоминания и настройки']],
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

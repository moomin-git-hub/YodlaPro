// End-to-end test of the Telegram bot against a real Postgres, with fake Telegram and Gemini APIs.
// Run: node --env-file=<env with DATABASE_URL, JWT_SECRET> test/telegram.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.TELEGRAM_BOT_TOKEN = '123:TEST';
process.env.TELEGRAM_API_URL = 'http://fake-telegram';
process.env.PUBLIC_URL = 'http://yodla.test';
process.env.AI_PROVIDER = 'gemini';
process.env.AI_API_KEY = 'fake';

// ---- fake Telegram + Gemini ----
const sent = []; let mid = 100; let aiReply = '{"cards":[{"front":"apple","back":"olma","example":"I eat an apple."}]}';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('http://fake-telegram/')) {
    if (url.includes('/file/bot')) return new Response(Buffer.from('PNGDATA'));
    const method = url.split('/').pop();
    let body = {};
    if (opts.body instanceof FormData) { for (const [k, v] of opts.body.entries()) body[k] = typeof v === 'string' ? v : `<file ${v.size}b ${v.name ?? ''}>`; }
    else body = JSON.parse(opts.body ?? '{}');
    sent.push({ method, ...body });
    const result = method === 'getFile' ? { file_path: 'photos/x.jpg', file_size: 7 } : { message_id: ++mid, chat: { id: body.chat_id } };
    return new Response(JSON.stringify({ ok: true, result }));
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    const req = JSON.parse(opts.body); globalThis.lastAiReq = req;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: aiReply }] } }] }));
  }
  if (url.includes('translate.google.com')) return new Response(Buffer.from('MP3'));
  return realFetch(url, opts);
};

const { migrate, q } = await import('../src/db.js');
await migrate();
const tg = await import('../src/telegram.js');
const { buildReport } = await import('../src/reports.js');
const { onUpdate, tgHtml } = tg._test;

const CHAT = 900000000 + Math.floor(Math.random() * 1e6);
const email = `tg${Date.now()}@x.uz`;
const { rows: [user] } = await q(`insert into users (email, name, password_hash) values ($1,'Normo''min','x') returning *`, [email]);
await q(`insert into user_settings (user_id, data) values ($1, '{"lang":"uz","newPerDay":20}')`, [user.id]);
const deckId = crypto.randomUUID();
await q(`insert into decks (id, user_id, title, algorithm) values ($1,$2,'4000 words','fsrs')`, [deckId, user.id]);
for (const [i, [f, b]] of [['principle', 'axloq qoidalari'], ['analyse', 'tahlil qilmoq'], ['<b>chase</b> (n)', 'quvish']].entries())
  await q(`insert into flashcards (id, user_id, deck_id, front, back, note_id, created_at) values ($1,$2,$3,$4,$5,$1, now() + ($6 || ' ms')::interval)`, [crypto.randomUUID(), user.id, deckId, f, b, String(i)]);

const msg = (text, extra = {}) => onUpdate({ message: { message_id: 1, chat: { id: CHAT, type: 'private' }, from: { id: CHAT, first_name: 'Mo‘min', language_code: 'uz' }, text, ...extra } });
const cb = (data, message = { message_id: mid, chat: { id: CHAT }, text: 'x' }) => onUpdate({ callback_query: { id: 'c' + Math.random(), from: { id: CHAT }, data, message } });
const last = (m) => [...sent].reverse().find((s) => !m || s.method === m);
const markup = (s) => s.reply_markup?.inline_keyboard?.flat() ?? [];

// 1. not linked
await msg('/start');
assert.match(last('sendMessage').text, /hisobingizni ulang/); console.log('✓ not linked → asks to connect');

// 2. link via code
const code = 'CODE' + Date.now();
await q(`insert into telegram_codes (code, user_id, expires_at) values ($1,$2, now() + interval '5 minutes')`, [code, user.id]);
await msg('/start ' + code);
assert.ok(sent.some((s) => /Hisob ulandi/.test(s.text ?? '')));
assert.match(markup(last('sendMessage')).find((b) => b.callback_data === 'st').text, /\(3\)/);
await msg('/start ' + code);
assert.match(last('sendMessage').text, /eskirgan/); console.log('✓ linked with one-time code, study button shows 3 cards');

// 3. study: question → reveal → Good → next card
await msg('/oqish');
let q1 = last('sendMessage');
assert.match(q1.text, /principle/); assert.match(q1.text, /3 ta qoldi/);
const sh = markup(q1).find((b) => b.callback_data.startsWith('sh:')).callback_data;
await cb(sh);
let rev = last('editMessageText');
assert.match(rev.text, /axloq qoidalari/);
const btns = markup(rev).filter((b) => b.callback_data.startsWith('r:'));
assert.deepEqual(btns.map((b) => b.text.split(' · ')[1]), ['1m', '15m', '1d', '4d']); console.log('✓ reveal shows answer + Noji times 1m/15m/1d/4d');
const good = btns[2].callback_data;
await cb(good, { message_id: mid, chat: { id: CHAT }, text: 'principle' });
await cb(good, { message_id: mid, chat: { id: CHAT }, text: 'principle' }); // double tap ignored
const { rows: logs } = await q('select * from review_logs where user_id=$1', [user.id]);
assert.equal(logs.length, 1); assert.equal(logs[0].rating, 3);
const { rows: [p] } = await q(`select status, "interval" from flashcards where user_id=$1 and front='principle'`, [user.id]);
assert.equal(p.status, 'review'); assert.equal(p.interval, 1);
assert.match(last('sendMessage').text, /analyse/); console.log('✓ Good schedules 1d, logs once (double tap ignored), next card follows');

// 4. Again keeps it in learning; html sanitised
const sh2 = markup(last('sendMessage')).find((b) => b.callback_data.startsWith('sh:')).callback_data;
await cb(sh2); await cb(markup(last('editMessageText')).find((b) => b.callback_data.startsWith('r:') && b.callback_data.split(':')[2] === '1').callback_data);
const third = last('sendMessage');
assert.match(third.text, /<b>chase<\/b> \(n\)/);
assert.equal(tgHtml('<div>a<script>x</script><b>b</b><span style="x">c</span></div>'), 'ax<b>b</b>c'); console.log('✓ Again → learning; card HTML converted safely');

// 5. stop → session summary
await cb('stop');
assert.match(last('sendMessage').text, /Seans tugadi: <b>2<\/b>/); console.log('✓ session summary');

// 6. add cards by text pairs + undo
await msg('cat - mushuk\ndog - it');
assert.match(last('sendMessage').text, /2 ta karta <b>«Telegram»<\/b>/);
let { rows: tgCards } = await q(`select f.front from flashcards f join decks d on d.id=f.deck_id where d.user_id=$1 and d.title='Telegram'`, [user.id]);
assert.equal(tgCards.length, 2);
await cb('undo');
({ rows: tgCards } = await q(`select f.front from flashcards f join decks d on d.id=f.deck_id where d.user_id=$1 and d.title='Telegram'`, [user.id]));
assert.equal(tgCards.length, 0); console.log('✓ "cat - mushuk" adds cards to Telegram deck; undo removes them');

// 7. single word → AI card preview → add
await msg('apple');
assert.match(last('editMessageText').text, /apple<\/b> — olma/);
assert.match(globalThis.lastAiReq.contents[0].parts.at(-1).text, /exactly 1 card/);
await cb('add:ok');
assert.match(last('editMessageText').text, /1 ta karta/); console.log('✓ single word → AI card (translation + example) → added');

// 8. photo → AI with image
aiReply = '{"cards":[{"front":"bankruptcy","back":"bankrotlik"},{"front":"chase","back":"quvish"}]}';
await msg(undefined, { text: undefined, photo: [{ file_id: 'small' }, { file_id: 'big' }] });
assert.equal(globalThis.lastAiReq.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
assert.match(last('editMessageText').text, /2 ta karta tayyor/);
await cb('add:no'); assert.equal(last('editMessageText').text, 'Bekor qilindi.'); console.log('✓ photo → AI reads image → preview → cancel');

// 9. reports
for (const fmt of ['pdf', 'xlsx', 'docx']) {
  const r = await buildReport(user.id, fmt, 'week');
  assert.ok(r.buffer.length > 2000, fmt + ' size');
  const magic = r.buffer.subarray(0, 4).toString('latin1');
  assert.ok(fmt === 'pdf' ? magic === '%PDF' : magic.startsWith('PK'), fmt + ' magic');
  (await import('node:fs')).writeFileSync(`/tmp/${r.name}`, r.buffer);
}
await cb('rep:xlsx:week');
assert.match(sent.find((s) => s.method === 'sendDocument' && s.document)?.document, /yodla-kartalar/); console.log('✓ PDF / Excel / Word reports built and sent');

// 10. goal + ranking + settings
await msg('/maqsad 600');
assert.ok(sent.some((s) => /Oylik maqsad: <b>600<\/b>/.test(s.text ?? '')));
assert.match(last('sendMessage').text, /1\/600|2\/600/);
await msg('/reyting'); assert.match(last('sendMessage').text, /Haftalik reyting — qatnashuvchilar/);
await cb('lb:on'); assert.match(last('sendMessage').text, /🥇 Normo'min — 2/);
await msg('/sozlamalar');
await cb('rem:08:00', { message_id: mid, chat: { id: CHAT } });
const { rows: [lk] } = await q('select prefs from telegram_links where user_id=$1', [user.id]);
assert.deepEqual(lk.prefs.reminders, ['08:00', '20:00']); console.log('✓ goal, opt-in ranking, reminder settings');

// 11. scheduled reminder + streak saver (once per day)
const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
await q(`update flashcards set due = now() - interval '1 hour' where user_id=$1 and status='learning'`, [user.id]);
const before = sent.length;
await tg.tick(at(8, 0)); await tg.tick(at(8, 0));
const reminders = sent.slice(before).filter((s) => /kutyapti/.test(s.text ?? ''));
assert.equal(reminders.length, 1); console.log('✓ reminder sent once at 08:00');

// 12. Mini App sign-in (initData HMAC)
const user0 = JSON.stringify({ id: CHAT, first_name: 'M' });
const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'Q', user: user0 });
const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
const secret = createHmac('sha256', 'WebAppData').update('123:TEST').digest();
params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
await new Promise((r) => { tg.miniAppAuth({ body: { initData: params.toString() } }, { ...res, json(b) { res.body = b; r(); return this; }, status(c) { res.code = c; return this; } }, r); });
assert.equal(res.body.user.email, email); assert.ok(res.body.token);
params.set('hash', 'bad'.padEnd(64, '0'));
await new Promise((r) => { tg.miniAppAuth({ body: { initData: params.toString() } }, { json(b) { res.body = b; r(); return this; }, status(c) { res.code = c; return this; } }, r); });
assert.equal(res.code, 401); console.log('✓ Mini App sign-in verifies Telegram signature');

// 13. add card with example + explanation: one line, labelled lines, and the step-by-step wizard
const cardOf = async (front) => (await q(`select * from flashcards where user_id=$1 and front=$2`, [user.id, front])).rows[0];
await msg('book - kitob | I read a book. | ot, sanaladigan');
let bk = await cardOf('book');
assert.equal(bk.back, 'kitob'); assert.equal(bk.example, 'I read a book.'); assert.equal(bk.explanation, 'ot, sanaladigan');
await msg('grape - uzum - I like grapes. - meva');
const gr = await cardOf('grape');
assert.equal(gr.back, 'uzum'); assert.equal(gr.example, 'I like grapes.'); assert.equal(gr.explanation, 'meva');
await msg('pen - ruchka\nmisol: Give me a pen.\nizoh: yozish quroli\ncup - piyola');
const pen = await cardOf('pen'), cup = await cardOf('cup');
assert.equal(pen.example, 'Give me a pen.'); assert.equal(pen.explanation, 'yozish quroli'); assert.equal(cup.back, 'piyola');
await msg('/qoshish');
assert.match(last('sendMessage').text, /1\/4/);
await msg('window'); assert.match(last('sendMessage').text, /2\/4/);
await msg('deraza'); assert.match(last('sendMessage').text, /3\/4/);
await msg('Open the window.'); assert.match(last('sendMessage').text, /4\/4/);
await cb('wzs');
const win = await cardOf('window');
assert.equal(win.back, 'deraza'); assert.equal(win.example, 'Open the window.'); assert.equal(win.explanation, '');
assert.match(last('sendMessage').text, /saqlandi/);
console.log('✓ cards with example + explanation: one line, labelled lines, 4-step wizard (skip)');

// 14. AI fills example + explanation for a card that has none
aiReply = '{"cards":[{"i":1,"example":"The cat sleeps.","explanation":"uy hayvoni"}]}';
await msg('cat - mushuk');
await cb('enrich');
const cat = await cardOf('cat');
assert.equal(cat.example, 'The cat sleeps.'); assert.equal(cat.explanation, 'uy hayvoni'); console.log('✓ AI adds example + explanation to new cards');

// 15. decks: list → open → create subdeck → rename → study only that deck → archive → delete
await msg('/decklar');
let dl = last('sendMessage');
assert.ok(markup(dl).some((b) => b.callback_data === `dk:${deckId}`));
await cb(`dk:${deckId}`, { message_id: dl.message_id ?? mid, chat: { id: CHAT }, text: 'x' });
assert.match(last('editMessageText').text, /4000 words/);
await cb(`ds:${deckId}`); await msg('Fe’llar');
const { rows: [sub] } = await q(`select * from decks where user_id=$1 and title='Fe’llar'`, [user.id]);
assert.equal(sub.parent_id, deckId);
await cb(`dr:${sub.id}`); await msg('Verbs');
assert.equal((await q('select title from decks where id=$1', [sub.id])).rows[0].title, 'Verbs');
await q(`insert into flashcards (id, user_id, deck_id, front, back, note_id) values ($1,$2,$3,'run','yugurmoq',$1)`, [crypto.randomUUID(), user.id, sub.id]);
await cb(`sd:${sub.id}`);
assert.match(last('sendMessage').text, /Verbs/); assert.match(last('sendMessage').text, /run/);
await cb('stop');
await cb(`da:${sub.id}`); assert.equal((await q('select archived from decks where id=$1', [sub.id])).rows[0].archived, true);
await cb(`dx:${sub.id}`); assert.match(last('editMessageText').text, /o‘chiraymi/);
await cb(`dy:${sub.id}`);
assert.equal((await q('select count(*)::int n from decks where id=$1', [sub.id])).rows[0].n, 0);
assert.equal((await q(`select count(*)::int n from flashcards where front='run' and user_id=$1`, [user.id])).rows[0].n, 0);
console.log('✓ decks: list, open, subdeck, rename, study one deck, archive, delete');

// 16. cards: list → open → edit answer / clear example → bookmark → freeze → reset → delete (whole note)
await cb(`cl:${deckId}:0`);
assert.ok(markup(last('editMessageText')).some((b) => b.callback_data.startsWith('cd:')));
const pr = await cardOf('principle');
await cb(`cd:${pr.id}`); assert.match(last('editMessageText').text, /axloq qoidalari/);
await cb(`ce:back:${pr.id}`); await msg('tamoyil');
await cb(`ce:example:${pr.id}`); await msg('-');
let prn = await cardOf('principle');
assert.equal(prn.back, 'tamoyil'); assert.equal(prn.example, '');
await cb(`cf:bookmarked:${pr.id}`); await cb(`cf:frozen:${pr.id}`);
prn = await cardOf('principle'); assert.equal(prn.bookmarked, true); assert.equal(prn.frozen, true);
await cb(`cr:${pr.id}`); prn = await cardOf('principle'); assert.equal(prn.status, 'new'); assert.equal(prn.reps, 0);
const revId = crypto.randomUUID();
await q(`insert into flashcards (id, user_id, deck_id, front, back, note_id, card_type) values ($1,$2,$3,'principle','tamoyil',$4,'reverse')`, [revId, user.id, deckId, pr.note_id ?? pr.id]);
await cb(`cx:${pr.id}`); await cb(`cy:${pr.id}`);
assert.equal((await q(`select count(*)::int n from flashcards where user_id=$1 and front='principle'`, [user.id])).rows[0].n, 0);
console.log('✓ cards: list, open, edit, clear field, bookmark, freeze, reset, delete whole note');

// 17. search, stats, daily report on demand, settings (new words per day, shuffle, daily time)
await msg('/qidir kitob'); assert.match(last('sendMessage').text, /1 ta natija/);
await msg('/qidir zzzz'); assert.match(last('sendMessage').text, /hech narsa topilmadi/);
await msg('/statistika'); assert.match(last('sendMessage').text, /Statistika/);
await msg('/bugun'); assert.match(last('sendMessage').text, /Bugungi hisobot/); assert.match(last('sendMessage').text, /Takrorlar: <b>\d+/);
await msg('/sozlamalar');
await cb('np:5'); await cb('shf'); await cb('dt');
const { rows: [st2] } = await q('select data from user_settings where user_id=$1', [user.id]);
assert.equal(st2.data.newPerDay, 25); assert.equal(st2.data.shuffle, true); assert.ok(st2.data.updatedAt > Date.now() - 60_000);
const { rows: [lk2] } = await q('select prefs from telegram_links where user_id=$1', [user.id]);
assert.equal(lk2.prefs.dailyTime, '22:00');
console.log('✓ search, statistics, daily report, settings (new/day, shuffle, report time)');

// 18. daily report is sent automatically, once, at the chosen time
const b2 = sent.length;
await tg.tick(at(22, 0)); await tg.tick(at(22, 0));
assert.equal(sent.slice(b2).filter((s) => /Bugungi hisobot/.test(s.text ?? '')).length, 1); console.log('✓ daily report sent once at 22:00');

// 19. a command cancels a pending question; menu works
await cb('sr'); await msg('/menu');
assert.match(last('sendMessage').text, /Asosiy menyu/);
const { rows: [lk3] } = await q('select state from telegram_links where user_id=$1', [user.id]);
assert.equal(lk3.state.input, null);
await cb('dk:not-a-uuid'); // malformed ids are ignored
console.log('✓ commands cancel pending input; menu; malformed ids ignored');

await q('delete from users where id=$1', [user.id]);
console.log('\nALL TELEGRAM TESTS PASSED');
process.exit(0);

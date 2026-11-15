// Study reports for the Telegram bot and the apps: PDF (overview), Excel (all cards), Word (hard-words notebook).
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } from 'docx';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reportData, settingsOf, formatDuration, DAY } from './cards.js';
import { q } from './db.js';

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const BRAND = '#7C5CFC', AMBER = '#F59E0B', GREEN = '#10B981', ROSE = '#F43F5E', INK = '#1F2033', MUTED = '#6B6F86';

const L = {
  en: { title: 'Yodla study report', week: 'Last 7 days', month: 'Last 30 days', streak: 'Day streak', best: 'Longest streak', active: 'Active days',
    reviews: 'Reviews', accuracy: 'Accuracy', newLearned: 'New words', perDay: 'Reviews per day', totals: 'Your cards', all: 'All', new: 'New',
    learning: 'Learning', mastered: 'Mastered', hard: 'Hardest words', upcoming: 'Coming reviews (next 7 days)', goal: 'Monthly goal',
    front: 'Question', back: 'Answer', deck: 'Deck', status: 'Status', next: 'Next review', lapses: 'Forgotten', recall: 'Recall now',
    stability: 'Memory (days)', example: 'Example', notebook: 'Hard words notebook', notebookSub: 'Words you forget most often — read them aloud, use each one in a sentence.',
    statusNames: { new: 'New', learning: 'Learning', relearning: 'Relearning', review: 'Review' }, none: 'No hard words — great job!', generated: 'Generated' },
  uz: { title: 'Yodla o‘qish hisoboti', week: 'Oxirgi 7 kun', month: 'Oxirgi 30 kun', streak: 'Kunlik seriya', best: 'Eng uzun seriya', active: 'Faol kunlar',
    reviews: 'Takrorlar', accuracy: 'Aniqlik', newLearned: 'Yangi so‘zlar', perDay: 'Kunlik takrorlar', totals: 'Kartalaringiz', all: 'Jami', new: 'Yangi',
    learning: 'O‘rganilmoqda', mastered: 'O‘zlashtirilgan', hard: 'Eng qiyin so‘zlar', upcoming: 'Kelayotgan takrorlar (7 kun)', goal: 'Oylik maqsad',
    front: 'Savol', back: 'Javob', deck: 'Deck', status: 'Holati', next: 'Keyingi takror', lapses: 'Unutilgan', recall: 'Eslab qolish',
    stability: 'Xotira (kun)', example: 'Misol', notebook: 'Qiyin so‘zlar daftari', notebookSub: 'Eng ko‘p unutadigan so‘zlaringiz — ovoz chiqarib o‘qing, har birini gapda ishlating.',
    statusNames: { new: 'Yangi', learning: 'O‘rganilmoqda', relearning: 'Qayta o‘rganilmoqda', review: 'Takrorlash' }, none: 'Qiyin so‘zlar yo‘q — zo‘r!', generated: 'Tayyorlangan' },
  ru: { title: 'Отчёт Yodla', week: 'Последние 7 дней', month: 'Последние 30 дней', streak: 'Дней подряд', best: 'Лучшая серия', active: 'Активных дней',
    reviews: 'Повторений', accuracy: 'Точность', newLearned: 'Новых слов', perDay: 'Повторений в день', totals: 'Ваши карточки', all: 'Всего', new: 'Новые',
    learning: 'Изучаются', mastered: 'Выучены', hard: 'Самые трудные слова', upcoming: 'Предстоящие повторения (7 дней)', goal: 'Цель на месяц',
    front: 'Вопрос', back: 'Ответ', deck: 'Колода', status: 'Статус', next: 'Следующее', lapses: 'Забыто', recall: 'Помню сейчас',
    stability: 'Память (дн.)', example: 'Пример', notebook: 'Тетрадь трудных слов', notebookSub: 'Слова, которые вы чаще всего забываете — прочитайте вслух и составьте с каждым предложение.',
    statusNames: { new: 'Новая', learning: 'Изучается', relearning: 'Переучивается', review: 'Повторение' }, none: 'Трудных слов нет — отлично!', generated: 'Создан' },
};

const plain = (h) => String(h ?? '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
const fmtDay = (ts, lang) => new Intl.DateTimeFormat(lang === 'uz' ? 'uz-Latn' : lang, { day: 'numeric', month: 'short', timeZone: process.env.TZ || 'Asia/Tashkent' }).format(ts);
const recall = (c, now) => (c.stability > 0 && c.lastReview ? Math.pow(1 + (19 / 81) * Math.max(0, (now - c.lastReview) / DAY) / c.stability, -0.5) : null);

export async function buildReport(userId, fmt, period = 'week') {
  const settings = await settingsOf(userId);
  const lang = L[settings.lang] ? settings.lang : 'uz';
  const t = L[lang];
  const d = await reportData(userId, period === 'month' ? 30 : 7);
  // monthly goal (set in the bot): new words learned since the 1st of this month
  const { rows: [tg] } = await q('select prefs from telegram_links where user_id=$1', [userId]);
  d.goal = tg?.prefs?.goal ?? null;
  if (d.goal) {
    const n = new Date(d.now), monthStart = new Date(n.getFullYear(), n.getMonth(), 1);
    const { rows: [g] } = await q(`select count(distinct card_id)::int n from review_logs where user_id=$1 and prev_status='new' and ts >= $2`, [userId, monthStart]);
    d.goalDone = g.n;
  }
  const stamp = new Date(d.now).toISOString().slice(0, 10);
  if (fmt === 'pdf') return { buffer: await pdf(d, t, lang), name: `yodla-hisobot-${stamp}.pdf`, mime: 'application/pdf' };
  if (fmt === 'xlsx') return { buffer: await xlsx(d, t), name: `yodla-kartalar-${stamp}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  if (fmt === 'docx') return { buffer: await docx(d, t), name: `yodla-qiyin-sozlar-${stamp}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  throw Object.assign(new Error('Unknown format'), { status: 400 });
}

// ---------------- PDF: one-page overview ----------------
function pdf(d, t, lang) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: t.title, Author: 'Yodla' } });
    const out = []; doc.on('data', (b) => out.push(b)); doc.on('end', () => resolve(Buffer.concat(out))); doc.on('error', reject);
    doc.registerFont('R', path.join(FONT_DIR, 'DejaVuSans.ttf')); doc.registerFont('B', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
    const W = doc.page.width - 80, X = 40;
    // header band
    doc.rect(0, 0, doc.page.width, 92).fill(BRAND);
    doc.fill('#fff').font('B').fontSize(22).text(t.title, X, 26);
    doc.font('R').fontSize(11).text(`${d.user.name || d.user.email} · ${d.days === 30 ? t.month : t.week} · ${fmtDay(d.from, lang)} – ${fmtDay(d.now, lang)}`, X, 58);
    let y = 112;
    // stat tiles
    const acc = d.reviews ? Math.round((d.correct / d.reviews) * 100) : 0;
    const tiles = [[`🔥 ${d.streak.current}`, t.streak, AMBER], [String(d.reviews), t.reviews, BRAND], [`${acc}%`, t.accuracy, GREEN], [String(d.learnedNew), t.newLearned, '#0EA5E9']];
    const tw = (W - 30) / 4;
    tiles.forEach(([v, l, c], i) => {
      const x = X + i * (tw + 10);
      doc.roundedRect(x, y, tw, 64, 10).fill('#F5F3FF');
      doc.fill(c).font('B').fontSize(20).text(v.replace('🔥 ', ''), x, y + 10, { width: tw, align: 'center' });
      doc.fill(MUTED).font('R').fontSize(9).text(l, x, y + 40, { width: tw, align: 'center' });
    });
    y += 80;
    doc.fill(MUTED).font('R').fontSize(9).text(`${t.best}: ${d.streak.best} · ${t.active}: ${d.streak.active}`, X, y); y += 18;
    // daily bar chart
    doc.fill(INK).font('B').fontSize(13).text(t.perDay, X, y); y += 20;
    const chartH = 90, max = Math.max(1, ...d.daily.map((x) => x.n)), bw = W / d.daily.length;
    d.daily.forEach((x, i) => {
      const h = Math.round((x.n / max) * chartH), bx = X + i * bw + bw * 0.18;
      doc.roundedRect(bx, y + chartH - h, bw * 0.64, Math.max(h, 2), 3).fill(x.n ? BRAND : '#E5E7EB');
      if (d.daily.length <= 7) { doc.fill(INK).font('B').fontSize(8).text(String(x.n), X + i * bw, y + chartH - h - 11, { width: bw, align: 'center' }); }
      if (d.daily.length <= 7 || i % 5 === 0) doc.fill(MUTED).font('R').fontSize(7).text(fmtDay(x.day, lang), X + i * bw - 4, y + chartH + 4, { width: bw + 8, align: 'center' });
    });
    y += chartH + 26;
    // totals bar
    doc.fill(INK).font('B').fontSize(13).text(t.totals, X, y); y += 20;
    const parts = [[d.totals.new, t.new, '#0EA5E9'], [d.totals.learning, t.learning, AMBER], [d.totals.mastered, t.mastered, GREEN]];
    let bx = X;
    parts.forEach(([n, , c]) => { const w = d.totals.all ? (n / d.totals.all) * W : 0; if (w > 0) doc.rect(bx, y, w, 14).fill(c); bx += w; });
    y += 20;
    doc.font('R').fontSize(9);
    parts.forEach(([n, l, c], i) => { doc.circle(X + 6 + i * 150, y + 5, 4).fill(c); doc.fill(INK).text(`${l}: ${n}`, X + 14 + i * 150, y); });
    doc.fill(MUTED).text(`${t.all}: ${d.totals.all}`, X + 450, y); y += 20;
    if (d.goal) {
      const done = d.goalDone ?? 0;
      doc.fill(INK).font('B').fontSize(11).text(`${t.goal}: ${Math.min(done, d.goal)} / ${d.goal}`, X, y); y += 16;
      doc.roundedRect(X, y, W, 8, 4).fill('#E5E7EB'); doc.roundedRect(X, y, W * Math.min(1, done / d.goal), 8, 4).fill(GREEN); y += 18;
    }
    // upcoming
    doc.fill(INK).font('B').fontSize(13).text(t.upcoming, X, y); y += 18;
    doc.font('R').fontSize(10).fill(INK).text(d.upcoming.map((u) => `${fmtDay(u.day, lang)}: ${u.n}`).join('   ·   '), X, y, { width: W }); y += 24;
    // hardest words table
    doc.fill(INK).font('B').fontSize(13).text(t.hard, X, y); y += 20;
    if (!d.hard.length) doc.font('R').fontSize(10).fill(MUTED).text(t.none, X, y);
    const cols = [W * 0.34, W * 0.42, W * 0.12, W * 0.12];
    const head = [t.front, t.back, t.lapses, t.next];
    const row = (vals, bold, fill) => {
      const hgt = Math.max(...vals.map((v, i) => doc.font(bold ? 'B' : 'R').fontSize(9).heightOfString(v, { width: cols[i] - 8 }))) + 8;
      if (y + hgt > doc.page.height - 40) { doc.addPage(); y = 40; }
      if (fill) doc.rect(X, y, W, hgt).fill(fill);
      let x = X; vals.forEach((v, i) => { doc.fill(INK).font(bold ? 'B' : 'R').fontSize(9).text(v, x + 4, y + 4, { width: cols[i] - 8 }); x += cols[i]; });
      y += hgt;
    };
    if (d.hard.length) {
      row(head, true, '#EDE9FE');
      d.hard.slice(0, 15).forEach((c, i) => row([plain(c.front).slice(0, 80), plain(c.back).slice(0, 110), String((d.lapsesInPeriod.get(c.id) ?? 0) || c.lapses), c.status === 'new' ? '—' : c.due <= d.now ? '✓' : formatDuration(c.due - d.now)], false, i % 2 ? '#FAFAFF' : null));
    }
    doc.fill(MUTED).font('R').fontSize(8).text(`${t.generated}: ${new Date(d.now).toLocaleString('ru-RU', { timeZone: process.env.TZ || 'Asia/Tashkent' })} · yodla.onrender.com`, X, doc.page.height - 30, { width: W, align: 'center' });
    doc.end();
  });
}

// ---------------- Excel: every card with its state ----------------
async function xlsx(d, t) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Yodla'; wb.created = new Date(d.now);
  const ws = wb.addWorksheet(t.totals, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: t.deck, key: 'deck', width: 20 }, { header: t.front, key: 'front', width: 34 }, { header: t.back, key: 'back', width: 40 },
    { header: t.example, key: 'example', width: 34 }, { header: t.status, key: 'status', width: 16 }, { header: t.next, key: 'next', width: 18 },
    { header: t.lapses, key: 'lapses', width: 11 }, { header: t.stability, key: 'stability', width: 14 }, { header: t.recall, key: 'recall', width: 14 },
  ];
  d.cards.forEach((c) => {
    const r = recall(c, d.now);
    ws.addRow({ deck: c.deckTitle, front: plain(c.front), back: plain(c.back), example: plain(c.example), status: t.statusNames[c.status] ?? c.status,
      next: c.status === 'new' ? null : new Date(c.due), lapses: c.lapses, stability: c.stability ? Math.round(c.stability * 10) / 10 : null, recall: r == null ? null : r });
  });
  const head = ws.getRow(1); head.font = { bold: true, color: { argb: 'FFFFFFFF' } }; head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C5CFC' } }; head.height = 22;
  ws.getColumn('next').numFmt = 'dd.mm.yyyy hh:mm'; ws.getColumn('recall').numFmt = '0%';
  ['front', 'back', 'example'].forEach((k) => { ws.getColumn(k).alignment = { wrapText: true, vertical: 'top' }; });
  ws.autoFilter = { from: 'A1', to: 'I1' };
  // per-day sheet
  const ds = wb.addWorksheet(t.perDay);
  ds.columns = [{ header: 'Date', key: 'day', width: 14 }, { header: t.reviews, key: 'n', width: 12 }];
  d.daily.forEach((x) => ds.addRow({ day: new Date(x.day), n: x.n }));
  ds.getColumn('day').numFmt = 'dd.mm.yyyy'; ds.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------- Word: hard-words notebook ----------------
async function docx(d, t) {
  const words = d.hard.length ? d.hard : d.cards.filter((c) => c.status !== 'new').sort((a, b) => b.difficulty - a.difficulty).slice(0, 30);
  const cell = (text, opts = {}) => new TableCell({ width: { size: opts.w ?? 50, type: WidthType.PERCENTAGE }, shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: String(text).split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: opts.bold, size: opts.size ?? 24, color: opts.color })] })) });
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'DDD6FE' };
  const doc = new Document({
    creator: 'Yodla', title: t.notebook,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: t.notebook, color: '7C5CFC', bold: true })] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `${d.user.name || ''} · ${t.notebookSub}`, color: '6B6F86', size: 22 })] }),
      ...(words.length ? [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
        rows: [
          new TableRow({ tableHeader: true, children: [cell(t.front, { bold: true, fill: 'EDE9FE', w: 35 }), cell(t.back, { bold: true, fill: 'EDE9FE', w: 45 }), cell(t.lapses, { bold: true, fill: 'EDE9FE', w: 20 })] }),
          ...words.map((c) => new TableRow({ children: [
            cell(plain(c.front), { bold: true, w: 35, size: 26 }),
            cell(plain(c.back) + (c.example ? `\n${t.example}: ${plain(c.example)}` : ''), { w: 45 }),
            cell(String((d.lapsesInPeriod.get(c.id) ?? 0) || c.lapses), { w: 20, color: 'F43F5E' }),
          ] })),
        ],
      })] : [new Paragraph({ children: [new TextRun(t.none)] })]),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 300 }, children: [new TextRun({ text: 'Yodla · @yodlaPro_bot', color: '9CA3AF', size: 18 })] }),
    ] }],
  });
  return Packer.toBuffer(doc);
}

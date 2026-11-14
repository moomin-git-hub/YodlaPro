#!/usr/bin/env python3
"""Generates res/values{,-uz,-ru}/strings.xml from the web app's translations + Android-only strings.
Only keys referenced from Kotlin code are emitted. Run: python3 gen_strings.py"""
import json, re, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'app/src/main/res')
web = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'i18n_web.json')))

# key: (en, uz, ru) — Android-only additions and overrides. Use {0} {1}… as placeholders.
NEW = {
    'app_name': ('Yodla', 'Yodla', 'Yodla'),
    'navBack': ('Back', 'Orqaga', 'Назад'),
    'import_': ('Import', 'Import', 'Импорт'),
    'learner': ('Learner', "O'quvchi", 'Ученик'),
    'reminders': ('Daily reminder', 'Kunlik eslatma', 'Ежедневное напоминание'),
    'aiInstructions': ('Custom instructions (optional)', "Qo'shimcha ko'rsatma (ixtiyoriy)", 'Свои инструкции (необязательно)'),
    'aiInstructionsPh': ('e.g. Focus on definitions, include examples from hotel work', "masalan: Ta'riflarga e'tibor ber, mehmonxona misollarini qo'sh", 'напр. Сделай упор на определения, добавь примеры из отеля'),
    'aiNeedAccount': ('AI generation runs on your Yodla server. Sign in with a server account to use it.', "AI generator Yodla serveringizda ishlaydi. Undan foydalanish uchun server hisobiga kiring.", 'AI-генерация работает на вашем сервере Yodla. Войдите в аккаунт сервера.'),
    'aiServerSetup': ('The server has no AI key yet. In Render → Environment set AI_PROVIDER (anthropic | openai | gemini | openrouter) and AI_API_KEY, then redeploy.', "Serverda hali AI kaliti yo'q. Render → Environment'da AI_PROVIDER (anthropic | openai | gemini | openrouter) va AI_API_KEY ni kiriting va qayta deploy qiling.", 'На сервере нет AI-ключа. В Render → Environment задайте AI_PROVIDER (anthropic | openai | gemini | openrouter) и AI_API_KEY, затем передеплойте.'),
    'autoDetect': ('Auto-detect labels', 'Yozuvlarni avto topish', 'Найти подписи (AI)'),
    'autoplayAudio': ('Autoplay audio', 'Ovozni avtomatik ijro etish', 'Автовоспроизведение'),
    'backExtra': ('Back extra (optional)', "Orqa tomondagi qo'shimcha (ixtiyoriy)", 'Доп. текст на обороте (необязательно)'),
    'frontLang': ('Question voice', 'Savol ovozi', 'Голос вопроса'),
    'backLang': ('Answer voice', 'Javob ovozi', 'Голос ответа'),
    'cardAddedN': ('Saved {0} card(s)', '{0} ta karta saqlandi', 'Сохранено карточек: {0}'),
    'cardFormat': ('Card format', 'Karta formati', 'Формат карточек'),
    'cardStyle': ('Card style', "Karta ko'rinishi", 'Стиль карточек'),
    'cardsPerDayN': ('{0} cards / day', 'Kuniga {0} ta karta', '{0} карточек в день'),
    'changeImage': ('Change image', "Rasmni almashtirish", 'Сменить фото'),
    'cloze': ('Fill-in-the-blank', "Bo'sh joyni to'ldirish", 'Пропуски'),
    'clozeSub': ('Hide words in a sentence', "Gapdagi so'zlarni yashirish", 'Скрыть слова в предложении'),
    'clozeText': ('Text with blanks', "Bo'sh joyli matn", 'Текст с пропусками'),
    'clozePh': ('The capital of {{c1::France}} is {{c2::Paris}}', "{{c1::Toshkent}} — O'zbekiston poytaxti", 'Столица {{c1::Франции}} — {{c2::Париж}}'),
    'clozeHelp': ('Select a word and tap “Make blank”. {0} card(s) will be created.', "So'zni belgilab «Bo'sh joy» tugmasini bosing. {0} ta karta yaratiladi.", 'Выделите слово и нажмите «Пропуск». Будет создано карточек: {0}.'),
    'clozeRequired': ('Add at least one blank: {{c1::word}}', "Kamida bitta bo'sh joy qo'shing: {{c1::so'z}}", 'Добавьте хотя бы один пропуск: {{c1::слово}}'),
    'makeCloze': ('Make blank', "Bo'sh joy", 'Пропуск'),
    'codeBlock': ('Code', 'Kod', 'Код'),
    'confirmDeleteFolder': ('Delete folder “{0}”? Decks will stay.', "“{0}” papkasi o'chirilsinmi? Desklar qoladi.", 'Удалить папку «{0}»? Колоды останутся.'),
    'editFolder': ('Edit folder', 'Papkani tahrirlash', 'Изменить папку'),
    'connect': ('Connect', 'Ulash', 'Подключить'),
    'connectAccount': ('Sign in to sync across devices', "Qurilmalar o'rtasida sinxron uchun kiring", 'Войдите для синхронизации'),
    'guestUpgradeNote': ('Your decks on this phone will be uploaded to your account.', "Telefondagi desklaringiz hisobingizga yuklanadi.", 'Колоды с этого телефона будут загружены в аккаунт.'),
    'guestNote': ('Without an account your data stays only on this phone.', "Hisobsiz ma'lumotlar faqat shu telefonda saqlanadi.", 'Без аккаунта данные хранятся только на этом телефоне.'),
    'copyToCustom': ('Tap to copy into Custom', "Shaxsiyga nusxalash uchun bosing", 'Нажмите, чтобы скопировать в «Свой»'),
    'customizePresets': ('Customize algorithm', 'Algoritmni sozlash', 'Настроить алгоритм'),
    'dateAdded': ('Date added', "Qo'shilgan sana", 'Дата добавления'),
    'recent': ('Recently changed', "Yaqinda o'zgargan", 'Недавно изменённые'),
    'sort': ('Sort', 'Saralash', 'Сортировка'),
    'defaultPreset': ('Default preset', 'Standart preset', 'Пресет по умолчанию'),
    'deleteAccount': ('Delete account', "Hisobni o'chirish", 'Удалить аккаунт'),
    'deleteAccountConfirm': ('Delete your account and ALL data on the server? This cannot be undone.', "Hisobingiz va serverdagi BARCHA ma'lumotlar o'chirilsinmi? Qaytarib bo'lmaydi.", 'Удалить аккаунт и ВСЕ данные на сервере? Это необратимо.'),
    'deleteMask': ('Delete mask', "Niqobni o'chirish", 'Удалить маску'),
    'detailLevel': ('Detail level', 'Batafsillik', 'Детализация'),
    'detailBrief': ('Brief', 'Qisqa', 'Кратко'),
    'detailNormal': ('Normal', "O'rtacha", 'Обычно'),
    'detailDetailed': ('Detailed', 'Batafsil', 'Подробно'),
    'formatQa': ('Q&A', 'Savol-javob', 'Вопрос-ответ'),
    'formatBoth': ('Both', 'Ikkalasi', 'Оба'),
    'duplicateWarning': ('A card with the same question already exists in this deck.', "Bu deskda xuddi shunday savolli karta bor.", 'В колоде уже есть карточка с таким вопросом.'),
    'easyBonus': ('Easy bonus', 'Easy bonusi', 'Бонус «Легко»'),
    'easyInterval': ('Easy interval (days)', 'Easy intervali (kun)', 'Интервал «Легко» (дни)'),
    'graduatingInterval': ('Graduating interval (days)', "O'tish intervali (kun)", 'Интервал выпуска (дни)'),
    'intervalModifier': ('Interval modifier', "Interval ko'paytiruvchisi", 'Множитель интервала'),
    'maxInterval': ('Maximum interval (days)', 'Maksimal interval (kun)', 'Макс. интервал (дни)'),
    'maxReviewsPerDay': ('Max reviews per day', 'Kunlik maks. takrorlash', 'Макс. повторений в день'),
    'learningSteps': ('Learning steps (minutes)', "O'rganish qadamlari (daqiqa)", 'Шаги изучения (минуты)'),
    'relearningSteps': ('Relearning steps (minutes)', "Qayta o'rganish qadamlari (daqiqa)", 'Шаги переучивания (минуты)'),
    'stepsHint': ('Separate with spaces, e.g. 1 10 60', "Bo'sh joy bilan ajrating, masalan 1 10 60", 'Через пробел, напр. 1 10 60'),
    'exportCsv': ('Export CSV', 'CSV eksport', 'Экспорт CSV'),
    'exportJson': ('Export JSON', 'JSON eksport', 'Экспорт JSON'),
    'freezeCard': ('Freeze (skip in study)', "Muzlatish (o'qishda chiqmaydi)", 'Заморозить (не показывать)'),
    'generateMore': ('Generate more', "Yana yaratish", 'Сгенерировать ещё'),
    'hideAllGuessOne': ('Hide all, guess one', 'Hammasini yashir, bittasini top', 'Скрыть все, угадать одну'),
    'hideOneGuessOne': ('Hide one, guess one', 'Bittasini yashir, uni top', 'Скрыть одну, угадать её'),
    'imageOcclusion': ('Image occlusion', 'Rasmni yopish', 'Скрытие на фото'),
    'occlusionSub': ('Hide parts of a diagram, map or chart', "Diagramma, xarita yoki chizmaning qismlarini yashirish", 'Скройте части схемы, карты или графика'),
    'occlusionPick': ('Choose an image', 'Rasm tanlang', 'Выберите изображение'),
    'occlusionPickSub': ('Diagram, map, anatomy chart, slide…', 'Diagramma, xarita, anatomiya, slayd…', 'Схема, карта, анатомия, слайд…'),
    'occlusionHelp': ('Drag on the image to cover a label. Tap a mask to select it. Each mask becomes a card.', "Yozuvni yopish uchun rasm ustida suring. Niqobni tanlash uchun bosing. Har bir niqob alohida karta bo'ladi.", 'Проведите по фото, чтобы закрыть подпись. Нажмите на маску, чтобы выбрать. Каждая маска — отдельная карточка.'),
    'occlusionHeader': ('Header (optional)', 'Sarlavha (ixtiyoriy)', 'Заголовок (необязательно)'),
    'occlusionHeaderPh': ('e.g. Parts of the heart', "masalan: Yurak qismlari", 'напр. Части сердца'),
    'imageRequired': ('Choose an image first', 'Avval rasm tanlang', 'Сначала выберите изображение'),
    'masksRequired': ('Draw at least one mask', 'Kamida bitta niqob chizing', 'Нарисуйте хотя бы одну маску'),
    'masksAdded': ('Added {0} masks', "{0} ta niqob qo'shildi", 'Добавлено масок: {0}'),
    'masksCount': ('{0} masks → {0} cards', '{0} ta niqob → {0} ta karta', 'Масок: {0} → карточек: {0}'),
    'noLabelsFound': ('No text labels found — draw masks by hand', "Yozuv topilmadi — niqoblarni qo'lda chizing", 'Подписи не найдены — нарисуйте маски вручную'),
    'importedN': ('Imported {0} cards', '{0} ta karta import qilindi', 'Импортировано карточек: {0}'),
    'presetSummary': ('Steps {0} · {1} new/day · ×{2} · max {3}d', 'Qadamlar {0} · kuniga {1} yangi · ×{2} · maks {3} kun', 'Шаги {0} · {1} новых/день · ×{2} · макс {3} дн.'),
    'presetsIntro': ('Presets tune how fast intervals grow. Each deck can use its own preset (Deck → Edit).', "Presetlar intervallar qanchalik tez o'sishini belgilaydi. Har bir desk o'z presetidan foydalanishi mumkin (Desk → Tahrirlash).", 'Пресеты задают рост интервалов. У каждой колоды может быть свой (Колода → Изменить).'),
    'useCustomByDefault': ('Use Custom for new decks', 'Yangi desklar uchun Shaxsiyni ishlatish', 'Использовать «Свой» для новых колод'),
    'pronunciation': ('Pronunciation', 'Talaffuz', 'Произношение'),
    'ratingsBreakdown': ('Answers', 'Javoblar', 'Ответы'),
    'resetShort': ('Reset', 'Tiklash', 'Сброс'),
    'reverseAll': ('Reverse all cards', 'Barcha kartalarni teskari qilish', 'Перевернуть все карточки'),
    'reverseAllConfirm': ('Swap question and answer on every basic card in this deck?', "Bu deskdagi barcha oddiy kartalarda savol va javob almashtirilsinmi?", 'Поменять вопрос и ответ во всех обычных карточках колоды?'),
    'server': ('Server', 'Server', 'Сервер'),
    'serverUrl': ('Server address', 'Server manzili', 'Адрес сервера'),
    'serverNotSet': ('Not set', "Ko'rsatilmagan", 'Не указан'),
    'serverHint': ('Your Render URL, e.g. https://yodla.onrender.com', "Render manzilingiz, masalan https://yodla.onrender.com", 'Ваш адрес Render, напр. https://yodla.onrender.com'),
    'serverOk': ('Connected ✓', 'Ulandi ✓', 'Подключено ✓'),
    'serverIntro': ('Yodla syncs your decks, progress and images through your own server (Render + Neon).', "Yodla desklar, natijalar va rasmlarni o'zingizning serveringiz (Render + Neon) orqali sinxronlaydi.", 'Yodla синхронизирует колоды, прогресс и фото через ваш сервер (Render + Neon).'),
    'serverChangeWarning': ('Changing the server while signed in: sign out first, then sign in on the new server.', "Kirgan holatda serverni almashtirsangiz: avval chiqing, keyin yangi serverga kiring.", 'Чтобы сменить сервер, сначала выйдите, затем войдите на новом.'),
    'noServer': ('Enter the server address first', 'Avval server manzilini kiriting', 'Сначала укажите адрес сервера'),
    'sessionExpired': ('Your session expired. Please sign in again.', 'Sessiya tugadi. Qayta kiring.', 'Сессия истекла. Войдите снова.'),
    'shortcutsAndroid': ('Hardware keyboard: Space — flip · 1–4 — rate · Z — undo · B — bookmark · D — difficult · S — speak · Esc — exit', "Klaviatura: Space — aylantirish · 1–4 — baho · Z — qaytarish · B — saqlash · D — qiyin · S — o'qish · Esc — chiqish", 'Клавиатура: Пробел — перевернуть · 1–4 — оценка · Z — отмена · B — закладка · D — трудная · S — озвучить · Esc — выход'),
    'signOutConfirm': ('Sign out? Your data stays on the server.', "Chiqasizmi? Ma'lumotlaringiz serverda qoladi.", 'Выйти? Данные останутся на сервере.'),
    'signOutGuestConfirm': ('Sign out of the guest profile? Data on this phone will be deleted.', "Mehmon profildan chiqasizmi? Telefondagi ma'lumotlar o'chadi.", 'Выйти из гостевого профиля? Данные на телефоне будут удалены.'),
    'swipeHint': ('Swipe → Good · ← Again', "Suring → Yaxshi · ← Yana", 'Свайп → Хорошо · ← Снова'),
    'tapToFlip': ('Tap to flip', 'Aylantirish uchun bosing', 'Нажмите, чтобы перевернуть'),
    'typeBasic': ('Basic', 'Oddiy', 'Обычная'),
    'continueGuest': ('Use without an account', 'Hisobsiz foydalanish', 'Без аккаунта'),
}

def conv(s):
    # web placeholders {name} → positional %n$s, in order of first appearance
    names = []
    def rep(m):
        n = m.group(1)
        if n not in names: names.append(n)
        return '%%%d$s' % (names.index(n) + 1)
    if re.search(r'\{(\w+)\}', s) and '{{' not in s:
        s = s.replace('%', '%%')
        s = re.sub(r'\{(\w+)\}', rep, s)
    return s

def conv_new(s):
    if re.search(r'(?<!\{)\{(\d)\}(?!\})', s):
        s = s.replace('%', '%%')
        s = re.sub(r'(?<!\{)\{(\d)\}(?!\})', lambda m: '%%%d$s' % (int(m.group(1)) + 1), s)
    return s

def esc(s):
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace("'", "\\'").replace('"', '\\"').replace('\n', '\\n')
    if s.startswith('@') or s.startswith('?'): s = '\\' + s
    return s

used = sorted(set(re.findall(r'R\.string\.(\w+)', subprocess.check_output(['grep', '-rhoE', r'R\.string\.\w+', os.path.join(HERE, 'app/src/main/java')]).decode())))
missing = []
for li, lang in enumerate(['en', 'uz', 'ru']):
    out = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>']
    for k in ['app_name'] + [u for u in used if u != 'app_name']:
        if k in NEW: v = conv_new(NEW[k][li])
        elif k in web[lang]: v = conv(web[lang][k])
        elif k in web['en']: v = conv(web['en'][k])
        else: missing.append(k); continue
        attr = ' formatted="false"' if '%' in v and not re.search(r'%\d\$s', v) else ''
        if k == 'app_name' and li > 0: continue
        out.append(f'    <string name="{k}"{attr}>{esc(v)}</string>')
    out.append('</resources>')
    d = os.path.join(RES, 'values' if lang == 'en' else f'values-{lang}')
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'strings.xml'), 'w').write('\n'.join(out) + '\n')
if missing: print('MISSING:', sorted(set(missing))); sys.exit(1)
print('ok', len(used))

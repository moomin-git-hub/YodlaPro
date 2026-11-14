import type { PublicDeck } from './types';
import type { Key } from './i18n';

export const CATEGORIES: { id: string; key: Key; emoji: string }[] = [
  { id: 'general', key: 'catGeneral', emoji: '✨' }, { id: 'languages', key: 'catLanguages', emoji: '🗣️' },
  { id: 'science', key: 'catScience', emoji: '🔬' }, { id: 'history', key: 'catHistory', emoji: '🏛️' },
  { id: 'geography', key: 'catGeography', emoji: '🌍' }, { id: 'tech', key: 'catTech', emoji: '💻' },
  { id: 'math', key: 'catMath', emoji: '➗' }, { id: 'business', key: 'catBusiness', emoji: '🏨' },
  { id: 'medicine', key: 'catMedicine', emoji: '🩺' }, { id: 'exam', key: 'catExam', emoji: '🎓' },
  { id: 'arts', key: 'catArts', emoji: '🎨' }, { id: 'other', key: 'catOther', emoji: '📦' },
];
export const catKey = (id: string): Key => CATEGORIES.find((c) => c.id === id)?.key ?? 'catOther';

export const COLORS: Record<string, string> = {
  violet: 'from-violet-500 to-fuchsia-500', blue: 'from-sky-500 to-indigo-500', green: 'from-emerald-500 to-teal-500',
  orange: 'from-amber-400 to-orange-500', pink: 'from-pink-500 to-rose-500', slate: 'from-slate-600 to-slate-800',
  lime: 'from-lime-400 to-emerald-500', red: 'from-red-500 to-orange-500',
};
export const EMOJIS = ['📘', '🧠', '🗣️', '🇬🇧', '🇺🇿', '🇷🇺', '🔬', '🧪', '🌍', '🏛️', '💻', '➗', '🏨', '✈️', '🩺', '🎓', '🎨', '🎵', '⚽', '💡', '📈', '🍳', '🕌', '📜'];

const p = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [front, back, example] = l.split(' | ');
  return { front, back, example };
});

export const PUBLIC_DECKS: PublicDeck[] = [
  {
    id: 'pub-ielts-academic', title: 'IELTS Academic Vocabulary', description: 'High-frequency academic words for IELTS Writing & Reading, with examples.',
    category: 'exam', cover: '🎓', color: 'blue', author: 'Yodla', language: 'en',
    cards: p(`analyse | to examine something in detail to understand it | Researchers analysed the survey data.
    significant | large or important enough to be noticed | There was a significant rise in prices.
    approach | a way of dealing with something | We need a new approach to the problem.
    consequence | a result of an action, often negative | Pollution has serious consequences for health.
    derive | to get something from a source | Many English words are derived from Latin.
    evident | clear and obvious | It was evident that the plan had failed.
    factor | one of the things that cause a result | Cost is a key factor in the decision.
    interpret | to explain the meaning of something | The graph can be interpreted in two ways.
    principle | a basic idea or rule | The principle of equality is central to law.
    sufficient | enough for a purpose | There is sufficient evidence to support the claim.
    fluctuate | to change frequently in level or amount | Oil prices fluctuated throughout the year.
    substantial | large in size, value or importance | The company made a substantial profit.
    advocate | to publicly support an idea | Many experts advocate a shorter working week.
    mitigate | to make something less harmful | Trees help mitigate the effects of heat.
    detrimental | causing harm or damage | Smoking is detrimental to health.
    plummet | to fall suddenly and steeply | Sales plummeted after the scandal.`),
  },
  {
    id: 'pub-uz-en-basics', title: "English ↔ O'zbek: Everyday Phrases", description: "Kundalik muloqot uchun eng kerakli iboralar.",
    category: 'languages', cover: '🇺🇿', color: 'green', author: 'Yodla', language: 'uz',
    cards: p(`Hello! How are you? | Salom! Qalaysiz?
    Thank you very much | Katta rahmat
    Nice to meet you | Tanishganimdan xursandman
    Where is the bus stop? | Avtobus bekati qayerda?
    How much does it cost? | Bu qancha turadi?
    I don't understand | Tushunmayapman
    Could you speak slowly, please? | Iltimos, sekinroq gapira olasizmi?
    What time is it? | Soat necha bo'ldi?
    I'm hungry | Qornim och
    Excuse me | Kechirasiz
    See you tomorrow | Ertaga ko'rishguncha
    Can you help me? | Menga yordam bera olasizmi?
    I'm from Uzbekistan | Men O'zbekistondanman
    The bill, please | Hisobni olib keling, iltimos
    Good luck! | Omad!`),
  },
  {
    id: 'pub-ru-basics', title: 'Русский язык: базовые фразы', description: 'Essential Russian phrases with English meanings.',
    category: 'languages', cover: '🇷🇺', color: 'red', author: 'Yodla', language: 'ru',
    cards: p(`Здравствуйте | Hello (formal) | Здравствуйте, меня зовут Анна.
    Спасибо | Thank you | Спасибо за помощь!
    Пожалуйста | Please / You're welcome | Дайте, пожалуйста, воду.
    Извините | Excuse me / Sorry | Извините, где метро?
    Сколько стоит? | How much is it? | Сколько стоит этот билет?
    Я не понимаю | I don't understand | Извините, я не понимаю.
    Где находится…? | Where is…? | Где находится вокзал?
    Мне нужно… | I need… | Мне нужно такси.
    Который час? | What time is it? | Простите, который час?
    До свидания | Goodbye | До свидания, до завтра!
    Я хочу | I want | Я хочу кофе.
    Говорите медленнее | Speak more slowly | Говорите медленнее, пожалуйста.
    Счёт, пожалуйста | The bill, please | Официант, счёт, пожалуйста.
    Приятного аппетита | Enjoy your meal | Приятного аппетита!`),
  },
  {
    id: 'pub-capitals', title: 'World Capitals', description: 'Capitals of countries from every continent.',
    category: 'geography', cover: '🌍', color: 'orange', author: 'Yodla', language: 'en',
    cards: p(`Uzbekistan | Tashkent
    Kazakhstan | Astana
    Kyrgyzstan | Bishkek
    Tajikistan | Dushanbe
    Turkmenistan | Ashgabat
    Turkey | Ankara
    Japan | Tokyo
    South Korea | Seoul
    Australia | Canberra
    Canada | Ottawa
    Brazil | Brasília
    Argentina | Buenos Aires
    Egypt | Cairo
    Nigeria | Abuja
    Kenya | Nairobi
    Switzerland | Bern
    Germany | Berlin
    Italy | Rome
    Spain | Madrid
    India | New Delhi`),
  },
  {
    id: 'pub-hospitality', title: 'Tourism & Hospitality Terms', description: 'Front office, F&B and travel industry vocabulary.',
    category: 'business', cover: '🏨', color: 'pink', author: 'Yodla', language: 'en',
    cards: p(`ADR (Average Daily Rate) | Room revenue divided by the number of rooms sold | ADR rose to $120 in July.
    RevPAR | Revenue per available room = ADR × occupancy rate | Higher occupancy increased RevPAR.
    Occupancy rate | Rooms sold ÷ rooms available, as a percentage | The hotel ran at 85% occupancy.
    Overbooking | Accepting more reservations than available rooms to offset no-shows | Overbooking must be managed carefully.
    No-show | A guest with a reservation who does not arrive | No-shows are charged one night.
    Walk-in | A guest who arrives without a reservation | We had three walk-ins tonight.
    Concierge | Staff who assist guests with bookings, tours and information | Ask the concierge for theatre tickets.
    Housekeeping | Department responsible for cleaning rooms and public areas | Housekeeping starts at 9 a.m.
    F&B | Food and Beverage department | F&B revenue includes banquets.
    Upselling | Encouraging guests to buy a higher-priced option | The receptionist upsold a suite.
    Rack rate | The standard, undiscounted price of a room | Corporate clients get 20% off the rack rate.
    Inbound tourism | Visitors from abroad travelling into a country | Inbound tourism to Uzbekistan is growing.
    MICE | Meetings, Incentives, Conferences and Exhibitions tourism | Tashkent is developing MICE facilities.
    Check-out time | The time by which guests must vacate their room | Check-out time is 12:00.`),
  },
  {
    id: 'pub-elements', title: 'Periodic Table: First 20 Elements', description: 'Symbols and atomic numbers of the first 20 elements.',
    category: 'science', cover: '🧪', color: 'lime', author: 'Yodla', language: 'en',
    cards: p(`H | Hydrogen (1)
    He | Helium (2)
    Li | Lithium (3)
    Be | Beryllium (4)
    B | Boron (5)
    C | Carbon (6)
    N | Nitrogen (7)
    O | Oxygen (8)
    F | Fluorine (9)
    Ne | Neon (10)
    Na | Sodium (11)
    Mg | Magnesium (12)
    Al | Aluminium (13)
    Si | Silicon (14)
    P | Phosphorus (15)
    S | Sulfur (16)
    Cl | Chlorine (17)
    Ar | Argon (18)
    K | Potassium (19)
    Ca | Calcium (20)`),
  },
  {
    id: 'pub-js', title: 'JavaScript Fundamentals', description: 'Core concepts every web developer should know.',
    category: 'tech', cover: '💻', color: 'slate', author: 'Yodla', language: 'en',
    cards: p(`What is a closure? | A function that remembers variables from the scope where it was created | function counter(){ let n=0; return () => ++n }
    let vs const | let can be reassigned; const cannot (but objects it holds can still be mutated) | const a = [1]; a.push(2) // ok
    === vs == | === compares without type coercion; == converts types first | 0 == '0' // true, 0 === '0' // false
    What does async/await do? | Lets you write promise-based code that reads like synchronous code | const data = await fetch(url)
    What is the event loop? | The mechanism that runs queued callbacks when the call stack is empty
    Array.map() | Returns a new array with a function applied to each element | [1,2].map(x => x*2) // [2,4]
    Array.filter() | Returns a new array with elements that pass a test | [1,2,3].filter(x => x>1)
    What is hoisting? | Declarations are moved to the top of their scope before execution
    Spread operator | ... expands an iterable into individual elements | const b = [...a, 4]
    Destructuring | Unpacking values from arrays or properties from objects | const { name } = user
    What is a Promise? | An object representing the eventual result of an async operation
    typeof null | 'object' — a long-standing quirk of the language`),
  },
  {
    id: 'pub-body', title: 'Human Body Systems', description: 'Main organ systems and their functions.',
    category: 'medicine', cover: '🩺', color: 'violet', author: 'Yodla', language: 'en',
    cards: p(`Circulatory system | Moves blood, oxygen and nutrients around the body (heart, blood vessels)
    Respiratory system | Exchanges oxygen and carbon dioxide (lungs, trachea)
    Digestive system | Breaks down food and absorbs nutrients (stomach, intestines, liver)
    Nervous system | Controls the body and processes information (brain, spinal cord, nerves)
    Skeletal system | Supports the body, protects organs, makes blood cells (206 bones in adults)
    Muscular system | Enables movement and maintains posture
    Endocrine system | Produces hormones that regulate the body (thyroid, pancreas, adrenal glands)
    Immune system | Defends against infection (white blood cells, lymph nodes)
    Urinary system | Filters blood and removes waste as urine (kidneys, bladder)
    Integumentary system | Skin, hair and nails — protection and temperature control
    Largest organ of the human body | The skin
    Normal resting heart rate (adult) | About 60–100 beats per minute`),
  },
  {
    id: 'pub-history', title: 'Key Dates in World History', description: 'Turning points from antiquity to the modern era.',
    category: 'history', cover: '📜', color: 'orange', author: 'Yodla', language: 'en',
    cards: p(`Fall of the Western Roman Empire | 476 AD
    Amir Temur founds the Timurid Empire | 1370
    Ulugh Beg's observatory built in Samarkand | 1420s
    Fall of Constantinople | 1453
    Columbus reaches the Americas | 1492
    Start of the French Revolution | 1789
    Start of World War I | 1914
    End of World War II | 1945
    First human in space (Yuri Gagarin) | 1961
    Moon landing (Apollo 11) | 1969
    Fall of the Berlin Wall | 1989
    Independence of Uzbekistan | 1 September 1991`),
  },
];

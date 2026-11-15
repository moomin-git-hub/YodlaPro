-- Yodla schema for Neon Postgres. Idempotent: runs on every server start.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists password_resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false
);

create table if not exists categories (id text primary key, emoji text not null default '', sort int not null default 0);
insert into categories (id, emoji, sort) values
  ('general','✨',0),('languages','🗣️',1),('science','🔬',2),('history','🏛️',3),('geography','🌍',4),('tech','💻',5),
  ('math','➗',6),('business','🏨',7),('medicine','🩺',8),('exam','🎓',9),('arts','🎨',10),('other','📦',11)
on conflict (id) do nothing;

create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists folders (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists decks (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  category text not null default 'general' references categories(id),
  folder_id uuid references folders(id) on delete set null,
  cover text not null default '📘',
  color text not null default 'violet',
  image text not null default '',
  source_public_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decks_user_idx on decks(user_id);

create table if not exists flashcards (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  deck_id uuid not null references decks(id) on delete cascade,
  front text not null,
  back text not null,
  example text not null default '',
  explanation text not null default '',
  image text not null default '',
  difficult boolean not null default false,
  bookmarked boolean not null default false,
  reps int not null default 0,
  lapses int not null default 0,
  ease real not null default 2.5,
  "interval" real not null default 0,
  due timestamptz not null default now(),
  last_review timestamptz,
  status text not null default 'new' check (status in ('new','learning','review','relearning')),
  step int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_user_due_idx on flashcards(user_id, due);
create index if not exists flashcards_deck_idx on flashcards(deck_id);

create table if not exists review_logs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  card_id uuid not null,
  deck_id uuid not null,
  rating smallint not null check (rating between 1 and 4),
  ts timestamptz not null default now(),
  duration_ms int not null default 0,
  prev_status text not null,
  prev_interval real not null,
  new_interval real not null
);
create index if not exists review_logs_user_ts_idx on review_logs(user_id, ts);

create table if not exists study_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  deck_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms int not null,
  cards_reviewed int not null,
  correct int not null
);
create index if not exists study_sessions_user_idx on study_sessions(user_id, started_at);

create table if not exists public_decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  category text not null default 'general' references categories(id),
  cover text not null default '📘',
  color text not null default 'violet',
  author text not null default '',
  language text not null default '',
  card_count int not null default 0,
  saves int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public_deck_cards (
  id uuid primary key default gen_random_uuid(),
  public_deck_id uuid not null references public_decks(id) on delete cascade,
  position int not null default 0,
  front text not null, back text not null,
  example text not null default '', explanation text not null default ''
);
create index if not exists public_deck_cards_deck_idx on public_deck_cards(public_deck_id, position);

create table if not exists saved_public_decks (
  user_id uuid not null references users(id) on delete cascade,
  public_deck_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, public_deck_id)
);

-- metadata for every file stored in Neon Object Storage
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  key text not null unique,
  kind text not null check (kind in ('image','upload')),
  name text not null default '',
  mime text not null default '',
  size int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists files_user_idx on files(user_id);

-- v2 (Android app): card types, image occlusion, freeze, archive, presets, card styles, folder look
alter table flashcards add column if not exists card_type text not null default 'basic';
alter table flashcards add column if not exists note_id uuid;
alter table flashcards add column if not exists extra text not null default '';
alter table flashcards add column if not exists frozen boolean not null default false;
alter table decks add column if not exists archived boolean not null default false;
alter table decks add column if not exists preset text not null default 'standard';
alter table decks add column if not exists style text not null default '';
alter table decks add column if not exists tts_front text not null default '';
alter table decks add column if not exists tts_back text not null default '';
alter table decks add column if not exists sort_order int not null default 0;
alter table folders add column if not exists color text not null default 'violet';
alter table folders add column if not exists emoji text not null default '📁';

-- v3: subdecks
alter table decks add column if not exists parent_id uuid;
create index if not exists decks_parent_idx on decks(parent_id);

-- v4: learning algorithm (FSRS / SM-2 / fast review), memory state, offline decks
alter table decks add column if not exists algorithm text not null default 'fsrs';
alter table decks add column if not exists offline boolean not null default false;
alter table flashcards add column if not exists stability real not null default 0;
alter table flashcards add column if not exists difficulty real not null default 0;

-- v5: Telegram bot (@yodlaPro_bot): linked chats, link codes, bot preferences and state
create table if not exists telegram_links (
  user_id uuid primary key references users(id) on delete cascade,
  chat_id bigint not null unique,
  tg_name text not null default '',
  prefs jsonb not null default '{}'::jsonb,   -- reminders, streakSaver, weeklyReport, leaderboard, goal, deckId
  state jsonb not null default '{}'::jsonb,   -- pending AI cards, sent-notification marks
  created_at timestamptz not null default now()
);
create table if not exists telegram_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

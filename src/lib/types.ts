export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  example: string;
  explanation: string;
  image: string; // URL or data URL
  difficult: boolean; // manually marked
  bookmarked: boolean;
  // SRS
  reps: number;
  lapses: number;
  ease: number;
  interval: number; // days
  due: number; // epoch ms
  lastReview: number | null;
  status: CardStatus;
  step: number;
  createdAt: number;
  updatedAt: number;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  category: string;
  folderId: string | null;
  cover: string; // emoji
  color: string; // gradient key
  image: string;
  sourcePublicId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Folder { id: string; name: string; createdAt: number; updatedAt: number }

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: Rating;
  ts: number;
  durationMs: number;
  prevStatus: CardStatus;
  prevInterval: number;
  newInterval: number;
}

export interface StudySession {
  id: string;
  deckId: string | null;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  cardsReviewed: number;
  correct: number;
}

export type Lang = 'en' | 'uz' | 'ru';
export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  dailyGoal: number;
  newPerDay: number;
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM
  lang: Lang;
  theme: Theme;
  shuffle: boolean;
  tts: boolean;
  onboarded: boolean;
  updatedAt: number;
}

export interface UserData {
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  sessions: StudySession[];
  folders: Folder[];
  savedPublic: string[];
  settings: Settings;
}

export interface PublicDeck {
  id: string;
  title: string;
  description: string;
  category: string;
  cover: string;
  color: string;
  author: string;
  language: string;
  saves?: number;
  cards: { front: string; back: string; example?: string; explanation?: string }[];
  cardCount?: number;
}

export interface DraftCard { front: string; back: string; example?: string; explanation?: string }

# Yodla — flashcards with spaced repetition & AI

Mobile-first learning app (React + TypeScript + Tailwind; Node/Express API on Render, Neon Postgres + Neon Object Storage) inspired by Noji. Original branding and code.

## Features
- Decks (title, description, cover emoji/colour/image, category, folders), unlimited
- Flashcards: question, answer, example, explanation, image; edit, delete, move, reset, search, bookmark, mark difficult
- Study: flip card → rate **Again / Hard / Good / Easy**, interval preview on each button, undo, shuffle, practice mode, text-to-speech
- SM-2–inspired scheduler with learning/relearning steps (`src/lib/srs.ts`) — stores reps, ease, interval, due, last review, status
- Smart collections: Difficult cards (manual mark, ≥3 lapses or low ease) and Bookmarks
- AI generator: topic / pasted text / .txt-.md notes / PDF (parsed in-browser), choose card count & language, edit before saving. Offline **Quick extract** works without AI
- Import CSV/TSV/Anki plain text/JSON; export deck CSV/JSON; full backup + restore
- Explore: built-in public decks + community decks (cloud), search, category filter, save, add to library, publish your own
- Home dashboard and Statistics from real review logs: goal ring, due, learned, streak, time, 7/30-day charts, 12-week heatmap, accuracy, forecast, per-deck progress
- Auth: sign up, login, logout, password reset (email link via SMTP), change password, profile; bcrypt + JWT
- Daily reminder (browser notification + .ics calendar event), goals, light/dark/system theme, EN / UZ / RU
- Offline-first (IndexedDB + service worker + sync queue), keyboard shortcuts on desktop

## Architecture
```
Browser (React PWA, offline-first IndexedDB + sync queue)
   │  HTTPS / JSON + JWT
   ▼
Render web service — server/ (Node + Express)
   ├─ Neon Postgres ........ users, decks, flashcards, review_logs, study_sessions, settings, public decks, files
   └─ Neon Object Storage .. images (users/<id>/images/…) and uploaded PDFs/notes (users/<id>/uploads/…)
```
Every query is scoped to the user id from the JWT; cards can only be attached to the user's own decks.
Images are uploaded to the bucket and served through `/api/files/<uuid>` (redirect to a short-lived presigned URL), so the bucket stays private.

## Run locally
```bash
npm install && npm install --prefix server
cp server/.env.example server/.env      # fill DATABASE_URL, JWT_SECRET, AWS_* …
npm run dev:server                       # API on :3000 (tables are created automatically)
VITE_API_URL=http://localhost:3000 npm run dev
```
Without `VITE_API_URL` the app runs in **local mode** (no server, data on the device).

## Deploy: Neon + Render
1. **Neon** — create a project (region aws-us-east-1/2, eu-central-1 or ap-southeast-1 for Object Storage). Copy the *pooled* connection string.
2. **Neon Object Storage** — in the project → branch → *Object storage*: create a bucket `yodla` (private) and a storage credential. Note the branch S3 endpoint, Access Key ID and Secret.
3. Push this folder to GitHub.
4. **Render** → New → *Blueprint* → pick the repo (uses `render.yaml`). Fill `DATABASE_URL`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `APP_URL` (your `https://….onrender.com`). `JWT_SECRET` is generated.
5. Optional: `AI_PROVIDER` + `AI_API_KEY` to unlock the AI generator; `SMTP_*` for password-reset emails.
6. Open `https://<service>.onrender.com/api/health` → `{"ok":true,"storage":true,"ai":…}`.

The schema in `server/src/schema.sql` is applied automatically on every start (idempotent).
Free Render instances sleep after inactivity; the first request then takes ~30–60 s. The app keeps working offline meanwhile and syncs later.

**Android:** open the site in Chrome → ⋮ → *Install app*, or wrap `dist/` with Capacitor for the Play Store.

## Structure
```
src/lib/      srs.ts (scheduler) · store.ts (state, IndexedDB, sync queue) · api.ts · auth.ts · ai.ts · stats.ts · i18n.ts · catalog.ts
src/pages/    Home, Decks, DeckDetail, DeckEditor, CardEditor, Study, Explore, Create, AiGenerator, Import, Stats, Profile, Search, Auth, Onboarding
src/components/ ui.tsx (design system), Layout.tsx
server/       Express API: auth, sync, files (Neon Object Storage), ai, public decks · schema.sql
render.yaml   Render blueprint
```

## Shortcuts
Space flip · 1–4 rate · Z undo · B bookmark · D difficult · S speak · Esc exit · / search · N new card

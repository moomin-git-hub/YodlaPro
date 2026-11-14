# Yodla — Android (Kotlin, Jetpack Compose)

Native Android client for the Yodla server (Render + Neon). Works fully offline; syncs when online.

## Stack
Kotlin 2.0 · Jetpack Compose (Material 3) · Room · DataStore · WorkManager · OkHttp · kotlinx.serialization · Coil · ML Kit text recognition (on-device) · PdfBox-Android · KaTeX (bundled) · native TextToSpeech.
minSdk 24 (Android 7.0) · targetSdk 35.

## Features
- Decks: folders (name/emoji/colour), categories, cover emoji/colour/image, archive, duplicate, sort, per-deck **learning preset**, **card style** (background, font, size), per-deck TTS voices
- Cards: **Basic**, **Fill-in-the-blank** (`{{c1::word}}` → one card per blank), **Image occlusion** (draw masks, *AI auto-detect labels* with ML Kit, hide-all/hide-one modes, one card per mask)
- Rich content: **bold**, *italic*, `code`, fenced code blocks with syntax colours, links, **LaTeX** (`$…$`, `$$…$$`)
- Bulk actions: move, freeze/unfreeze, reverse, reset progress, delete; reverse whole deck; duplicate-question warning; per-card learning history
- Study: 3D flip, swipe (→ Good, ← Again), Again/Hard/Good/Easy with interval preview, undo, practice mode, shuffle, TTS (auto-play option), hardware-keyboard shortcuts
- Spaced repetition: SM-2–style with learning/relearning steps; presets *Standard, Study languages, Medical material, Exam cram* + fully custom (steps, easy bonus, interval modifier, max interval, new/day, max reviews/day); sibling burying
- AI generator (server): topic / pasted text / PDF or notes, count, language, format (Q&A, fill-in-the-blank, both), detail level, custom instructions, “generate more”, edit & select before saving. Offline *Quick extract* without AI
- Explore: built-in + community decks, categories, search, save, add to library, publish your deck
- Import CSV/TSV/Anki text/JSON · export deck CSV/JSON · full backup/restore (compatible with the web app)
- Stats: totals, accuracy, streak/best streak, time, 7/30-day chart, 12-week heatmap, answer breakdown, 7-day forecast, per-deck progress
- Accounts on your server (sign up, sign in, forgot password e-mail, change password, delete account) or guest mode; guest data is uploaded when you connect an account
- Daily reminder notification, light/dark/system theme, English / O‘zbek / Русский (per-app language)

## Server address
Either type it in the app (sign-in screen → **Server**, or Profile → Server), or bake a default into the build:
```bash
./gradlew assembleRelease bundleRelease -Pyodla.serverUrl=https://your-service.onrender.com
```

## Build
```bash
cd android
./gradlew assembleRelease     # app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease       # app/build/outputs/bundle/release/app-release.aab  (upload this to Google Play)
./gradlew testDebugUnitTest   # unit + Robolectric tests (SyncTest runs against a local server on :3001 if present)
./gradlew testDebugUnitTest -Proborazzi.test.record=true   # regenerate screenshots/
```
Requires JDK 17+ and the Android SDK (set `sdk.dir` in `local.properties`).

## Signing — keep these safe
Release builds are signed with `yodla-release.jks` using the passwords in `keystore.properties` (both git-ignored, delivered separately).
**Every future update on Google Play must be signed with the same key.** Back them up. For Play, enable *Play App Signing* and upload the `.aab`.

## Play Store checklist
- 512×512 icon: `playstore-icon-512.png` · screenshots: `screenshots/`
- Privacy policy URL (the app stores e-mail, decks and study history on your server)
- Data-safety form: e-mail, user content (cards, images), app activity (study history); data encrypted in transit (HTTPS); users can delete their account in-app

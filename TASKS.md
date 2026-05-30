# Framewise — Work Summary & Review Guide

Last updated: 2026-05-24

---

## What Has Been Built

### Backend

| Area | Status | Notes |
|---|---|---|
| Express server + CORS | ✅ Done | Dev: open; Prod: requires `ALLOWED_ORIGINS` |
| MongoDB models | ✅ Done | User, Video, Segment, ChatMessage, Caption, Note, Bookmark, Collection |
| JWT auth (register / login / me / delete) | ✅ Done | Account delete cascades all user data |
| Google OAuth | ✅ Done | Requires matching client IDs in both `.env` files |
| Gemini video analysis | ✅ Done | Async job queue, progress polling, retry/backoff |
| Gemini chat | ✅ Done | Context: transcript + segments + history + current time + mode |
| Gemini dance analysis | ✅ Done | Returns choreography segments with body cues |
| Gemini quiz generation | ✅ Done | Gemini watches the actual video, not just transcript |
| Gemini caption correction + translation | ✅ Done | Chains after YouTube transcript or ElevenLabs STT |
| Gemini AI notes | ✅ Done | Generated from full video transcript |
| ElevenLabs TTS | ✅ Done | Narrator + Coach voice presets |
| ElevenLabs STT (audio captions) | ✅ Done | yt-dlp audio download → ElevenLabs transcription |
| YouTube transcript captions | ✅ Done | Precise timestamps fetched from YouTube |
| Caption translation | ✅ Done | Any target language via Gemini |
| Async job queue | ✅ Done | In-memory, no Redis; analyze runs async, dance/captions still sync |
| Per-user rate limiter | ✅ Done | 15 req/min on AI routes |
| Global Gemini RPM gate | ✅ Done | Default 14 RPM, configurable via `GEMINI_RPM` |
| Gemini retry + backoff | ✅ Done | Retries 429, 503, and network-level fetch errors |
| Request timeouts | ✅ Done | 180s analyze, 120s dance, 300s STT, 180s correct |
| ObjectId validation middleware | ✅ Done | All parameterised routes protected |
| Bookmarks (create / rename) | ✅ Done | |
| Notes (create / AI generate) | ✅ Done | |
| Collections (create / rename / add / remove video) | ✅ Done | |
| Continue watching (progress) | ✅ Done | Restored on next open |
| Adaptive mode fields | ✅ Done | `detectedMode`, `modeOverride`, `modeConfidence`, `modeSignals` |
| Weighted text search index | ✅ Done | title × 8, segmentSearchText × 5, transcript × 1 |

---

### Web App (Frontend)

| Area | Status | Notes |
|---|---|---|
| React Router setup (public + protected routes) | ✅ Done | |
| LandingPage with auth-aware nav | ✅ Done | Shows user chip + sign-out when logged in |
| LoginPage (email + Google OAuth) | ✅ Done | |
| Dashboard analyze flow with job polling + progress bar | ✅ Done | Rotating status messages while Gemini works |
| LibraryPage with search + collection filter | ✅ Done | Skeleton loading states |
| VideoPage — timeline, seek, segments | ✅ Done | |
| VideoPage — chat with voice toggle | ✅ Done | |
| VideoPage — notes + AI notes | ✅ Done | |
| VideoPage — bookmarks | ✅ Done | |
| VideoPage — quiz | ✅ Done | |
| VideoPage — captions + translation + download | ✅ Done | |
| VideoPage — Practice tab dancer skeleton | ✅ Done | MULTIPOSE_LIGHTNING via `getDisplayMedia`; overlaid on player canvas |
| VideoPage — multi-person tracking + person picker | ✅ Done | Auto-selects most-centered; `Auto / 1 / 2 / 3` picker; number labels above each person |
| VideoPage — Framewise fullscreen | ✅ Done | ⊞ button calls `requestFullscreen()` on `.vp-player` wrapper; YouTube fullscreen intercepted |
| VideoPage — practice tab + webcam pose tracking | ✅ Done | Full-screen DancePracticeWorkspace overlay |
| Dance Practice Workspace (full-screen) | ✅ Done | |
| Dance Practice — "Now Practicing" cue bar | ✅ Done | Shows active segment title, bodyPosition tag, movementCue during session |
| Dance Practice — session tracking | ✅ Done | Records segments visited, loop count, speeds used |
| Dance Practice — post-session stats card | ✅ Done | Body visibility %, avg joints, sections count; colour-coded |
| Dance Practice — honest coach commentary | ✅ Done | Prompt includes real tracking quality, sections, speeds, loops; coach instructed to be specific |
| MoveNet webcam skeleton (sage bones + rust joints) | ✅ Done | |
| Dancer skeleton via screen capture (orange) | ✅ Done | `getDisplayMedia` + crop to player bounds |
| Independent Mirror Me / Mirror Video controls | ✅ Done | |
| Loop + speed presets (0.5× – 2×) | ✅ Done | |
| AI coach TTS after session | ✅ Done | |
| Adaptive mode override UI | ✅ Done | Auto / Study Queue / Dance Practice |
| Continue watching restore | ✅ Done | |
| Collection management (rename, delete, remove) | ✅ Done | |
| SettingsPage (profile, preferences, theme, API health) | ✅ Done | |
| ExtensionPage setup guide | ✅ Done | Public route `/extension`, no auth required |
| Dark / light theme with `--fw-*` design tokens | ✅ Done | Warm "Screening Room" palette |
| Toast notifications | ✅ Done | |
| Skeleton loading states | ✅ Done | Library cards, video segments |

---

### Chrome Extension

| Area | Status | Notes |
|---|---|---|
| Manifest V3 side panel | ✅ Done | |
| Service worker — YouTube detection | ✅ Done | Fires on tab activate, URL change, navigation events |
| Instant video detection on panel open | ✅ Done | Reads `chrome.storage.session`; falls back to active-tab query — no reload needed |
| Video thumbnail in strip | ✅ Done | Fetched from `img.youtube.com/vi/{id}/mqdefault.jpg` |
| No-video empty state | ✅ Done | App icon + "Open YouTube" button when no watch page is active |
| Title-based mode detection | ✅ Done | Classifies dance / study / general from title regex; no API call |
| Content script — seek bar markers | ✅ Done | Rust-orange dots on YouTube progress bar |
| Content script — caption overlay (RAF loop) | ✅ Done | Hides native YouTube captions, renders own overlay |
| Extension auth — reads token from web app tab | ✅ Done | Falls back to `chrome.storage.local` |
| Auto-load saved timeline | ✅ Done | Background worker calls `/videos/lookup` |
| Timeline tab — search, active highlight, scroll | ✅ Done | |
| Timeline tab — speed controls | ✅ Done | 0.5× – 2× |
| Timeline tab — copy timestamp link | ✅ Done | `&t=` URL to clipboard |
| Captions tab — generate, inject, translate | ✅ Done | |
| Chat as accordion section | ✅ Done | Replaced persistent bottom dock; min-height 320px when open |
| Chat chips — adaptive per mode | ✅ Done | Dance: Learn moves / Break down / Dance style / Key sections; Study: Summarize / Key concepts / Quiz me / Explain |
| Voice toggle with SVG icons | ✅ Done | Proper SVG on/off icons; no emoji |
| Voice style select in header | ✅ Done | Compact select only shown when voice is on |
| Practice tab — live webcam pose tracking | ✅ Done | WASM backend, non-threaded SIMD, 10 FPS, sage bones + rust joints |
| Practice tab — auto pose snaps at segment transitions | ✅ Done | 2 s delay, 8 s cooldown, quality review cards |
| Quick actions — bookmark + note at timestamp | ✅ Done | Syncs to backend |
| Quick actions — Open in Framewise deep link | ✅ Done | |
| Adaptive section order (dance vs study) | ✅ Done | Dance: Practice first; Study: Timeline first |
| Dark / light theme toggle | ✅ Done | |
| TF.js bundled locally (MV3 CSP compliant) | ✅ Done | No CDN, no eval; WASM backend with local binaries |
| WASM multithread disabled | ✅ Done | `tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false)` — prevents blob: Worker CSP error |
| Extension setup guide page on web app | ✅ Done | |

---

## Areas to Review / Improve

### High Priority

| Area | What to look at |
|---|---|
| **Dance / captions / STT still synchronous** | These three AI operations run inside the request cycle. For long videos they time out or block. Move them into the job queue the same way analyze was moved — return `{ jobId }`, poll from the frontend. |
| **Extension production config** | `extension/src/config.js` is hardcoded to `localhost`. Before any public deployment, update `FW_API` and `FW_APP` to the production URLs and rebuild `dist/content.js`. |
| **Google OAuth redirect URI** | Currently only `http://localhost:5174` is registered. Production deployment needs the production origin added to Google Cloud Console. |
| **MongoDB `autoIndex` in production** | `autoIndex` is disabled by default in production Mongoose configs. The weighted text search index must be created manually before the app can search. Command is in the README. |

---

### Medium Priority

| Area | What to look at |
|---|---|
| **Component extraction** | `VideoPage.jsx` is large — all panels (timeline, chat, captions, notes, bookmarks, quiz, dance) live in one file. Each could be its own component under `frontend/src/components/`. |
| **Dancer tracking — tab share only** | `getDisplayMedia` crop coordinates assume the user shares the browser tab, not the full screen. If the user shares the whole screen, the crop is offset because `getBoundingClientRect()` is viewport-relative. Detect capture dimensions vs. `window.innerWidth` to warn the user. |
| **YouTube fullscreen intercept reliability** | The automatic `exitFullscreen → requestFullscreen` chain in the `fullscreenchange` handler may be blocked on some browsers as a non-user-gesture. Fallback: the manual **⊞** button always works. |
| **Gemini mode classifier** | `detectedMode` is set by a keyword heuristic. A Gemini-powered classifier using actual video content would be more accurate. |
| **Extension voice preference sync** | Voice on/off and voice profile are stored only in extension `localStorage`. Not synced to the user's backend profile. |
| **Rate limiter feedback in UI** | When the per-user rate limit is hit, the frontend gets a 429 but shows a generic error. A "Too many requests — wait a moment" message would help. |

---

### Low Priority / Future Work

| Area | Notes |
|---|---|
| Automated test coverage | No tests exist yet. Priority order: auth controller → video ownership → search → bookmarks → collections. |
| File/upload support | Only YouTube URLs work. Gemini Files API + file upload endpoint would extend to local video files. |
| Flashcards & spaced repetition | Notes are generated but there is no flashcard or review system. |
| Study packs export | No way to export notes, bookmarks, and quiz questions as a study pack yet. |
| Adaptive recommendations | Mode is detected but there are no recommendations ("watch this next", "practice this segment more"). |
| Chrome Web Store submission | Icons, description, privacy policy URL, store screenshots, and a production config build are all needed before submission. |
| Multi-site support | Only YouTube is supported. Vimeo, Coursera, Udemy would require new content script matchers and player adapters. |
| Caption timing calibration | No offset slider if captions drift (e.g. videos with a long intro card). |
| Command palette | No keyboard shortcut layer or search palette on the web app. |
| Dancer accuracy comparison | Pose tracking runs on both webcam and video but no joint-level comparison is computed. A similarity score (e.g. cosine similarity of normalised limb angles) would make the session stats more meaningful. |

---

## Running the Project

```bash
npm run install:all     # install all three workspaces
npm run dev             # starts backend :3001 + frontend :5174
```

Extension: load `extension/` folder unpacked in Chrome (see README for full steps).

## Quick Smoke Test

- [ ] Register → log in → user chip appears in landing nav with sign-out
- [ ] Analyze a YouTube URL → progress bar → timeline appears
- [ ] Click segment → player seeks
- [ ] Chat → timestamped answer → voice reply works
- [ ] Generate captions → translate → download `.srt`
- [ ] Generate quiz → answer questions
- [ ] Open Practice tab on a dance video → Start Pose Tracking → share tab → orange skeleton on dancer
- [ ] Multi-person video: person labels appear, picker selects correctly
- [ ] ⊞ button → Framewise fullscreen → skeleton still visible
- [ ] Open Practice Mode → webcam skeleton (sage + rust) appears
- [ ] Mirror Me and Mirror Video work independently
- [ ] End Practice session → stats card shows body visibility % → coach audio plays
- [ ] Extension loads without CSP errors
- [ ] Extension opens on a YouTube video — thumbnail + title appear immediately, no reload needed
- [ ] Extension auto-loads saved timeline
- [ ] Extension chat responds with mode-appropriate chips
- [ ] Extension Practice tab → webcam → pose snaps appear
- [ ] Light and dark theme work on both surfaces

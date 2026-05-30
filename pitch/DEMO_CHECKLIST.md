# Framewise Demo Checklist

## Before Demo

- [ ] Backend `.env` has MongoDB, Gemini, ElevenLabs, Google OAuth, JWT
- [ ] Frontend `.env` has `VITE_GOOGLE_CLIENT_ID`
- [ ] `npm run dev` starts backend and frontend
- [ ] Frontend opens at `http://localhost:5174`
- [ ] Backend health works at `http://localhost:3001/api/health`
- [ ] Chrome extension loaded from `extension/`
- [ ] Signed into Framewise web app
- [ ] Test YouTube video chosen

## Recommended Demo Video Types

Pick one short video, ideally 3-8 minutes:

- Educational explainer
- Coding/tutorial clip
- Dance/practice clip
- Lecture segment

Avoid:

- Very long videos
- Age-restricted videos
- Private/unavailable videos
- Videos with copyrighted/prohibited content likely to block AI processing

## Demo Flow

- [ ] Open Library
- [ ] Show search, folder filters, and continue watching state
- [ ] Paste YouTube URL
- [ ] Analyze video
- [ ] Show generated topic timeline
- [ ] Click a timeline timestamp
- [ ] Ask chat: “Where does it explain the main idea?”
- [ ] Show timestamped answer
- [ ] Add bookmark
- [ ] Add note
- [ ] Generate quiz
- [ ] Generate captions
- [ ] Show captions following the video playback timing
- [ ] Toggle light/dark theme if useful
- [ ] Open same video on YouTube
- [ ] Open extension side panel
- [ ] Show timeline auto-load
- [ ] Show caption injection
- [ ] Return to web app and show progress/bookmark persistence

## Sponsor Proof Points

- [ ] Gemini: point to the generated segments, chat answer, and quiz
- [ ] MongoDB: point to saved videos, bookmarks, collections, captions, and progress
- [ ] ElevenLabs: play or describe the voice response toggle

## Backup Plan

If Gemini or API keys fail live:

- Use an already analyzed video from the library.
- Show cached timeline and chat history.
- Explain that AI calls require valid API keys and network access.

If extension fails:

- Demo the web app flow first.
- Explain extension architecture using the architecture slide.

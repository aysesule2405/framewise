# Multi-Platform Video Analysis — Implementation Plan

## Overview

Expand Framewise from YouTube-only to support YouTube Shorts, Vimeo, Canvas/Kaltura,
TikTok, and any generic page with a `<video>` element — without breaking the existing
YouTube analysis pipeline at any step.

---

## 1. Current Architecture Audit — What Is Tightly Coupled to YouTube

### Extension — manifest.json
- `content_scripts.matches` is `*://*.youtube.com/*` only
- `host_permissions` locked to `youtube.com` and `img.youtube.com`

### Extension — background.js
- `handleTab()` only fires when `tab.url.includes("youtube.com/watch")`
- `getYouTubeVideoKey()` extracts `?v=` param — meaningless on other platforms
- YouTube Shorts (`/shorts/{id}`) falls through the `else` branch and clears session state

### Extension — content.js
- `safeNotifyBackground()` hard-bails if URL doesn't include `youtube.com/watch`
- Caption overlay targets `.html5-video-player` (YouTube wrapper div)
- Seekbar overlay targets `.ytp-progress-bar-container`
- Native caption suppression targets `.ytp-caption-window-container`

### Extension — panel.js
- Boot fallback checks `tab.url.includes("youtube.com/watch")`
- `getVideoKey()` extracts `?v=` param only
- `updateVideoInfo()` builds thumbnail from `img.youtube.com/vi/{key}/mqdefault.jpg`
- Active segment tracker guards on `tab.url.includes("youtube.com")`
- Analyze call hardcodes `source: "youtube"`
- Status strings throughout say "Open a YouTube video"

### Backend — videoController.js
- `normalizeYouTubeUrl()` only handles YouTube/youtu.be shapes
- `analyzeVideo` passes URL directly to `analyzeWithGemini` (YouTube-only Gemini path)

### Backend — geminiService.js
- `buildYoutubePart()` passes a YouTube URL as `fileData.fileUri` — Gemini fetches it
- No code path for non-YouTube video input

### Backend — audioTranscriptionService.js
- Entirely built on `ytdl-core` — YouTube-only

### Backend — captionService.js
- Uses `youtube-transcript` — YouTube-only

### Backend — Video.js schema
- `source` enum is `["youtube", "upload"]` — "upload" was never wired up

---

## 2. Technology Decisions

### Gemini File API
- `GoogleAIFileManager` from `@google/generative-ai/server` (available in v0.15+)
- Upload: `fileManager.uploadFile(localPath, { mimeType, displayName })`
- Returns `file.uri` — used in `generateContent` as `fileData.fileUri`
- Limits: 2 GB per file, 20 GB per project, 48-hour file retention (auto-deleted)
- Supported formats: mp4, webm, mpeg, mov, avi, 3gpp
- **All existing Gemini prompts/chunking/retry logic is reused unchanged** — only
  the "input part" builder changes from `buildYoutubePart` → `buildFilePart`

### YouTube Shorts
- Gemini does NOT document native support for `/shorts/{id}` URLs
- Safe fix: normalize `youtube.com/shorts/{id}` → `youtube.com/watch?v={id}` before
  passing to Gemini — same video, guaranteed to work

### video.captureStream() (content script, unprotected content)
- Works in a content script: `videoElement.captureStream()` → `MediaRecorder`
- Blocked for DRM-protected content (Widevine/EME) at the browser level
- Works on: Vimeo public, Canvas/Kaltura (unprotected), Loom, direct MP4 pages,
  YouTube including Shorts
- Blocked on: TikTok (DRM-encrypted), Netflix, etc.

### video.currentSrc direct download (faster than capture for public CDN URLs)
- Many platforms expose a direct CDN URL in `videoElement.currentSrc`
- Backend can `fetch()` that URL and stream it to Gemini File API immediately
- Must be attempted within seconds — signed CDN URLs expire

### chrome.tabCapture via Offscreen API (DRM platforms, TikTok)
- `chrome.tabCapture.getMediaStreamId()` from service worker → pass stream ID to
  Offscreen document → Offscreen calls `getUserMedia` with `chromeMediaSource: "tab"`
- Requires `tabCapture` + `offscreen` manifest permissions
- Works for any platform regardless of DRM

---

## 3. Platform Matrix

| Platform         | URL Pattern                        | Gemini Input             | captureStream | Notes                        |
|------------------|------------------------------------|--------------------------|---------------|------------------------------|
| YouTube regular  | `youtube.com/watch?v=`             | Native YouTube URL       | Not needed    | Zero changes to existing flow |
| YouTube Shorts   | `youtube.com/shorts/{id}`          | Normalize → watch?v=     | Not needed    | URL normalization only        |
| Vimeo (public)   | `vimeo.com/{id}`                   | currentSrc → File API    | ✅ Works      | CDN URL valid ~minutes        |
| Canvas / Kaltura | LMS subdomain, kaltura.com         | currentSrc → File API    | ✅ Usually    | Signed URLs, send fast        |
| Loom             | `loom.com/share/`                  | currentSrc → File API    | ✅ Works      |                              |
| TikTok           | `tiktok.com/@*/video/*`            | tabCapture → File API    | ❌ DRM        | Needs Offscreen document      |
| Generic          | Any page with `<video>`            | currentSrc → File API    | ✅ Usually    | Most educational/LMS platforms |

---

## 4. Implementation Phases

### Phase 0 — Backend Foundation ✅ IN PROGRESS
**Goal:** Add Gemini File API path to backend. YouTube untouched.

Files changed:
- `backend/src/services/geminiService.js` — add buildFilePart, uploadVideoToGemini,
  analyzeWithGeminiFile, analyzeDanceWithGeminiFile
- `backend/src/services/videoUploadService.js` — new: receiveAndUpload, directDownloadAndUpload
- `backend/src/models/Video.js` — expand source enum, add geminiFileUri fields
- `backend/src/controllers/videoController.js` — add source routing in runAnalysis,
  add uploadCaptureAndAnalyze endpoint
- `backend/src/routes/videoRoutes.js` — wire upload-capture with multer
- `backend/package.json` — add multer, tmp-promise

### Phase 1 — YouTube Shorts (~2 hours)
**Goal:** Normalize Shorts URLs so they pass through existing YouTube analysis path.

Files changed:
- `extension/src/background.js` — add Shorts URL detection + key extraction
- `extension/src/panel.js` — update getVideoKey, updateVideoInfo
- `backend/src/controllers/videoController.js` — extend normalizeYouTubeUrl for /shorts/

### Phase 2 — Generic Video Detection (~4 hours)
**Goal:** Extension detects <video> on any page. No analysis yet for non-YouTube — just
detection and panel display.

Files changed:
- `extension/manifest.json` — host_permissions → <all_urls>, content_scripts → <all_urls>
- `extension/src/content.js` — add detectPlatform(), remove youtube.com/watch guard,
  send currentSrc in VIDEO_DETECTED message
- `extension/src/background.js` — handleTab detects any <video>, uses full URL as key
- `extension/src/panel.js` — remove YouTube-specific guards, add platform-aware UI

### Phase 3 — captureStream() Pipeline (~2 days)
**Goal:** Vimeo, Canvas, Loom, and generic video analysis via browser-side capture.

Files changed:
- `extension/src/content.js` — add START_CAPTURE message handler
- `extension/src/panel.js` — add captureAndAnalyze() flow, chunked upload
- `backend/src/controllers/videoController.js` — upload-capture endpoint fully wired
- `backend/src/services/audioTranscriptionService.js` — add generateCaptionsFromBuffer()
- `backend/src/routes/videoRoutes.js` — caption route for captured audio

### Phase 4 — tabCapture via Offscreen API (~1 day)
**Goal:** TikTok and DRM-protected content via full tab recording.

Files changed:
- `extension/manifest.json` — add tabCapture + offscreen permissions
- `extension/src/offscreen/offscreen.html` — new
- `extension/src/offscreen/offscreen.js` — new: handles MediaStream + MediaRecorder
- `extension/src/background.js` — REQUEST_TAB_CAPTURE handler + TAB_CAPTURE_DONE relay
- `extension/src/panel.js` — tabCapture fallback when captureStream blocked

---

## 5. Risk Register

| Risk                                              | Likelihood | Impact  | Mitigation                                                   |
|---------------------------------------------------|------------|---------|--------------------------------------------------------------|
| captureStream() blocked by future Chrome policy   | Low        | High    | tabCapture path in Phase 4 as fallback                       |
| Gemini File API 2GB upload limit hit              | Low        | Medium  | 300s @ 800kbps = ~30MB — far under limit                     |
| Signed CDN URLs expire before backend fetch       | Medium     | Low     | Direct download fires within same HTTP request (~30s timeout)|
| TikTok DRM blocks captureStream                   | Confirmed  | Medium  | Routed to tabCapture in Phase 4                              |
| <all_urls> permission triggers store review       | Medium     | Low     | Required permission — justify in listing                     |
| Offscreen API absent in older Chrome              | Low        | Medium  | Check chrome.offscreen availability, degrade gracefully      |
| YouTube analysis broken by extension broadening   | None       | Critical| YouTube still matches first; existing path untouched         |

---

## 6. New Dependencies

Backend:
- `multer@^1.4.5-lts.1` — multipart file upload handling
- `tmp-promise@^3.0.3` — temp file creation with auto-cleanup
- Upgrade `@google/generative-ai` to `^0.21.0` for stable File API

No new frontend or extension dependencies.

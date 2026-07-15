const API = FW_API; // set by config.js loaded before this script
let token = null;
let currentVideoUrl = null;
let currentVideoTitle = null;
let currentVideoKey = null;
let currentVideoId = null; // MongoDB _id after analysis
let currentVideoDuration = null;
let allSegments = []; // full segment list for search/filter
let activeSegmentIndex = -1; // currently highlighted segment
let voiceEnabled = false;
let voiceProfile = "default";
let captionAutoInject = false;
let chatLoading = false;
let currentVideoMode = "general";
const ANALYZE_POLL_MS = 2000;

// ── Auth helpers ────────────────────────────────────────────────────────────────
async function tryGetTokenFromWebApp() {
  try {
    const tabs = await chrome.tabs.query({ url: FW_APP + "/*" });
    if (!tabs.length) return null;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => ({
        token: localStorage.getItem("fw_token"),
        voiceProfile: localStorage.getItem("fw_voice_profile"),
        captionAutoInject: localStorage.getItem("fw_caption_auto_inject"),
        captionLanguage: localStorage.getItem("fw_caption_language"),
        voiceReplies: localStorage.getItem("fw_voice_replies"),
      }),
    });
    const prefs = results?.[0]?.result;
    if (prefs?.voiceProfile) localStorage.setItem("fw_voice_profile", prefs.voiceProfile);
    if (prefs?.captionAutoInject) localStorage.setItem("fw_caption_auto_inject", prefs.captionAutoInject);
    if (prefs?.captionLanguage) localStorage.setItem("fw_caption_language", prefs.captionLanguage);
    if (prefs?.voiceReplies) localStorage.setItem("fw_voice_replies", prefs.voiceReplies);
    return prefs?.token ?? null;
  } catch {
    return null;
  }
}

function showApp() {
  document.getElementById("not-logged-in").style.display = "none";
  document.getElementById("app-screen").style.display = "flex";
  showNoVideoState(true); // default until a video URL is confirmed
}

function showNotLoggedIn() {
  document.getElementById("not-logged-in").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
}

function showNoVideoState(show) {
  const noVideoEl = document.getElementById("no-video-state");
  const analyzeBtn = document.getElementById("analyze-btn");
  const sections = document.querySelector(".fw-sections");
  if (noVideoEl) noVideoEl.style.display = show ? "flex" : "none";
  if (analyzeBtn) analyzeBtn.style.display = show ? "none" : "";
  if (sections) sections.style.display = show ? "none" : "";
  if (show) document.getElementById("capture-row").style.display = "none";
}

function getPlatformSource(url) {
  if (!url) return "generic";
  if (url.includes("youtube.com/shorts/")) return "youtube-shorts";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("kaltura") || url.includes("instructure.com")) return "canvas";
  return "generic";
}

// ── Boot ───────────────────────────────────────────────────────────────────────
(async () => {
  token = (await chrome.storage.local.get("fw_token")).fw_token || null;

  // If no cached token, try to read it from the open web app tab
  if (!token) {
    token = await tryGetTokenFromWebApp();
    if (token) await chrome.storage.local.set({ fw_token: token });
  }

  if (token) showApp();
  else showNotLoggedIn();

  // Read whatever background.js already stored
  const session = await chrome.storage.session.get([
    "currentVideoUrl",
    "currentVideoTitle",
    "currentVideoDuration",
    "currentVideoKey",
    "framewiseExistingVideoId",
    "framewiseSegments",
    "framewiseResumeAt",
  ]);
  if (session.currentVideoUrl) {
    setVideo(session.currentVideoUrl, session.currentVideoTitle, session.currentVideoDuration, session.currentVideoKey);
    if (session.framewiseExistingVideoId) {
      currentVideoId = session.framewiseExistingVideoId;
      if (session.framewiseSegments?.length) renderSegments(session.framewiseSegments);
      // Fetch full video to get mode fields and apply adaptive layout
      apiFetch(`/videos/${currentVideoId}`, "GET")
        .then((v) => applyVideoMode(v))
        .catch(() => {});
      showQuickActions();
      await loadChatHistory();
      document.getElementById("status").textContent = session.framewiseResumeAt
        ? `Timeline loaded • resume at ${formatTime(session.framewiseResumeAt)}`
        : "Timeline loaded";
    }
  } else {
    // Fallback: query the active tab directly in case background hasn't stored yet
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes("youtube.com/watch") || tab?.url?.includes("youtube.com/shorts/")) {
        const vidKey = getVideoKey(tab.url);
        setVideo(tab.url, tab.title, null, vidKey);
        try {
          const cached = await loadCachedAnalysis(tab.url);
          if (cached) document.getElementById("status").textContent = "Timeline loaded";
          else document.getElementById("status").textContent = "Video detected — click Analyze";
        } catch {
          document.getElementById("status").textContent = "Video detected — click Analyze";
        }
      } else {
        showNoVideoState(true);
        document.getElementById("status").textContent = "Open a video to get started";
      }
    } catch {
      showNoVideoState(true);
      document.getElementById("status").textContent = "Open a YouTube video";
    }
  }
})();

// ── Voice preference persistence ────────────────────────────────────────────────
const voiceProfileInput = document.getElementById("voice-profile-input");
voiceEnabled = localStorage.getItem("fw_voice_replies") === "on";
voiceProfile = localStorage.getItem("fw_voice_profile") || "default";
if (voiceProfileInput) voiceProfileInput.value = voiceProfile;
updateVoiceButton();
voiceProfileInput?.addEventListener("change", () => {
  voiceProfile = voiceProfileInput.value || "default";
  localStorage.setItem("fw_voice_profile", voiceProfile);
});

const captionAutoInjectInput = document.getElementById("caption-auto-inject-input");
captionAutoInject = localStorage.getItem("fw_caption_auto_inject") === "on";
if (captionAutoInjectInput) captionAutoInjectInput.checked = captionAutoInject;
captionAutoInjectInput?.addEventListener("change", () => {
  captionAutoInject = captionAutoInjectInput.checked;
  localStorage.setItem("fw_caption_auto_inject", captionAutoInject ? "on" : "off");
  document.getElementById("status").textContent = captionAutoInject
    ? "Generated captions will auto-inject"
    : "Generated captions will wait for manual injection";
});
const captionLangInput = document.getElementById("caption-lang-input");
if (captionLangInput) {
  captionLangInput.value = localStorage.getItem("fw_caption_language") || captionLangInput.value || "Spanish";
  captionLangInput.addEventListener("change", () => {
    localStorage.setItem("fw_caption_language", captionLangInput.value.trim() || "Spanish");
  });
}

function updateVoiceButton() {
  const btn = document.getElementById("toggle-voice-btn");
  if (!btn) return;
  btn.title = voiceEnabled ? "Disable voice replies" : "Enable voice replies";
  btn.classList.toggle("active", voiceEnabled);
  const onIcon = document.getElementById("voice-on-icon");
  const offIcon = document.getElementById("voice-off-icon");
  if (onIcon) onIcon.style.display = voiceEnabled ? "" : "none";
  if (offIcon) offIcon.style.display = voiceEnabled ? "none" : "";
  // Show/hide the style selector in the header
  const styleSelect = document.getElementById("voice-profile-input");
  if (styleSelect) styleSelect.classList.toggle("visible", voiceEnabled);
}

// ── Theme toggle ───────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem("fw_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
})();

function updateThemeIcon(theme) {
  const moon = document.getElementById("theme-icon-moon");
  const sun = document.getElementById("theme-icon-sun");
  if (moon) moon.style.display = theme === "dark" ? "block" : "none";
  if (sun) sun.style.display = theme === "light" ? "block" : "none";
}

document.getElementById("theme-toggle-btn").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("fw_theme", next);
  updateThemeIcon(next);
});

// ── Chat suggestion chips (delegated — chips are replaced per mode) ───────────
document.getElementById("chat-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip-btn");
  if (!chip || chatLoading) return;
  const input = document.getElementById("chat-input");
  input.value = chip.dataset.msg;
  sendChat();
});

// ── Timeline search ────────────────────────────────────────────────────────────
document.getElementById("segment-search").addEventListener("input", (e) => {
  filterAndRenderSegments(e.target.value);
});

// ── Active segment tracking (polls video time every 2s) ──────────────────────
setInterval(async () => {
  if (!allSegments.length) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !currentVideoUrl) return;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { const v = document.querySelector("video"); return v ? v.currentTime : null; },
    });
    const t = results?.[0]?.result;
    if (t == null) return;
    let newIdx = -1;
    for (let i = allSegments.length - 1; i >= 0; i--) {
      if (t >= allSegments[i].startTime) { newIdx = i; break; }
    }
    if (newIdx !== activeSegmentIndex) {
      activeSegmentIndex = newIdx;
      filterAndRenderSegments(document.getElementById("segment-search")?.value || "");
      // Scroll active segment into view
      const active = document.querySelector("#segments .segment.active");
      if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      // Trigger pose snap when entering a new dance segment
      if (newIdx >= 0) extPoseSnapSchedule(t);
    }
  } catch {}
}, 2000);

// Retry button — re-attempts token fetch from web app
document.getElementById("retry-btn").addEventListener("click", async () => {
  const btn = document.getElementById("retry-btn");
  btn.textContent = "Checking…";
  btn.disabled = true;
  token = await tryGetTokenFromWebApp();
  if (token) {
    await chrome.storage.local.set({ fw_token: token });
    showApp();
  } else {
    btn.textContent = "Retry sign-in";
    btn.disabled = false;
  }
});

// Open web app button
document.getElementById("open-app-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: FW_APP + "/login" });
});

// ── Quick actions (bookmark · note · open in app) ───────────────────────────────
function showQuickActions() {
  const el = document.getElementById("quick-actions");
  if (el) el.style.display = "flex";
}

function hideQuickActions() {
  const el = document.getElementById("quick-actions");
  if (el) el.style.display = "none";
}

function getCurrentVideoTime() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return resolve(0);
      chrome.scripting.executeScript(
        { target: { tabId: tabs[0].id }, func: () => document.querySelector("video")?.currentTime || 0 },
        (results) => resolve(results?.[0]?.result || 0)
      );
    });
  });
}

document.getElementById("quick-bookmark-btn")?.addEventListener("click", async () => {
  if (!currentVideoId) return;
  const btn = document.getElementById("quick-bookmark-btn");
  const t = Math.floor(await getCurrentVideoTime());
  const label = `Bookmark at ${new Date(t * 1000).toISOString().substr(11, 8).replace(/^00:/, "")}`;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await apiFetch(`/videos/${currentVideoId}/bookmarks`, "POST", { timestamp: t, label });
    btn.textContent = "Saved ✓";
    setTimeout(() => { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z"/></svg> Bookmark`; }, 1800);
  } catch {
    btn.textContent = "Failed";
    setTimeout(() => { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3-7 3V5z"/></svg> Bookmark`; }, 2000);
  }
});

document.getElementById("quick-note-btn")?.addEventListener("click", async () => {
  if (!currentVideoId) return;
  const input = document.getElementById("quick-note-input");
  const content = input?.value?.trim();
  if (!content) return;
  const btn = document.getElementById("quick-note-btn");
  const t = Math.floor(await getCurrentVideoTime());
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await apiFetch(`/videos/${currentVideoId}/notes`, "POST", { timestamp: t, content });
    input.value = "";
    btn.textContent = "Saved ✓";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Save"; }, 1800);
  } catch {
    btn.textContent = "Failed";
    setTimeout(() => { btn.disabled = false; btn.textContent = "Save"; }, 2000);
  }
});

document.getElementById("open-in-app-btn")?.addEventListener("click", () => {
  if (currentVideoId) {
    chrome.tabs.create({ url: `${FW_APP}/app/video/${currentVideoId}` });
  } else if (currentVideoUrl) {
    chrome.tabs.create({ url: FW_APP + "/app" });
  }
});

// ── Live updates from background.js ────────────────────────────────────────────
// Live updates from background.js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;
  const url = changes.currentVideoUrl?.newValue;
  const title = changes.currentVideoTitle?.newValue;
  const duration = changes.currentVideoDuration?.newValue;
  const key = changes.currentVideoKey?.newValue;
  const existingVideoId = changes.framewiseExistingVideoId?.newValue;

  if (url) {
    setVideo(url, title, duration, key);
  } else if ("currentVideoKey" in changes && key && currentVideoUrl) {
    setVideo(currentVideoUrl, title || currentVideoTitle, duration || currentVideoDuration, key);
  }

  if ("currentVideoDuration" in changes && currentVideoUrl) {
    currentVideoDuration = duration || currentVideoDuration;
    updateVideoInfo();
  }

  if ("framewiseExistingVideoId" in changes && existingVideoId) {
    currentVideoId = existingVideoId;
    showQuickActions();
    document.getElementById("status").textContent = "Timeline loaded";
    loadChatHistory().catch(() => {});
  }

  if ("framewiseSegments" in changes && changes.framewiseSegments.newValue?.length) {
    renderSegments(changes.framewiseSegments.newValue);
  }

  if ("currentVideoUrl" in changes && !url) {
    currentVideoUrl = null;
    currentVideoTitle = null;
    currentVideoKey = null;
    currentVideoDuration = null;
    showNoVideoState(true);
    updateChatChips("general");
    document.getElementById("status").textContent = "Open a video to get started";
    document.getElementById("video-info").textContent = "";
    const thumb = document.getElementById("video-thumb");
    if (thumb) thumb.classList.remove("loaded");
    const modeEl = document.getElementById("video-mode");
    if (modeEl) modeEl.style.display = "none";
    document.getElementById("capture-row").style.display = "none";
    resetCaptureUI();
  }
});

function setVideo(url, title, durationSeconds, videoKey) {
  const nextKey = videoKey || getVideoKey(url);
  const isNewVideo = currentVideoKey && currentVideoKey !== nextKey;
  currentVideoUrl = url;
  currentVideoKey = nextKey;
  currentVideoTitle = title || currentVideoTitle;
  currentVideoDuration = durationSeconds || (isNewVideo ? null : currentVideoDuration);
  if (isNewVideo) resetVideoState();
  updateVideoInfo();
  showNoVideoState(false);

  // Show capture button for non-YouTube platforms
  const captureRow = document.getElementById("capture-row");
  const src = getPlatformSource(url);
  const isYouTube = src === "youtube" || src === "youtube-shorts";
  if (captureRow) captureRow.style.display = isYouTube ? "none" : "block";

  // Toggle caption generation blocks: YouTube transcript vs capture-based transcription
  const captionYtBlock = document.getElementById("caption-youtube-block");
  const captionCaptureBlock = document.getElementById("caption-capture-fallback");
  if (captionYtBlock) captionYtBlock.style.display = isYouTube ? "" : "none";
  if (captionCaptureBlock) captionCaptureBlock.style.display = isYouTube ? "none" : "flex";

  // Immediately apply soft mode from title — overridden once analysis loads
  const softMode = detectModeFromTitle(currentVideoTitle);
  applyVideoMode({ detectedMode: softMode, modeOverride: "auto" });

  const modeLabel = softMode === "dance" ? "Dance video detected"
    : softMode === "study" ? "Study video detected"
    : "Video detected";
  document.getElementById("status").textContent = modeLabel;
}

function resetVideoState() {
  currentVideoId = null;
  currentCaptions = [];
  captionsInjected = false;
  captionsShowTranslated = false;
  hideQuickActions();
  const captureRow = document.getElementById("capture-row");
  if (captureRow) captureRow.style.display = "none";
  resetCaptureUI();
  const captureStatusEl = document.getElementById("caption-capture-status");
  if (captureStatusEl) { captureStatusEl.style.display = "none"; captureStatusEl.textContent = ""; }
  const captureBtn = document.getElementById("caption-capture-btn");
  if (captureBtn) { captureBtn.disabled = false; captureBtn.textContent = "Capture & Transcribe"; }
  document.getElementById("segments").innerHTML = `<p class="fw-empty">Analyze this video to generate the topic timeline.</p>`;
  document.getElementById("dance-segments").innerHTML = `<p class="fw-empty">Generate a dance summary or open the full Practice workspace in Framewise.</p>`;
  document.getElementById("chat-area").innerHTML = "";
  document.getElementById("caption-results").innerHTML = "";
  const chips = document.getElementById("chat-chips");
  if (chips) chips.style.display = "";
  const badge = document.getElementById("timeline-count");
  if (badge) badge.style.display = "none";
  const controls = document.getElementById("caption-controls");
  if (controls) controls.style.display = "none";
  chrome.storage.session.set({
    framewiseCaptions: [],
    framewiseCaptionsActive: false,
    framewiseSegments: [],
    framewiseExistingVideoId: null,
  });
}

// ── captureStream pipeline ─────────────────────────────────────────────────────

// Shared completion handler — called after any capture path returns a jobId
function onCaptureJobStarted(jobId) {
  const statusEl = document.getElementById("capture-status");
  const status = document.getElementById("status");
  if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Analyzing…"; }
  if (status) status.textContent = "Analyzing captured video…";
  waitForAnalyzeJob(jobId, (job) => {
    if (status) status.textContent = job.message || "Analyzing…";
  }).then(async (result) => {
    currentVideoId = result.video._id;
    renderSegments(result.segments);
    applyVideoMode(result.video);
    showQuickActions();
    await loadChatHistory();
    resetCaptureUI();
    if (status) status.textContent = "Capture analysis complete";
    await chrome.storage.session.set({
      framewiseExistingVideoId: currentVideoId,
      framewiseSegments: result.segments.map((s) => ({ startTime: s.startTime, title: s.title })),
    });
  }).catch((e) => {
    resetCaptureUI();
    if (status) status.textContent = "Analysis failed: " + (e.message || "unknown error");
  });
}

// Attempt server-side CDN download before starting captureStream recording.
// Returns the response JSON { jobId, videoId } on success, or null if the CDN
// URL is auth-gated / unavailable (caller falls back to captureStream).
async function tryDirectDownload(srcUrl) {
  try {
    const res = await fetch(`${FW_API}/videos/upload-capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        srcUrl,
        url: currentVideoUrl,
        title: currentVideoTitle || currentVideoUrl,
        source: getPlatformSource(currentVideoUrl),
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function resetCaptureUI() {
  const btn = document.getElementById("capture-btn");
  const statusEl = document.getElementById("capture-status");
  const stopBtn = document.getElementById("capture-stop-btn");
  if (btn) { btn.disabled = false; btn.textContent = ""; btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> Capture &amp; Analyze'; }
  if (statusEl) { statusEl.style.display = "none"; statusEl.textContent = ""; }
  if (stopBtn) stopBtn.style.display = "none";
}

async function captureAndAnalyze() {
  if (!currentVideoUrl) {
    document.getElementById("status").textContent = "No video detected — open a video first.";
    return;
  }
  if (!token) { showNotLoggedIn(); return; }

  const btn = document.getElementById("capture-btn");
  const status = document.getElementById("status");

  btn.disabled = true;
  btn.textContent = "Starting capture…";
  status.textContent = "Starting recording…";

  const src = getPlatformSource(currentVideoUrl);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");

    if (src === "tiktok") {
      // TikTok uses DRM — route through tabCapture/offscreen
      await requestTabCapture(tab.id);
    } else {
      // For Vimeo, Canvas, Loom, generic: try a server-side CDN fetch first.
      // If the CDN URL is public the backend downloads it in ~seconds — no recording needed.
      const { currentVideoSrc } = await chrome.storage.session.get("currentVideoSrc");
      if (currentVideoSrc && currentVideoSrc.startsWith("http")) {
        status.textContent = "Trying fast download…";
        const direct = await tryDirectDownload(currentVideoSrc);
        if (direct?.jobId) {
          onCaptureJobStarted(direct.jobId);
          return; // done — no captureStream recording needed
        }
        status.textContent = "Starting capture…";
      }
      await chrome.tabs.sendMessage(tab.id, {
        type: "START_CAPTURE",
        apiUrl: FW_API,
        url: currentVideoUrl,
        title: currentVideoTitle || currentVideoUrl,
        source: src,
        maxDuration: 300,
      });
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Capture & Analyze";
    status.textContent = "Capture error: " + (e.message || "Could not start recording.");
  }
}

async function requestTabCapture(tabId) {
  chrome.runtime.sendMessage({
    type: "REQUEST_TAB_CAPTURE",
    tabId,
    apiUrl: FW_API,
    url: currentVideoUrl,
    title: currentVideoTitle || currentVideoUrl,
    source: getPlatformSource(currentVideoUrl),
    maxDuration: 300,
  });
}

// Listen for capture progress from content script and offscreen document.
// TAB_CAPTURE_* messages (from offscreen via background) are normalized to CAPTURE_* here.
chrome.runtime.onMessage.addListener((message) => {
  // Normalize TAB_CAPTURE_* → CAPTURE_* so the same UI handlers work for both paths
  let type = message?.type;
  if (!type) return;
  if (type === "TAB_CAPTURE_STARTED")   type = "CAPTURE_STARTED";
  if (type === "TAB_CAPTURE_UPLOADING") type = "CAPTURE_UPLOADING";
  if (type === "TAB_CAPTURE_DONE")      type = "CAPTURE_DONE";
  if (type === "TAB_CAPTURE_ERROR")     type = "CAPTURE_ERROR";
  if (!type.startsWith("CAPTURE_")) return;

  const btn = document.getElementById("capture-btn");
  const statusEl = document.getElementById("capture-status");
  const stopBtn = document.getElementById("capture-stop-btn");
  const status = document.getElementById("status");

  if (type === "CAPTURE_STARTED") {
    if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Recording… play the video to capture it. Click Stop when done."; }
    if (stopBtn) stopBtn.style.display = "block";
    if (status) status.textContent = "Recording…";
  }

  if (type === "CAPTURE_UPLOADING") {
    if (statusEl) statusEl.textContent = "Uploading to Gemini…";
    if (stopBtn) stopBtn.style.display = "none";
    if (status) status.textContent = "Uploading captured video…";
  }

  if (type === "CAPTURE_DONE") {
    onCaptureJobStarted(message.jobId);
  }

  if (type === "CAPTURE_ERROR") {
    resetCaptureUI();
    const errText = message.error || "unknown error";
    const isDrm = /drm|widevine|protected|notSupported|NotSupportedError/i.test(errText);
    if (status) status.textContent = isDrm
      ? "DRM-protected video — tab capture is not supported on this platform."
      : "Capture error: " + errText;
    if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = isDrm ? "DRM content cannot be captured." : errText; }
  }
});

document.getElementById("capture-btn")?.addEventListener("click", captureAndAnalyze);
document.getElementById("capture-stop-btn")?.addEventListener("click", async () => {
  const src = getPlatformSource(currentVideoUrl);
  try {
    if (src === "tiktok") {
      // TikTok uses offscreen tabCapture — relay stop signal through background
      chrome.runtime.sendMessage({ type: "RELAY_STOP_TAB_CAPTURE" });
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "STOP_CAPTURE" });
    }
  } catch {}
  document.getElementById("capture-stop-btn").style.display = "none";
  const statusEl = document.getElementById("capture-status");
  if (statusEl) statusEl.textContent = "Stopping…";
});

// ── Caption capture pipeline ───────────────────────────────────────────────────
async function startCaptionCapture() {
  if (!currentVideoId) {
    document.getElementById("status").textContent = "Analyze this video before generating captions.";
    return;
  }
  if (!token) { showNotLoggedIn(); return; }

  const btn = document.getElementById("caption-capture-btn");
  const captureStatusEl = document.getElementById("caption-capture-status");
  const stopBtn = document.getElementById("capture-stop-btn");
  const status = document.getElementById("status");

  btn.disabled = true;
  btn.textContent = "Recording…";
  if (captureStatusEl) { captureStatusEl.style.display = "block"; captureStatusEl.textContent = "Recording — play the video, then click Stop when you've captured enough."; }
  if (stopBtn) stopBtn.style.display = "block";
  status.textContent = "Recording for captions…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    await chrome.tabs.sendMessage(tab.id, {
      type: "START_CAPTION_CAPTURE",
      apiUrl: FW_API,
      videoId: currentVideoId,
      maxDuration: 180,
    });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Capture & Transcribe";
    if (captureStatusEl) captureStatusEl.style.display = "none";
    if (stopBtn) stopBtn.style.display = "none";
    status.textContent = "Capture error: " + (e.message || "Could not start recording.");
  }
}

document.getElementById("caption-capture-btn")?.addEventListener("click", startCaptionCapture);

chrome.runtime.onMessage.addListener((message) => {
  if (!message?.type?.startsWith("CAPTION_CAPTURE_")) return;
  const btn = document.getElementById("caption-capture-btn");
  const captureStatusEl = document.getElementById("caption-capture-status");
  const stopBtn = document.getElementById("capture-stop-btn");
  const status = document.getElementById("status");

  if (message.type === "CAPTION_CAPTURE_STARTED") {
    if (captureStatusEl) captureStatusEl.textContent = "Recording… play the video. Click Stop when done.";
    if (stopBtn) stopBtn.style.display = "block";
    if (status) status.textContent = "Recording for captions…";
  }

  if (message.type === "CAPTION_CAPTURE_UPLOADING") {
    if (captureStatusEl) captureStatusEl.textContent = "Transcribing with ElevenLabs…";
    if (stopBtn) stopBtn.style.display = "none";
    if (status) status.textContent = "Transcribing captured audio…";
  }

  if (message.type === "CAPTION_CAPTURE_DONE") {
    if (captureStatusEl) { captureStatusEl.style.display = "none"; captureStatusEl.textContent = ""; }
    if (btn) { btn.disabled = false; btn.textContent = "Capture & Transcribe"; }
    if (stopBtn) stopBtn.style.display = "none";
    if (status) status.textContent = "Loading captions…";
    apiFetch(`/videos/${currentVideoId}/captions`, "GET")
      .then((data) => {
        if (data.captions?.length) {
          renderCaptions(data.captions);
          if (captionAutoInject) injectCurrentCaptions(data.captions);
          if (status) status.textContent = `${data.captions.length} captions ready`;
        } else {
          if (status) status.textContent = "Captions saved";
        }
      })
      .catch(() => { if (status) status.textContent = "Captions ready"; });
  }

  if (message.type === "CAPTION_CAPTURE_ERROR") {
    if (captureStatusEl) { captureStatusEl.style.display = "block"; captureStatusEl.textContent = message.error || "Capture failed."; }
    if (btn) { btn.disabled = false; btn.textContent = "Capture & Transcribe"; }
    if (stopBtn) stopBtn.style.display = "none";
    if (status) status.textContent = "Caption capture error: " + (message.error || "unknown");
  }
});

function getVideoKey(url) {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get("v");
    if (v) return v;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" && parts[1]) return parts[1];
    return url;
  } catch {
    return url;
  }
}

function updateVideoInfo() {
  const durationText = currentVideoDuration ? ` · ${formatDuration(currentVideoDuration)}` : "";
  document.getElementById("video-info").textContent = `${currentVideoTitle || currentVideoUrl}${durationText}`;
  const thumb = document.getElementById("video-thumb");
  if (thumb) {
    const isYouTube = currentVideoUrl && (currentVideoUrl.includes("youtube.com") || currentVideoUrl.includes("youtu.be"));
    if (isYouTube && currentVideoKey) {
      thumb.src = `https://img.youtube.com/vi/${currentVideoKey}/mqdefault.jpg`;
      thumb.classList.add("loaded");
    } else {
      thumb.removeAttribute("src");
      thumb.classList.remove("loaded");
    }
  }
}

// ── Accordion sections ─────────────────────────────────────────────────────────
function openSection(name) {
  document.querySelectorAll(".fw-section-hdr").forEach((hdr) => {
    const isTarget = hdr.dataset.section === name;
    hdr.classList.toggle("open", isTarget);
    const body = document.getElementById("tab-" + hdr.dataset.section);
    if (body) body.classList.toggle("open", isTarget);
  });
}

document.querySelectorAll(".fw-section-hdr").forEach((hdr) => {
  hdr.addEventListener("click", () => {
    const name = hdr.dataset.section;
    const isOpen = hdr.classList.contains("open");
    if (isOpen) {
      hdr.classList.remove("open");
      const body = document.getElementById("tab-" + name);
      if (body) body.classList.remove("open");
    } else {
      openSection(name);
    }
  });
});

// ── Mode detection ─────────────────────────────────────────────────────────────
function detectModeFromTitle(title) {
  if (!title) return "general";
  const t = title.toLowerCase();
  if (/\b(danc|choreo|choreograph|routine|hip[- ]?hop|k-?pop|kpop|ballet|salsa|twerk|breakdanc|bboy|bgirl|waacking|popping|locking|freestyle)\b/.test(t) ||
      /dance (tutorial|cover|practice|class|lesson)/i.test(t) ||
      /(tutorial|cover|learn).*(dance|choreo)/i.test(t)) return "dance";
  if (/\b(lecture|lesson|course|explained?|how to|tutorial|learn|study|guide|class|university|college|education|revision|crash course)\b/.test(t)) return "study";
  return "general";
}

const CHAT_CHIPS = {
  dance: [
    { label: "Learn the moves", msg: "Help me learn the moves in this video" },
    { label: "Break it down", msg: "Break down the choreography step by step" },
    { label: "Dance style?", msg: "What dance style is this?" },
    { label: "Key sections", msg: "What are the key practice sections?" },
  ],
  study: [
    { label: "Summarize", msg: "Summarize this video" },
    { label: "Key concepts", msg: "What are the key concepts?" },
    { label: "Quiz me", msg: "Quiz me on this video" },
    { label: "Explain topic", msg: "Explain the main topic simply" },
  ],
  general: [
    { label: "Summarize", msg: "Summarize this video" },
    { label: "Key points", msg: "What are the key points?" },
    { label: "Quiz me", msg: "Quiz me on this video" },
    { label: "Intro", msg: "What happens at the beginning?" },
  ],
};

function updateChatChips(mode) {
  const chips = document.getElementById("chat-chips");
  if (!chips) return;
  const set = CHAT_CHIPS[mode] || CHAT_CHIPS.general;
  chips.innerHTML = set.map(({ label, msg }) =>
    `<button class="chip-btn" data-msg="${escapeHtml(msg)}">${escapeHtml(label)}</button>`
  ).join("");
}

function applyVideoMode(video) {
  if (!video) return;
  const effectiveMode = (video.modeOverride && video.modeOverride !== "auto")
    ? video.modeOverride
    : (video.detectedMode || "general");
  currentVideoMode = effectiveMode;

  // Update mode indicator badge
  const modeEl = document.getElementById("video-mode");
  if (modeEl) {
    modeEl.textContent = effectiveMode === "dance" ? "▶ Dance Practice"
      : effectiveMode === "study" ? "≡ Study Queue"
      : "";
    modeEl.className = `video-mode-badge mode-${effectiveMode}`;
    modeEl.style.display = (effectiveMode === "dance" || effectiveMode === "study") ? "inline-flex" : "none";
  }

  // Update chat chips to match mode
  updateChatChips(effectiveMode);

  // Reorder sections based on mode
  const sectionsContainer = document.querySelector(".fw-sections");
  if (!sectionsContainer) return;
  const sections = Array.from(sectionsContainer.querySelectorAll(".fw-section"));
  const order = effectiveMode === "dance"
    ? ["section-timeline", "section-practice", "section-chat", "section-captions"]
    : ["section-timeline", "section-chat", "section-captions", "section-practice"];

  order.forEach((id) => {
    const s = sections.find((el) => el.id === id);
    if (s) sectionsContainer.appendChild(s);
  });

  // Auto-open the primary section for the mode
  openSection(effectiveMode === "dance" ? "dance" : effectiveMode === "study" ? "segments" : "segments");
}

// ── Analyze ────────────────────────────────────────────────────────────────────
async function getTabVideoDuration() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const video = document.querySelector("video");
        return video && Number.isFinite(video.duration) ? Math.floor(video.duration) : null;
      },
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

document.getElementById("analyze-btn").addEventListener("click", async () => {
  if (!currentVideoUrl) {
    document.getElementById("status").textContent = "No video detected — open a video first.";
    return;
  }
  if (!token) {
    showNotLoggedIn();
    return;
  }
  const btn = document.getElementById("analyze-btn");
  const status = document.getElementById("status");
  btn.textContent = "Checking cache...";
  btn.disabled = true;
  status.textContent = "Looking for a saved Framewise timeline...";

  try {
    const cached = await loadCachedAnalysis(currentVideoUrl);
    if (cached) {
      status.textContent = "Loaded saved timeline";
      btn.textContent = "Refresh timeline";
      btn.disabled = false;
      return;
    }
  } catch (e) {
    if (isAuthError(e)) {
      await clearToken();
      showNotLoggedIn();
      return;
    }
  }

  btn.textContent = "Analyzing...";
  status.textContent = "Getting video info...";

  const freshDuration = await getTabVideoDuration();
  if (freshDuration) currentVideoDuration = freshDuration;

  // Rotating status messages while Gemini works
  const statusMessages = [
    "Sending to Gemini…", "Reading the video…", "Building timeline…",
    "Extracting topics…", "Almost there…",
  ];
  let statusIdx = 0;
  status.textContent = statusMessages[0];
  const statusInterval = setInterval(() => {
    statusIdx = (statusIdx + 1) % statusMessages.length;
    status.textContent = statusMessages[statusIdx];
  }, 4000);

  try {
    const data = await apiFetch("/videos/analyze", "POST", {
      url: currentVideoUrl,
      source: getPlatformSource(currentVideoUrl),
      durationSeconds: currentVideoDuration,
    });

    const result = data.video ? data : await waitForAnalyzeJob(data.jobId, (job) => {
      status.textContent = job.message || statusMessages[statusIdx];
    });

    clearInterval(statusInterval);
    currentVideoId = result.video._id;
    renderSegments(result.segments);
    applyVideoMode(result.video);
    showQuickActions();
    await loadChatHistory();
    status.textContent = result.cached ? "Loaded from cache" : "Analysis complete";

    await chrome.storage.session.set({
      framewiseExistingVideoId: currentVideoId,
      framewiseSegments: result.segments.map((s) => ({
        startTime: s.startTime,
        title: s.title,
      })),
    });
  } catch (e) {
    clearInterval(statusInterval);
    if (isAuthError(e)) {
      await clearToken();
      showNotLoggedIn();
    } else {
      status.textContent = formatAnalyzeError(e.message);
      console.error("Analyze error:", e);
    }
  } finally {
    btn.textContent = currentVideoId ? "Refresh timeline" : "Analyze";
    btn.disabled = false;
  }
});

async function loadCachedAnalysis(url) {
  if (!url) return false;
  const data = await apiFetch(`/videos/lookup?url=${encodeURIComponent(url)}`, "GET");
  currentVideoId = data.video._id;
  renderSegments(data.segments || []);
  applyVideoMode(data.video);
  showQuickActions();
  await loadChatHistory();
  await chrome.storage.session.set({
    framewiseExistingVideoId: currentVideoId,
    framewiseSegments: (data.segments || []).map((s) => ({
      startTime: s.startTime,
      title: s.title,
      summary: s.summary,
    })),
    framewiseResumeAt: data.video.lastPositionSeconds || null,
  });
  return true;
}

function formatAnalyzeError(message) {
  const text = String(message || "Analysis failed");
  const retryMatch = text.match(/Try again in about ([^.]+)\./i) ||
    text.match(/Please retry in ([0-9.]+s)/i) ||
    text.match(/retryDelay":"([^"]+)"/i);

  if (text.includes("429") || text.toLowerCase().includes("quota")) {
    const retry = retryMatch?.[1] ? ` Try again in about ${retryMatch[1]}.` : "";
    return `Gemini quota is exhausted for this API key.${retry} Saved videos still load from your library.`;
  }

  return "Error: " + text;
}

async function waitForAnalyzeJob(jobId, onProgress) {
  if (!jobId) throw new Error("Analysis job was not created.");

  while (true) {
    const job = await apiFetch(`/jobs/${jobId}`, "GET");
    onProgress?.(job);

    if (job.status === "completed") {
      const videoId = job.result?.videoId;
      if (!videoId) throw new Error("Analysis finished without a video id.");
      const [video, segments] = await Promise.all([
        apiFetch(`/videos/${videoId}`, "GET"),
        apiFetch(`/videos/${videoId}/segments`, "GET"),
      ]);
      return { video, segments, cached: false };
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Analysis failed");
    }

    await delay(ANALYZE_POLL_MS);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Segments ───────────────────────────────────────────────────────────────────
function renderSegments(segments) {
  allSegments = segments;
  filterAndRenderSegments(document.getElementById("segment-search")?.value || "");
  const badge = document.getElementById("timeline-count");
  if (badge) {
    badge.textContent = segments.length;
    badge.style.display = segments.length ? "" : "none";
  }
}

function filterAndRenderSegments(query) {
  const container = document.getElementById("segments");
  container.innerHTML = "";
  const q = query.toLowerCase().trim();
  const filtered = q
    ? allSegments.filter((s) => (s.title + " " + (s.summary || "")).toLowerCase().includes(q))
    : allSegments;

  if (!filtered.length) {
    container.innerHTML = `<p class="fw-empty">${q ? "No segments match your search." : 'Click "Analyze this video" to generate the topic timeline.'}</p>`;
    return;
  }

  filtered.forEach((seg, i) => {
    const el = document.createElement("div");
    el.className = "segment";
    el.dataset.startTime = seg.startTime;
    const isActive = activeSegmentIndex >= 0 && allSegments[activeSegmentIndex]?.startTime === seg.startTime;
    if (isActive) el.classList.add("active");

    el.innerHTML = `
      <div class="seg-num">${(allSegments.indexOf(seg) + 1)}</div>
      <div class="seg-body">
        <div class="seg-title">${seg.title}</div>
        <div class="seg-meta">${formatTime(seg.startTime)}</div>
        ${seg.summary ? `<div class="seg-summary">${escapeHtml(seg.summary)}</div>` : ""}
      </div>
      <div class="seg-icon" style="display:flex;gap:4px;align-items:center;">
        <button class="seg-copy-btn" title="Copy timestamp link" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--fw-ink-4);display:flex;align-items:center;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      </div>`;

    el.addEventListener("click", (e) => {
      if (e.target.closest(".seg-copy-btn")) return; // handled separately
      seekTo(seg.startTime);
    });
    el.querySelector(".seg-copy-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const ts = Math.floor(seg.startTime);
      const url = currentVideoUrl ? `${currentVideoUrl.split("&t=")[0]}&t=${ts}` : "";
      navigator.clipboard.writeText(url).catch(() => {});
      const btn = e.currentTarget;
      btn.style.color = "var(--fw-sage)";
      setTimeout(() => { btn.style.color = ""; }, 1200);
    });
    container.appendChild(el);
  });
}

document.getElementById("dance-analyze-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  if (!currentVideoId) {
    status.textContent = "Analyze this video before generating a dance summary.";
    return;
  }
  const btn = document.getElementById("dance-analyze-btn");
  btn.disabled = true;
  btn.textContent = "Summarizing...";
  status.textContent = "Generating dance summary...";
  try {
    const data = await apiFetch(`/videos/${currentVideoId}/dance`, "POST", {
      durationSeconds: currentVideoDuration,
    });
    renderDanceSegments(data.segments);
    status.textContent = "Dance summary ready";
  } catch (e) {
    status.textContent = "Dance error: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Dance summary";
  }
});

function renderDanceSegments(segments) {
  const container = document.getElementById("dance-segments");
  container.innerHTML = "";
  if (!segments?.length) {
    container.innerHTML = `<p class="fw-empty">No dance sections yet. Try another video or open Practice in the web app.</p>`;
    return;
  }
  segments.forEach((seg) => {
    const el = document.createElement("div");
    el.className = "segment";
    el.innerHTML = `
      <div class="seg-num">♪</div>
      <div class="seg-body">
        <div class="seg-title">${escapeHtml(seg.title || "Dance section")}${seg.moveName ? `<span class="seg-move-badge">${escapeHtml(seg.moveName)}</span>` : ""}</div>
        <div class="seg-meta">${formatTime(seg.startTime)}-${formatTime(seg.endTime)}${seg.moveCategory ? ` · <span class="seg-move-cat">${seg.moveCategory.replace("_", " ")}</span>` : ""}</div>
        ${seg.summary ? `<div class="seg-summary">${escapeHtml(seg.summary)}</div>` : ""}
        ${seg.bodyPosition ? `<div class="seg-summary"><strong>Body:</strong> ${escapeHtml(seg.bodyPosition)}</div>` : ""}
        ${seg.movementCue ? `<div class="seg-summary"><strong>Cue:</strong> ${escapeHtml(seg.movementCue)}</div>` : ""}
      </div>
      <div class="seg-icon"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></div>
    `;
    el.addEventListener("click", () => seekTo(seg.startTime));
    container.appendChild(el);
  });
}

// ── Chat ───────────────────────────────────────────────────────────────────────
async function loadChatHistory() {
  if (!currentVideoId) return;
  const messages = await apiFetch(`/chat/${currentVideoId}/history`, "GET");
  const area = document.getElementById("chat-area");
  area.innerHTML = "";
  messages.forEach(appendMessage);
  area.scrollTop = area.scrollHeight;
  // Keep suggestion chips visible if no history yet
  const chips = document.getElementById("chat-chips");
  if (chips && !messages.length) chips.style.display = "";
}

document.getElementById("toggle-voice-btn").addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem("fw_voice_replies", voiceEnabled ? "on" : "off");
  updateVoiceButton();
});

document.getElementById("send-btn").addEventListener("click", sendChat);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

async function sendChat() {
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const content = input.value.trim();
  if (!content || chatLoading) return;
  if (!currentVideoId) {
    showChatError("Analyze this video first to start chatting.");
    return;
  }

  chatLoading = true;
  input.disabled = true;
  sendBtn.disabled = true;
  input.value = "";

  appendMessage({ role: "user", content });
  const typingEl = showTypingIndicator();
  document.getElementById("status").textContent = "Thinking…";

  try {
    const videoTime = await getCurrentVideoTime().catch(() => null);
    const mode = currentVideoMode === "dance" ? "dance" : undefined;
    const body = { content };
    if (mode) body.mode = mode;
    if (videoTime != null) body.currentTime = Math.floor(videoTime);

    const msg = await apiFetch(`/chat/${currentVideoId}/message`, "POST", body);
    typingEl.remove();
    appendMessage(msg);

    if (voiceEnabled) speak(msg.content);
    if (msg.linkedSegmentTime != null) seekTo(msg.linkedSegmentTime);
    await dispatchChatAction(msg);
    document.getElementById("status").textContent = "Ready";
  } catch (e) {
    typingEl.remove();
    showChatError(e.message || "Something went wrong. Try again.");
    document.getElementById("status").textContent = "Chat error";
    console.error("Chat error:", e);
  } finally {
    chatLoading = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function showTypingIndicator() {
  const area = document.getElementById("chat-area");
  const el = document.createElement("div");
  el.className = "fw-typing";
  el.innerHTML = `<span></span><span></span><span></span>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
  return el;
}

function showChatError(message) {
  const area = document.getElementById("chat-area");
  const el = document.createElement("div");
  el.className = "msg assistant error";
  el.innerHTML = `⚠ ${escapeHtml(message || "Something went wrong. Try again.")}`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

async function speak(text) {
  try {
    if (!currentVideoId) throw new Error("No video");
    const buffer = await apiFetchRaw(`/chat/${currentVideoId}/voice`, "POST", { text, voicePreset: voiceProfile });
    const audio = new Audio(URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" })));
    audio.play();
  } catch {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}

document.getElementById("skeleton-btn").addEventListener("click", async () => {
  const btn = document.getElementById("skeleton-btn");
  const status = document.getElementById("status");
  if (!currentVideoId) {
    status.textContent = "Analyze this video before opening pose tracking.";
    openSection("dance");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Opening...";
  status.textContent = "Opening Practice in Framewise...";
  chrome.tabs.create({ url: `${FW_APP}/app/video/${currentVideoId}?tab=dance` });
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Open Practice";
  }, 1200);
});

document.getElementById("caption-generate-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const errEl  = document.getElementById("caption-error");
  const fallbackEl = document.getElementById("caption-audio-fallback");
  if (!currentVideoId) {
    status.textContent = "Analyze this video before generating captions.";
    return;
  }
  const btn = document.getElementById("caption-generate-btn");
  btn.disabled = true;
  btn.textContent = "Fetching…";
  errEl.style.display = "none";
  fallbackEl.style.display = "none";
  status.textContent = "Fetching captions…";
  try {
    const data = await apiFetch(`/videos/${currentVideoId}/captions/generate`, "POST");
    renderCaptions(data.captions);
    if (captionAutoInject) await injectCurrentCaptions(data.captions);
    else {
      captionsInjected = false;
      await chrome.storage.session.set({ framewiseCaptions: data.captions, framewiseCaptionsActive: false });
      updateInjectBtn();
    }
    status.textContent = captionAutoInject
      ? `${data.count} captions loaded and added to video`
      : `${data.count} captions ready — use Add captions to video`;
  } catch (e) {
    if (e.message.toLowerCase().includes("no captions")) {
      fallbackEl.style.display = "flex";
      status.textContent = "No YouTube captions — try ElevenLabs";
    } else {
      errEl.textContent = e.message.includes("playable") || e.message.includes("Audio download failed") ? "YouTube audio could not be downloaded for this video. Try manual paste below, or analyze another public video." : e.message;
      errEl.style.display = "block";
      status.textContent = "Caption error";
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Regenerate";
  }
});

document.getElementById("caption-audio-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const errEl  = document.getElementById("caption-error");
  if (!currentVideoId) return;
  const btn = document.getElementById("caption-audio-btn");
  btn.disabled = true;
  btn.textContent = "Transcribing… (may take 1–2 min)";
  errEl.style.display = "none";
  status.textContent = "Downloading audio…";
  try {
    const data = await apiFetch(`/videos/${currentVideoId}/captions/generate-audio`, "POST");
    renderCaptions(data.captions);
    if (captionAutoInject) await injectCurrentCaptions(data.captions);
    else {
      captionsInjected = false;
      await chrome.storage.session.set({ framewiseCaptions: data.captions, framewiseCaptionsActive: false });
      updateInjectBtn();
    }
    document.getElementById("caption-audio-fallback").style.display = "none";
    status.textContent = captionAutoInject
      ? `${data.count} captions from ${data.source === "gemini" ? "Gemini fallback" : "ElevenLabs"}`
      : `${data.count} captions ready — use Add captions to video`;
  } catch (e) {
    errEl.textContent = e.message.includes("playable") || e.message.includes("Audio download failed") ? "YouTube audio could not be downloaded for this video. Try manual paste below, or analyze another public video." : e.message;
    errEl.style.display = "block";
    status.textContent = "Transcription error";
  } finally {
    btn.disabled = false;
    btn.textContent = "🎙 Transcribe with ElevenLabs";
  }
});

document.getElementById("caption-correct-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  if (!currentVideoId) {
    status.textContent = "Analyze this video before correcting subtitles.";
    return;
  }
  const captions = document.getElementById("caption-input").value
    .split("\n")
    .map((line, index) => ({ startTime: index * 4, endTime: index * 4 + 4, text: line.trim() }))
    .filter((caption) => caption.text);

  status.textContent = captions.length ? "Correcting subtitles..." : "Generating missing subtitles...";
  try {
    const data = await apiFetch(`/videos/${currentVideoId}/captions/correct`, "POST", { captions });
    renderCaptions(data.captions);
    if (captionAutoInject) await injectCurrentCaptions(data.captions);
    else {
      captionsInjected = false;
      await chrome.storage.session.set({ framewiseCaptions: data.captions, framewiseCaptionsActive: false });
      updateInjectBtn();
    }
    status.textContent = "Subtitles corrected and added to video";
  } catch (e) {
    status.textContent = "Caption error: " + e.message;
  }
});

let currentCaptions = [];
let captionsInjected = false;
let captionsShowTranslated = false;

function renderCaptions(captions) {
  currentCaptions = captions;
  const container = document.getElementById("caption-results");
  container.innerHTML = "";
  if (!captions.length) return;

  // Show controls
  const controls = document.getElementById("caption-controls");
  controls.style.display = "flex";
  updateInjectBtn();
  updateTranslatedToggle();

  const header = document.createElement("p");
  header.style.cssText = "font-size:10px;color:var(--fw-ink-3);font-weight:600;padding:4px 0;";
  header.textContent = `${captions.length} captions — click to jump`;
  container.appendChild(header);

  captions.forEach((caption) => {
    const el = document.createElement("div");
    el.className = "caption-row";
    el.style.cssText = "display:flex;gap:8px;align-items:flex-start;";
    const displayText = captionsShowTranslated && caption.translatedText
      ? caption.translatedText
      : (caption.correctedText || caption.text);
    el.innerHTML = `<span style="font-size:10px;color:var(--fw-rust);font-weight:700;flex-shrink:0;padding-top:1px;">${formatTime(caption.startTime)}</span><span style="font-size:11px;line-height:1.45;">${displayText}</span>`;
    el.addEventListener("click", () => seekTo(caption.startTime));
    container.appendChild(el);
  });
}

function updateInjectBtn() {
  const btn = document.getElementById("caption-inject-btn");
  if (!btn) return;
  btn.textContent = captionsInjected ? "Captions on - hide" : "Add captions to video";
  btn.style.background = captionsInjected ? "var(--fw-ok)" : "";
}

function updateTranslatedToggle() {
  const hasTranslation = currentCaptions.some((c) => c.translatedText);
  const row = document.getElementById("caption-translated-toggle-row");
  if (!row) return;
  row.style.display = hasTranslation ? "block" : "none";
  const btn = document.getElementById("caption-show-translated-btn");
  if (btn && hasTranslation) {
    const lang = currentCaptions.find((c) => c.translatedLanguage)?.translatedLanguage || "Translated";
    btn.textContent = captionsShowTranslated ? "Show original" : `Show in ${lang}`;
  }
}

async function injectCurrentCaptions(captions = currentCaptions) {
  currentCaptions = captions;
  captionsInjected = true;
  await chrome.storage.session.set({
    framewiseCaptions: captions,
    framewiseCaptionsActive: true,
    framewiseCaptionsTranslated: captionsShowTranslated,
  });
  await sendCaptionMessageToActiveTab(true, captions);
  await sendCaptionMessageToActiveTab(captionsInjected, currentCaptions);
  updateInjectBtn();
}

document.getElementById("caption-inject-btn").addEventListener("click", async () => {
  captionsInjected = !captionsInjected;
  await chrome.storage.session.set({
    framewiseCaptions: currentCaptions,
    framewiseCaptionsActive: captionsInjected,
    framewiseCaptionsTranslated: captionsShowTranslated,
  });
  updateInjectBtn();
  document.getElementById("status").textContent = captionsInjected ? "Captions injected ✓" : "Captions hidden";
});

document.getElementById("caption-translate-toggle-btn").addEventListener("click", () => {
  const row = document.getElementById("caption-translate-row");
  row.style.display = row.style.display === "none" ? "grid" : "none";
});

document.getElementById("caption-translate-btn").addEventListener("click", async () => {
  const language = document.getElementById("caption-lang-input").value.trim();
  if (!language || !currentVideoId) return;
  const btn = document.getElementById("caption-translate-btn");
  const status = document.getElementById("status");
  btn.disabled = true;
  btn.textContent = "…";
  status.textContent = `Translating to ${language}…`;
  try {
    const data = await apiFetch(`/videos/${currentVideoId}/captions/translate`, "POST", { language });
    renderCaptions(data.captions);
    captionsShowTranslated = true;
    await chrome.storage.session.set({ framewiseCaptionsTranslated: true });
    if (captionsInjected) {
      await chrome.storage.session.set({ framewiseCaptions: data.captions, framewiseCaptionsActive: true });
      await sendCaptionMessageToActiveTab(true, data.captions);
    }
    status.textContent = `Translated to ${language}`;
    updateTranslatedToggle();
  } catch (e) {
    status.textContent = "Translation error: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Go";
  }
});

document.getElementById("caption-show-translated-btn").addEventListener("click", async () => {
  captionsShowTranslated = !captionsShowTranslated;
  await chrome.storage.session.set({ framewiseCaptionsTranslated: captionsShowTranslated });
  if (captionsInjected) {
    await chrome.storage.session.set({ framewiseCaptions: currentCaptions, framewiseCaptionsActive: true });
    await sendCaptionMessageToActiveTab(true, currentCaptions);
  }
  renderCaptions(currentCaptions);
});

async function sendCaptionMessageToActiveTab(active, captions) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "FRAMEWISE_CAPTIONS_SET",
    captions,
    active,
    translated: captionsShowTranslated,
  }).catch(() => {});

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: installFramewiseCaptionOverlay,
    args: [captions, active, captionsShowTranslated],
  }).catch(() => {});
}

function installFramewiseCaptionOverlay(captions, active, translated) {
  const normalize = (items) => (Array.isArray(items) ? items : [])
    .map((caption) => {
      const startTime = Number(caption.startTime) || 0;
      const endTime = Number(caption.endTime) > startTime
        ? Number(caption.endTime)
        : startTime + 0.5;
      const text = translated && caption.translatedText
        ? caption.translatedText
        : (caption.correctedText || caption.text || "");
      return { startTime, endTime, text };
    })
    .filter((caption) => caption.text.trim())
    .sort((a, b) => a.startTime - b.startTime);

  window.__framewiseCaptionOverlayState = {
    captions: normalize(captions),
    active: !!active,
  };

  let overlay = document.getElementById("framewise-direct-caption-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "framewise-direct-caption-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:96px",
      "transform:translateX(-50%)",
      "max-width:min(820px,88vw)",
      "padding:.24em .58em .28em",
      "border-radius:6px",
      "background:rgba(14,8,5,.74)",
      "color:#fff7ed",
      "font:700 clamp(16px,2.5vw,28px)/1.28 Roboto,Arial,sans-serif",
      "text-align:center",
      "text-shadow:0 1px 2px rgba(0,0,0,.95),0 2px 10px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,1)",
      "box-shadow:0 12px 30px rgba(0,0,0,.34)",
      "backdrop-filter:blur(4px)",
      "z-index:2147483647",
      "pointer-events:none",
      "white-space:pre-line",
      "display:none",
    ].join(";");
    document.documentElement.appendChild(overlay);
  }

  const nativeHideId = "framewise-direct-hide-native-captions";
  let nativeHide = document.getElementById(nativeHideId);
  if (active && !nativeHide) {
    nativeHide = document.createElement("style");
    nativeHide.id = nativeHideId;
    nativeHide.textContent = [
      ".ytp-caption-window-container,.caption-window{display:none!important;opacity:0!important;visibility:hidden!important;}",
      '.ytp-menuitem[data-framewise-caption-hidden="true"]{display:none!important;}',
    ].join("\n");
    document.documentElement.appendChild(nativeHide);
  }
  if (!active && nativeHide) nativeHide.remove();

  if (active) {
    document.querySelectorAll(".ytp-menuitem").forEach((item) => {
      const label = item.querySelector(".ytp-menuitem-label");
      if (label && /subtitles|closed captions/i.test(label.textContent || "")) {
        item.setAttribute("data-framewise-caption-hidden", "true");
      }
    });
  } else {
    document.querySelectorAll("[data-framewise-caption-hidden]").forEach((item) => {
      item.removeAttribute("data-framewise-caption-hidden");
    });
  }

  if (window.__framewiseCaptionOverlayRaf) {
    cancelAnimationFrame(window.__framewiseCaptionOverlayRaf);
  }

  const captionsUiEnabled = () => {
    const button = document.querySelector(".ytp-subtitles-button") || document.querySelector('[aria-keyshortcuts="c"]');
    if (!button) return true;

    const ariaPressed = button.getAttribute("aria-pressed");
    const ariaChecked = button.getAttribute("aria-checked");
    if (ariaPressed === "true" || ariaChecked === "true") return true;
    if (ariaPressed === "false" || ariaChecked === "false") return false;

    const label = button.getAttribute("title") || button.getAttribute("aria-label") || button.textContent || "";
    if (/captions.*off|subtitles.*off/i.test(label)) return true;
    if (/captions.*on|subtitles.*on/i.test(label)) return false;
    return true;
  };

  const renderFramewiseCaption = () => {
    const state = window.__framewiseCaptionOverlayState;
    const video = document.querySelector("video");
    const el = document.getElementById("framewise-direct-caption-overlay");
    if (!el || !state?.active || !video || !state.captions.length) {
      if (el) el.style.display = "none";
      window.__framewiseCaptionOverlayRaf = requestAnimationFrame(renderFramewiseCaption);
      return;
    }

    if (!captionsUiEnabled()) {
      el.style.display = "none";
      window.__framewiseCaptionOverlayRaf = requestAnimationFrame(renderFramewiseCaption);
      return;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.bottom = `${Math.max(24, window.innerHeight - rect.bottom + rect.height * 0.11)}px`;
      el.style.maxWidth = `${Math.max(240, rect.width * 0.92)}px`;
    }

    const now = video.currentTime + 0.06;
    const caption = state.captions.find((item) => now >= item.startTime && now < item.endTime);
    if (caption) {
      el.textContent = caption.text;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
    window.__framewiseCaptionOverlayRaf = requestAnimationFrame(renderFramewiseCaption);
  };

  window.__framewiseCaptionOverlayRaf = requestAnimationFrame(renderFramewiseCaption);
}

function appendMessage(msg) {
  const chips = document.getElementById("chat-chips");
  if (chips && chips.style.display !== "none") chips.style.display = "none";
  const area = document.getElementById("chat-area");
  const el = document.createElement("div");
  el.className = `msg ${msg.role}`;

  // Render **bold** and newlines; content is HTML-escaped first to prevent XSS
  el.innerHTML = escapeHtml(msg.content || "")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  if (msg.linkedSegmentTime != null) {
    const btn = document.createElement("button");
    btn.className = "fw-jump-btn";
    btn.textContent = `▶ ${formatTime(msg.linkedSegmentTime)}`;
    btn.addEventListener("click", () => seekTo(msg.linkedSegmentTime));
    el.appendChild(btn);
  }
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

// ── Chat action dispatch ───────────────────────────────────────────────────────
async function dispatchChatAction(msg) {
  if (!msg.action || !currentVideoId) return;
  const status = document.getElementById("status");
  try {
    if (msg.action === "generate_captions") {
      status.textContent = "Generating captions…";
      const data = await apiFetch(`/videos/${currentVideoId}/captions/generate`, "POST");
      renderCaptions(data.captions);
      captionsInjected = false;
      await chrome.storage.session.set({ framewiseCaptions: data.captions, framewiseCaptionsActive: false });
      openSection("captions");
      status.textContent = `${data.count} captions ready`;
    } else if (msg.action === "translate_captions") {
      const language = msg.actionParams?.language || "Spanish";
      if (!currentCaptions.length) { status.textContent = "Generate captions first."; return; }
      status.textContent = `Translating to ${language}…`;
      const data = await apiFetch(`/videos/${currentVideoId}/captions/translate`, "POST", { language });
      captionsShowTranslated = true;
      renderCaptions(data.captions);
      openSection("captions");
      status.textContent = `Translated to ${language}`;
    } else if (msg.action === "generate_quiz") {
      status.textContent = "Generating quiz…";
      const data = await apiFetch(`/videos/${currentVideoId}/quiz`, "POST");
      if (data.quiz?.length) {
        appendMessage({ role: "assistant", content: `Here are ${data.quiz.length} quiz questions:\n\n` + data.quiz.map((q, i) => `${i + 1}. ${q.question}`).join("\n") });
      }
      status.textContent = "Quiz ready";
    }
  } catch (e) {
    status.textContent = "Action error: " + e.message;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function seekTo(seconds) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (s) => {
      const video = document.querySelector("video");
      if (video) video.currentTime = s;
    },
    args: [seconds],
  });
}

function isAuthError(e) {
  return e.status === 401
    || e.message.includes("401")
    || e.message.includes("Unauthorized")
    || e.message.includes("Invalid or expired token")
    || e.message.includes("No token provided");
}

async function clearToken() {
  token = null;
  await chrome.storage.local.remove("fw_token");
}

async function apiFetch(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiFetchRaw(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.arrayBuffer();
}

function formatTime(s) {
  const total = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Extension Pose Tracking ───────────────────────────────────────────────────

const EXT_POSE = {
  detector: null,
  stream: null,
  raf: null,
  active: false,
  ready: false,
  lastKp: 0,
  snapCooldown: 0,
  reviews: [],
};

// BlazePose 33-keypoint adjacency list
const POSE_CONNECTIONS = [
  // Face
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
  // Shoulders + mouth
  [9,10],[11,12],
  // Left arm
  [11,13],[13,15],[15,17],[15,19],[15,21],[17,19],
  // Right arm
  [12,14],[14,16],[16,18],[16,20],[16,22],[18,20],
  // Torso
  [11,23],[12,24],[23,24],
  // Left leg
  [23,25],[25,27],[27,29],[29,31],[27,31],
  // Right leg
  [24,26],[26,28],[28,30],[30,32],[28,32],
];

function extPoseDrawSkeleton(ctx, keypoints, cw, ch, srcW, srcH) {
  const scaleX = cw / srcW;
  const scaleY = ch / srcH;

  const pts = keypoints.map(kp => ({
    x: kp.x * scaleX,
    y: kp.y * scaleY,
    score: kp.score || 0,
  }));

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(181,204,146,0.8)";
  for (const [a, b] of POSE_CONNECTIONS) {
    if (pts[a]?.score > 0.3 && pts[b]?.score > 0.3) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
  }

  for (const pt of pts) {
    if (pt.score > 0.3) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(197,106,67,0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(251,241,214,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

async function extPoseInit() {
  const btn = document.getElementById("ext-pose-btn");
  try {
    // Disable threaded-SIMD build: it spawns a blob: Web Worker which the MV3
    // extension CSP blocks (blob: is not 'self'). Non-threaded SIMD still works.
    tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
    tf.wasm.setWasmPaths(chrome.runtime.getURL("lib/"));
    await tf.setBackend("wasm");
    await tf.ready();

    EXT_POSE.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      {
        runtime: "tfjs",
        modelType: "heavy",
        enableSmoothing: true,
        enableSegmentation: false,
      }
    );
    EXT_POSE.ready = true;
    btn.textContent = "Start webcam";
    btn.disabled = false;

    // Load move classifier (no-op if model not yet bundled)
    if (window.MoveClassifier) window.MoveClassifier.init();
  } catch (e) {
    console.warn("Ext pose init failed:", e);
    btn.textContent = "Unavailable";
    btn.disabled = true;
  }
}

async function extPoseStart() {
  const btn = document.getElementById("ext-pose-btn");
  const camWrap = document.getElementById("ext-pose-cam-wrap");
  const idle = document.getElementById("ext-pose-idle");
  const video = document.getElementById("ext-pose-video");

  btn.disabled = true;
  btn.textContent = "Starting…";
  camWrap.classList.add("visible");

  try {
    EXT_POSE.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
      audio: false,
    });
    video.srcObject = EXT_POSE.stream;
    await video.play();
    idle.style.display = "none";

    EXT_POSE.active = true;
    btn.textContent = "Stop webcam";
    btn.classList.add("active");
    btn.disabled = false;

    extPoseLoop();
  } catch (e) {
    camWrap.classList.remove("visible");
    btn.textContent = "Start webcam";
    btn.disabled = false;
    idle.style.display = "";
    console.warn("Webcam access denied:", e);
  }
}

function extPoseStop() {
  EXT_POSE.active = false;
  if (EXT_POSE.raf) { cancelAnimationFrame(EXT_POSE.raf); EXT_POSE.raf = null; }
  if (EXT_POSE.stream) { EXT_POSE.stream.getTracks().forEach(t => t.stop()); EXT_POSE.stream = null; }

  const video = document.getElementById("ext-pose-video");
  if (video) { video.srcObject = null; }
  const camWrap = document.getElementById("ext-pose-cam-wrap");
  if (camWrap) camWrap.classList.remove("visible");
  const canvas = document.getElementById("ext-pose-canvas");
  if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);

  const btn = document.getElementById("ext-pose-btn");
  if (btn) { btn.textContent = "Start webcam"; btn.classList.remove("active"); }

  extPoseUpdateKpPill(0, false);
  extPoseUpdateMoveLabel(null);
  if (window.MoveClassifier) window.MoveClassifier.reset();
}

let extPoseLastFrameTime = 0;
const EXT_POSE_FPS = 10; // lightweight: 10 fps in the sidebar

async function extPoseLoop() {
  if (!EXT_POSE.active) return;

  const now = performance.now();
  if (now - extPoseLastFrameTime < 1000 / EXT_POSE_FPS) {
    EXT_POSE.raf = requestAnimationFrame(extPoseLoop);
    return;
  }
  extPoseLastFrameTime = now;

  const video = document.getElementById("ext-pose-video");
  const canvas = document.getElementById("ext-pose-canvas");
  if (!video || !canvas || video.readyState < 2) {
    EXT_POSE.raf = requestAnimationFrame(extPoseLoop);
    return;
  }

  // Sync canvas size to display size
  const { offsetWidth: cw, offsetHeight: ch } = canvas;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw || 320;
    canvas.height = ch || 240;
  }

  try {
    const poses = await EXT_POSE.detector.estimatePoses(video);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (poses?.[0]?.keypoints) {
      const pose = poses[0];
      const kp   = pose.keypoints;
      const count = kp.filter(p => (p.score || 0) > 0.3).length;
      EXT_POSE.lastKp = count;
      extPoseUpdateKpPill(count, true);
      extPoseDrawSkeleton(ctx, kp, canvas.width, canvas.height, video.videoWidth, video.videoHeight);

      // Feature extraction + move classification
      if (window.PoseFeatures && window.MoveClassifier) {
        const src = pose.keypoints3D || kp;
        const feat = window.PoseFeatures.extract(src);
        if (feat) {
          window.MoveClassifier.feed(feat);
          // Classify every 6 frames (~10fps / 6 ≈ 1.7s cadence)
          EXT_POSE.classifyTick = ((EXT_POSE.classifyTick || 0) + 1) % 6;
          if (EXT_POSE.classifyTick === 0) {
            window.MoveClassifier.classify().then((result) => {
              extPoseUpdateMoveLabel(result);
            });
          }
        }
      }
    } else {
      extPoseUpdateKpPill(0, true);
    }
  } catch {}

  EXT_POSE.raf = requestAnimationFrame(extPoseLoop);
}

function extPoseUpdateKpPill(count, active) {
  const dot = document.getElementById("ext-pose-kp-dot");
  const label = document.getElementById("ext-pose-kp-label");
  if (!dot || !label) return;
  dot.className = "ext-pose-kp-dot" + (active && count > 8 ? " active" : "");
  label.textContent = active ? `${count}/33 joints` : "—";
}

function extPoseUpdateMoveLabel(result) {
  const el = document.getElementById("ext-move-label");
  if (!el) return;
  if (!result) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";
  el.querySelector(".ext-move-name").textContent = result.moveName;
  const confEl = el.querySelector(".ext-move-conf");
  if (confEl) confEl.textContent = result.confidence ? `${result.confidence}%` : "";
  const catEl = el.querySelector(".ext-move-cat");
  if (catEl) catEl.textContent = result.moveCategory || "";
}

function extPoseSnapSchedule(videoTimeSec) {
  if (!EXT_POSE.active) return;
  const now = Date.now();
  if (now < EXT_POSE.snapCooldown) return;
  EXT_POSE.snapCooldown = now + 8_000; // at most one snap per 8 seconds

  // Delay snap by 2s to let the user settle into the pose
  setTimeout(() => {
    if (!EXT_POSE.active) return;
    extPoseAddReview(videoTimeSec, EXT_POSE.lastKp);
  }, 2000);
}

function extPoseAddReview(videoTimeSec, jointCount) {
  const quality = jointCount >= 28 ? "great" : jointCount >= 20 ? "good" : jointCount >= 12 ? "ok" : "low";
  const fill = Math.round((jointCount / 33) * 100);
  const colors = { great: "#B5CC92", good: "#F5C36C", ok: "#E0A882", low: "#C56A43" };

  EXT_POSE.reviews.unshift({ ts: videoTimeSec, joints: jointCount, quality, fill, color: colors[quality] });
  if (EXT_POSE.reviews.length > 6) EXT_POSE.reviews.pop();

  const list = document.getElementById("ext-reviews-list");
  const empty = document.getElementById("ext-reviews-empty");
  if (!list) return;
  if (empty) empty.style.display = "none";

  list.innerHTML = EXT_POSE.reviews.map(r => `
    <div class="ext-review-card">
      <span class="ext-review-ts">${formatTime(r.ts)}</span>
      <div class="ext-review-bar">
        <div class="ext-review-fill" style="width:${r.fill}%;background:${r.color}"></div>
      </div>
      <span class="ext-review-score">${r.joints}/33</span>
    </div>
  `).join("");
}

// Wire up the pose button
document.getElementById("ext-pose-btn").addEventListener("click", () => {
  if (!EXT_POSE.ready) return;
  if (EXT_POSE.active) {
    extPoseStop();
  } else {
    extPoseStart();
  }
});

// Start loading TF.js + MoveNet as soon as the panel is ready
// (loads in background — doesn't block UI)
if (window.tf && window.poseDetection) {
  extPoseInit();
} else {
  // Scripts may not be loaded yet — wait for them
  window.addEventListener("load", () => {
    if (window.tf && window.poseDetection) extPoseInit();
    else {
      const btn = document.getElementById("ext-pose-btn");
      if (btn) { btn.textContent = "Model unavailable"; btn.disabled = true; }
    }
  });
}

// Open YouTube when no video is detected
document.getElementById("browse-youtube-btn")?.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.youtube.com" });
});

// Re-detect video when panel becomes visible (user switched back to a YT tab)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || currentVideoUrl) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes("youtube.com/watch") || tab?.url?.includes("youtube.com/shorts/")) {
      const vidKey = getVideoKey(tab.url);
      setVideo(tab.url, tab.title, null, vidKey);
      try { await loadCachedAnalysis(tab.url); } catch {}
    }
  } catch {}
});

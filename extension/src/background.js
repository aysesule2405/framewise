// background.js — Manifest V3 service worker
importScripts('./config.js'); // provides FW_API, FW_APP globals
const API = FW_API;

// Allow content scripts to read/write session storage.
// By default chrome.storage.session is blocked in content script contexts.
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Detect YouTube video on tab activation
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    handleTab(tab);
  } catch {}
});

// Detect YouTube video on tab URL change
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") handleTab(tab);
});

function isYouTubeVideoUrl(url) {
  if (!url) return false;
  return url.includes("youtube.com/watch") || url.includes("youtube.com/shorts/");
}

async function handleTab(tab) {
  if (isYouTubeVideoUrl(tab?.url)) {
    const videoKey = getYouTubeVideoKey(tab.url);
    const previous = await chrome.storage.session.get("currentVideoKey");
    const isNewVideo = previous.currentVideoKey && previous.currentVideoKey !== videoKey;
    await chrome.storage.session.set({
      currentVideoUrl: tab.url,
      currentVideoTitle: tab.title || tab.url,
      currentVideoKey: videoKey,
      ...(isNewVideo ? {
        framewiseCaptions: [],
        framewiseCaptionsActive: false,
        framewiseCaptionsTranslated: false,
        framewiseSegments: [],
        framewiseExistingVideoId: null,
        framewiseResumeAt: null,
      } : {}),
    });
    checkExistingAnalysis(tab.url, videoKey);
  } else {
    chrome.storage.session.set({
      currentVideoUrl: null,
      currentVideoTitle: null,
      currentVideoDuration: null,
      framewiseExistingVideoId: null,
      framewiseSegments: [],
      framewiseCaptions: [],
      framewiseCaptionsActive: false,
      framewiseCaptionsTranslated: false,
      framewiseResumeAt: null,
    });
  }
}

function getYouTubeVideoKey(url) {
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

async function checkExistingAnalysis(url, videoKey = getYouTubeVideoKey(url)) {
  try {
    const { fw_token: token } = await chrome.storage.local.get("fw_token");
    if (!token) return;

    const res = await fetch(`${API}/videos/lookup?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { currentVideoKey } = await chrome.storage.session.get("currentVideoKey");
    if (currentVideoKey !== videoKey) return;

    if (!res.ok) {
      await chrome.storage.session.set({ framewiseExistingVideoId: null, framewiseSegments: [] });
      return;
    }

    const data = await res.json();
    await chrome.storage.session.set({
      framewiseExistingVideoId: data.video._id,
      framewiseSegments: data.segments.map((s) => ({ startTime: s.startTime, title: s.title })),
      framewiseResumeAt: data.video.lastPositionSeconds || null,
    });
  } catch {}
}

async function saveProgress(videoId, positionSeconds) {
  if (!videoId || !positionSeconds || positionSeconds < 1) return;
  try {
    const { fw_token: token } = await chrome.storage.local.get("fw_token");
    if (!token) return;
    await fetch(`${API}/videos/${videoId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ positionSeconds }),
    });
  } catch {}
}

// Forward messages from content.js (fallback)
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "VIDEO_DETECTED") {
    chrome.storage.session.set({
      currentVideoUrl: message.url,
      currentVideoTitle: message.title,
      currentVideoDuration: message.durationSeconds || null,
      currentVideoKey: message.videoKey || getYouTubeVideoKey(message.url),
      currentVideoSrc: message.currentSrc || null,
      currentVideoPlatform: message.platform || null,
    });
    checkExistingAnalysis(message.url, message.videoKey || getYouTubeVideoKey(message.url));
  }
  if (message.type === "VIDEO_PROGRESS") {
    chrome.storage.session.get("framewiseExistingVideoId", ({ framewiseExistingVideoId }) => {
      saveProgress(framewiseExistingVideoId, Math.floor(message.positionSeconds || 0));
    });
  }
  if (message.type === "REQUEST_TAB_CAPTURE") {
    handleTabCapture(message).catch((err) => {
      chrome.runtime.sendMessage({
        type: "TAB_CAPTURE_ERROR",
        error: err.message || "Tab capture setup failed",
      });
    });
  }
  // Close offscreen document when capture finishes or errors
  if (message.type === "TAB_CAPTURE_DONE" || message.type === "TAB_CAPTURE_ERROR") {
    chrome.offscreen.closeDocument().catch(() => {});
  }
});

async function handleTabCapture({ apiUrl, url, title, source, maxDuration, tabId }) {
  // Ensure only one offscreen document exists at a time
  const existing = await chrome.offscreen.hasDocument().catch(() => false);
  if (existing) await chrome.offscreen.closeDocument().catch(() => {});

  // Get streamId for the target tab
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]?.id));
  if (!targetTabId) throw new Error("No target tab found");

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId });

  // Create the offscreen document that will do the actual recording
  await chrome.offscreen.createDocument({
    url: "src/offscreen/offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record tab video/audio for Framewise analysis",
  });

  // Forward capture params + streamId to the offscreen document
  // Small delay to let the offscreen document's listener register
  await new Promise((r) => setTimeout(r, 200));
  chrome.runtime.sendMessage({
    type: "START_TAB_CAPTURE",
    streamId,
    apiUrl,
    url,
    title,
    source,
    maxDuration,
  });
}

// Relay STOP_CAPTURE from panel → offscreen (panel sends STOP_CAPTURE via content script,
// but for TikTok there is no content script recorder — relay as STOP_TAB_CAPTURE)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "RELAY_STOP_TAB_CAPTURE") {
    chrome.runtime.sendMessage({ type: "STOP_TAB_CAPTURE" }).catch(() => {});
  }
});

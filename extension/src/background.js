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

async function handleTab(tab) {
  if (tab?.url?.includes("youtube.com/watch")) {
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
    return new URL(url).searchParams.get("v") || url;
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
    });
    checkExistingAnalysis(message.url, message.videoKey || getYouTubeVideoKey(message.url));
  }
  if (message.type === "VIDEO_PROGRESS") {
    chrome.storage.session.get("framewiseExistingVideoId", ({ framewiseExistingVideoId }) => {
      saveProgress(framewiseExistingVideoId, Math.floor(message.positionSeconds || 0));
    });
  }
});

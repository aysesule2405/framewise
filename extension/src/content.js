// content.js — injected into YouTube watch pages
// ── All module-level state declared first (avoids temporal dead zone in teardown) ──
var torn = false;
var lastNotifiedUrl = null;
var lastVideoId = null;
var notifyTimer = null;
var pageObserver = null;
var seekBarObserver = null;
var overlayMarkers = [];
var pendingSegments = [];
var lastProgressSent = 0;
var lastResumeAt = null;

// Caption overlay state
var captionOverlayEl = null;  // container div
var captionTextEl = null;  // inner text div
var captionRafId = null;  // requestAnimationFrame handle
var captionData = [];
var captionsActive = false;
var captionShowTranslated = false;
var captionHideStyleId = "fw-hide-native-captions";
var captionSettingsHideStyleId = "fw-hide-native-caption-settings";

// ── Extension context guard ────────────────────────────────────────────────────
function isContextAlive() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function removeLegacyPoseButton() {
  var legacyButton = document.getElementById("framewise-dance-pose-btn");
  if (legacyButton) legacyButton.remove();
}

function teardown() {
  try {
    if (torn) return;
    torn = true;
    if (pageObserver) pageObserver.disconnect();
    if (seekBarObserver) seekBarObserver.disconnect();
    clearTimeout(notifyTimer);
    removeCaptionOverlay();
    removeCaptionOverlay();
    clearMarkers();
  } catch { }
}

function safeChrome(fn) {
  if (!isContextAlive()) { teardown(); return; }
  try { fn(); } catch { }
}

// ── Video detection ────────────────────────────────────────────────────────────
function safeNotifyBackground() {
  var url = window.location.href;
  if (!url.includes("youtube.com/watch")) return;

  var videoId = getYouTubeVideoId(url);
  var title = document.title;
  var video = document.querySelector("video");
  var dur = video && Number.isFinite(video.duration) ? Math.floor(video.duration) : null;

  if (url === lastNotifiedUrl && videoId === lastVideoId && dur === null) return;
  lastNotifiedUrl = url;
  lastVideoId = videoId;

  // re-init UI on video change

  safeChrome(function () {
    chrome.runtime.sendMessage(
      { type: "VIDEO_DETECTED", url: url, title: title, durationSeconds: dur, videoKey: videoId },
      function () { void chrome.runtime.lastError; }
    );
  });
}

function getYouTubeVideoId(url) {
  try {
    return new URL(url).searchParams.get("v") || url;
  } catch {
    return url;
  }
}

function scheduleNotify() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(safeNotifyBackground, 800);
}

function initContentScript() {
  if (torn) return;
  removeLegacyPoseButton();
  
  safeNotifyBackground();

  // Always observe, even if body is not ready yet (will retry via scheduleNotify)
  if (!pageObserver && document.body) {
    pageObserver = new MutationObserver(function () {
      if (!isContextAlive()) { teardown(); return; }
      removeLegacyPoseButton();
      var currentId = getYouTubeVideoId(window.location.href);
      if (window.location.href !== lastNotifiedUrl || currentId !== lastVideoId) scheduleNotify();
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// Immediate run
initContentScript();
// Fallback run
document.addEventListener("DOMContentLoaded", initContentScript);
window.addEventListener("load", initContentScript);

window.addEventListener("yt-navigate-finish", scheduleNotify);
window.addEventListener("popstate", scheduleNotify);

document.addEventListener("loadedmetadata", function (event) {
  if (event.target && event.target.tagName === "VIDEO") safeNotifyBackground();
}, true);

setInterval(function () {
  var video = document.querySelector("video");
  if (!video || !isFinite(video.currentTime)) return;
  var position = Math.floor(video.currentTime);
  if (position < 1 || Math.abs(position - lastProgressSent) < 8) return;
  lastProgressSent = position;
  safeChrome(function () {
    chrome.runtime.sendMessage(
      { type: "VIDEO_PROGRESS", positionSeconds: position },
      function () { void chrome.runtime.lastError; }
    );
  });
}, 10000);

window.__framewise_seekTo = function (seconds) {
  var video = document.querySelector("video");
  if (video) video.currentTime = seconds;
};

function resumeVideo(seconds) {
  if (!seconds || seconds < 5 || seconds === lastResumeAt) return;
  var video = document.querySelector("video");
  if (!video) return;
  lastResumeAt = seconds;
  video.currentTime = seconds;
}

// ── Caption overlay ────────────────────────────────────────────────────────────

function getCaptionText(caption) {
  if (captionShowTranslated && caption.translatedText) return caption.translatedText;
  return caption.correctedText || caption.text || "";
}

function normalizeCaptions(captions) {
  return (captions || [])
    .map(function (caption) {
      var startTime = Number(caption.startTime);
      var endTime = Number(caption.endTime);
      if (!isFinite(startTime)) startTime = 0;
      if (!isFinite(endTime) || endTime <= startTime) endTime = startTime + 0.25;
      return Object.assign({}, caption, {
        startTime: Math.max(0, startTime),
        endTime: Math.max(startTime + 0.25, endTime),
      });
    })
    .filter(function (caption) { return getCaptionText(caption).trim(); })
    .sort(function (a, b) { return a.startTime - b.startTime; });
}

function findCaptionAtTime(time) {
  var lo = 0;
  var hi = captionData.length - 1;
  var best = null;

  while (lo <= hi) {
    var mid = Math.floor((lo + hi) / 2);
    var caption = captionData[mid];
    if (time < caption.startTime) {
      hi = mid - 1;
    } else {
      best = caption;
      lo = mid + 1;
    }
  }

  return best && time >= best.startTime && time < best.endTime ? best : null;
}

function getSubtitlesButton() {
  return (
    document.querySelector(".ytp-subtitles-button") ||
    document.querySelector('[aria-keyshortcuts="c"]')
  );
}

function areYouTubeCaptionsEnabled() {
  var button = getSubtitlesButton();
  if (!button) return true;

  var ariaPressed = button.getAttribute("aria-pressed");
  var ariaChecked = button.getAttribute("aria-checked");

  if (ariaPressed === "true" || ariaChecked === "true") return true;
  if (ariaPressed === "false" || ariaChecked === "false") return false;

  var label =
    button.getAttribute("title") ||
    button.getAttribute("aria-label") ||
    button.textContent ||
    "";

  if (/captions.*off|subtitles.*off/i.test(label)) return true;
  if (/captions.*on|subtitles.*on/i.test(label)) return false;
  return true;
}

// Hide YouTube's native captions so they don't overlap ours
function hideNativeCaptions() {
  if (document.getElementById(captionHideStyleId)) return;
  var style = document.createElement("style");
  style.id = captionHideStyleId;
  style.textContent =
    ".ytp-caption-window-container, .caption-window.ytp-caption-window-bottom { display: none !important; opacity: 0 !important; visibility: hidden !important; }";
  document.documentElement.appendChild(style);
}

function showNativeCaptions() {
  var el = document.getElementById(captionHideStyleId);
  if (el) el.remove();
}

function hideSubtitleSettingsMenuItems() {
  if (!document.getElementById(captionSettingsHideStyleId)) {
    var style = document.createElement("style");
    style.id = captionSettingsHideStyleId;
    style.textContent =
      '.ytp-menuitem[data-framewise-caption-hidden="true"] { display: none !important; }';
    document.documentElement.appendChild(style);
  }

  var items = document.querySelectorAll(".ytp-menuitem");
  for (var i = 0; i < items.length; i += 1) {
    var label = items[i].querySelector(".ytp-menuitem-label");
    if (label && /subtitles|closed captions/i.test(label.textContent || "")) {
      items[i].setAttribute("data-framewise-caption-hidden", "true");
    }
  }
}

function showSubtitleSettingsMenuItems() {
  var style = document.getElementById(captionSettingsHideStyleId);
  if (style) style.remove();

  var items = document.querySelectorAll("[data-framewise-caption-hidden]");
  for (var i = 0; i < items.length; i += 1) {
    items[i].removeAttribute("data-framewise-caption-hidden");
  }
}

function createCaptionOverlay() {
  if (captionOverlayEl) return;
  var player = document.querySelector(".html5-video-player");
  if (!player) return;

  // Outer container — spans full width, positions text centrally
  captionOverlayEl = document.createElement("div");
  captionOverlayEl.id = "fw-caption-overlay";
  Object.assign(captionOverlayEl.style, {
    position: "absolute",
    left: "0", right: "0",
    bottom: "11%",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: "10000",
    padding: "0 18px",
    boxSizing: "border-box",
  });

  // Inner text element, adapted from the better-youtube-captions overlay.
  captionTextEl = document.createElement("div");
  Object.assign(captionTextEl.style, {
    maxWidth: "min(920px, 92%)",
    padding: "0.24em 0.58em 0.28em",
    fontSize: "clamp(16px, 2.5vw, 28px)",
    fontFamily: "'YouTube Noto', Roboto, Arial, sans-serif",
    fontWeight: "700",
    lineHeight: "1.28",
    whiteSpace: "pre-line",
    textAlign: "center",
    color: "#fff7ed",
    textShadow: "0 1px 2px rgba(0,0,0,.95), 0 2px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,1)",
    background: "rgba(14, 8, 5, 0.72)",
    borderRadius: "6px",
    boxShadow: "0 12px 30px rgba(0,0,0,.34)",
    backdropFilter: "blur(4px)",
    letterSpacing: "0",
    visibility: "hidden",
  });

  captionOverlayEl.appendChild(captionTextEl);
  player.appendChild(captionOverlayEl);
}

function removeCaptionOverlay() {
  stopCaptionLoop();
  if (captionOverlayEl) { captionOverlayEl.remove(); captionOverlayEl = null; }
  captionTextEl = null;
  showNativeCaptions();
  showSubtitleSettingsMenuItems();
}

function setCaptionOverlayState(captions, active, translated) {
  captionData = normalizeCaptions(captions || []);
  captionsActive = !!active;
  captionShowTranslated = !!translated;
  tryInitCaptions(0);
  applyCaptionState();
}

// requestAnimationFrame render loop — smoother than timeupdate
function captionRenderLoop() {
  if (!captionTextEl || !captionsActive || !captionData.length) {
    if (captionTextEl) captionTextEl.style.visibility = "hidden";
    captionRafId = requestAnimationFrame(captionRenderLoop);
    return;
  }

  var video = document.querySelector("video");
  if (!video) {
    captionTextEl.style.visibility = "hidden";
    captionRafId = requestAnimationFrame(captionRenderLoop);
    return;
  }

  if (!areYouTubeCaptionsEnabled()) {
    showNativeCaptions();
    captionTextEl.textContent = "";
    captionTextEl.style.visibility = "hidden";
    captionRafId = requestAnimationFrame(captionRenderLoop);
    return;
  }

  hideNativeCaptions();
  hideSubtitleSettingsMenuItems();

  var t = video.currentTime + 0.06;
  var caption = findCaptionAtTime(t);

  if (caption) {
    var txt = getCaptionText(caption);
    if (captionTextEl.textContent !== txt) captionTextEl.textContent = txt;
    captionTextEl.style.visibility = "visible";
  } else {
    if (captionTextEl.textContent !== "") captionTextEl.textContent = "";
    captionTextEl.style.visibility = "hidden";
  }

  captionRafId = requestAnimationFrame(captionRenderLoop);
}

function startCaptionLoop() {
  if (captionRafId) return;
  captionRafId = requestAnimationFrame(captionRenderLoop);
}

function stopCaptionLoop() {
  if (captionRafId) { cancelAnimationFrame(captionRafId); captionRafId = null; }
}

function applyCaptionState() {
  if (captionsActive && captionData.length > 0) {
    createCaptionOverlay();
    hideNativeCaptions();
    hideSubtitleSettingsMenuItems();
    startCaptionLoop();
  } else {
    stopCaptionLoop();
    if (captionTextEl) captionTextEl.style.visibility = "hidden";
    if (!captionsActive) showNativeCaptions();
    if (!captionsActive) showSubtitleSettingsMenuItems();
  }
}

function tryInitCaptions(attempt) {
  attempt = attempt || 0;
  if (!isContextAlive()) return;
  var player = document.querySelector(".html5-video-player");
  var video = document.querySelector("video");
  if (player && video) {
    applyCaptionState();
  } else if (attempt < 15) {
    setTimeout(function () { tryInitCaptions(attempt + 1); }, 600);
  }
}

safeChrome(function () {
  chrome.storage.session.get(
    ["framewiseCaptions", "framewiseCaptionsActive", "framewiseCaptionsTranslated"],
    function (result) {
      try {
        if (chrome.runtime.lastError || !result) return;
        if (result.framewiseCaptions && result.framewiseCaptions.length) captionData = normalizeCaptions(result.framewiseCaptions);
        captionsActive = !!result.framewiseCaptionsActive;
        captionShowTranslated = !!result.framewiseCaptionsTranslated;
        if (captionData.length && captionsActive) tryInitCaptions(0);
      } catch { }
    }
  );
});

// ── Seek bar overlay ───────────────────────────────────────────────────────────
function formatTime(s) {
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

function clearMarkers() {
  for (var i = 0; i < overlayMarkers.length; i++) overlayMarkers[i].remove();
  overlayMarkers = [];
}

function renderOverlay(segments) {
  clearMarkers();
  if (!segments || !segments.length) return;

  var video = document.querySelector("video");
  var progressBar = document.querySelector(".ytp-progress-bar-container");
  if (!progressBar || !video) return;
  var duration = video.duration;
  if (!duration || !isFinite(duration) || duration === 0) return;

  if (getComputedStyle(progressBar).position === "static") {
    progressBar.style.position = "relative";
  }

  for (var i = 0; i < segments.length; i++) {
    (function (seg) {
      var pct = (seg.startTime / duration) * 100;
      if (pct < 0 || pct > 100) return;

      var marker = document.createElement("div");
      marker.className = "fw-seek-marker";
      Object.assign(marker.style, {
        position: "absolute", left: pct + "%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "10px", height: "10px",
        background: "#C56A43", border: "2px solid rgba(255,242,220,0.85)",
        borderRadius: "50%", zIndex: "100",
        cursor: "pointer", pointerEvents: "auto",
        transition: "transform 0.1s", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      });

      var tooltip = document.createElement("div");
      Object.assign(tooltip.style, {
        position: "absolute", bottom: "18px", left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(14,8,5,0.88)", color: "#fff7ed",
        padding: "4px 8px", borderRadius: "5px",
        fontSize: "11px", whiteSpace: "nowrap",
        pointerEvents: "none", opacity: "0", transition: "opacity 0.15s", zIndex: "101",
      });
      tooltip.textContent = formatTime(seg.startTime) + " · " + seg.title;
      marker.appendChild(tooltip);

      marker.addEventListener("mouseenter", function () {
        marker.style.transform = "translate(-50%, -50%) scale(1.5)";
        tooltip.style.opacity = "1";
      });
      marker.addEventListener("mouseleave", function () {
        marker.style.transform = "translate(-50%, -50%)";
        tooltip.style.opacity = "0";
      });
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        var v = document.querySelector("video");
        if (v) v.currentTime = seg.startTime;
      });

      progressBar.appendChild(marker);
      overlayMarkers.push(marker);
    })(segments[i]);
  }
}

function watchSeekBar(segments) {
  if (seekBarObserver) seekBarObserver.disconnect();
  seekBarObserver = new MutationObserver(function () {
    if (!isContextAlive()) { teardown(); return; }
    var bar = document.querySelector(".ytp-progress-bar-container");
    if (bar && overlayMarkers.length > 0 && !bar.contains(overlayMarkers[0])) {
      renderOverlay(segments);
    }
  });
  seekBarObserver.observe(document.body, { childList: true, subtree: true });
}

function tryRenderWithRetry(segments, attempt) {
  attempt = attempt || 0;
  if (!isContextAlive()) return;
  var bar = document.querySelector(".ytp-progress-bar-container");
  var video = document.querySelector("video");
  if (bar && video && isFinite(video.duration) && video.duration > 0) {
    renderOverlay(segments);
    watchSeekBar(segments);
  } else if (attempt < 15) {
    setTimeout(function () { tryRenderWithRetry(segments, attempt + 1); }, 800);
  }
}

safeChrome(function () {
  chrome.storage.session.get(["framewiseSegments", "framewiseResumeAt"], function (result) {
    try {
      if (chrome.runtime.lastError || !result) return;
      if (result.framewiseSegments && result.framewiseSegments.length) {
        pendingSegments = result.framewiseSegments;
        tryRenderWithRetry(pendingSegments, 0);
      }
      if (result.framewiseResumeAt) {
        setTimeout(function () { resumeVideo(Number(result.framewiseResumeAt) || 0); }, 900);
      }
    } catch { }
  });
});

safeChrome(function () {
  chrome.storage.onChanged.addListener(function (changes, area) {
    try {
      if (!isContextAlive()) { teardown(); return; }
      if (area !== "session") return;

      if (changes.framewiseSegments) {
        var segs = changes.framewiseSegments.newValue || [];
        pendingSegments = segs;
        clearMarkers();
        if (segs.length > 0) tryRenderWithRetry(segs, 0);
      }
      if (changes.framewiseCaptions) {
        captionData = normalizeCaptions(changes.framewiseCaptions.newValue || []);
        applyCaptionState();
      }
      if (changes.framewiseCaptionsActive) {
        captionsActive = !!changes.framewiseCaptionsActive.newValue;
        if (!captionsActive) {
          stopCaptionLoop();
          if (captionTextEl) captionTextEl.style.visibility = "hidden";
          showNativeCaptions();
        } else {
          tryInitCaptions(0);
        }
      }
      if (changes.framewiseCaptionsTranslated) {
        captionShowTranslated = !!changes.framewiseCaptionsTranslated.newValue;
      }
      if (changes.framewiseResumeAt) {
        resumeVideo(Number(changes.framewiseResumeAt.newValue) || 0);
      }
      if (changes.currentVideoUrl) {
        clearMarkers();
        pendingSegments = [];
        captionData = [];
        captionsActive = false;
        removeCaptionOverlay();
      }
    } catch { }
  });
});

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;
    
    if (message.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
    
    if (message.type === "FRAMEWISE_CAPTIONS_SET") {
      if (!message.active || !(message.captions || []).length) {
        captionData = [];
        captionsActive = false;
        removeCaptionOverlay();
      } else {
        setCaptionOverlayState(message.captions || [], message.active, message.translated);
      }
      sendResponse({ ok: true });
    }
  });

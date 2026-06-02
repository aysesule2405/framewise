// offscreen.js — runs in the offscreen document (MV3)
// Handles tab audio/video capture via getUserMedia when captureStream() is blocked (TikTok, DRM)

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_TAB_CAPTURE") {
    handleTabCapture(message).catch((err) => {
      chrome.runtime.sendMessage({
        type: "TAB_CAPTURE_ERROR",
        error: err.message || "Tab capture failed in offscreen document",
      });
    });
  }
});

async function handleTabCapture({ streamId, apiUrl, url, title, source, maxDuration }) {
  const max = (maxDuration || 300) * 1000;

  // Acquire the MediaStream from the tab via the streamId provided by background.js
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });
  } catch (err) {
    throw new Error("getUserMedia failed: " + err.message);
  }

  // Pick best supported mimeType
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 800_000 });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  chrome.runtime.sendMessage({ type: "TAB_CAPTURE_STARTED" });

  await new Promise((resolve, reject) => {
    recorder.onerror = (e) => reject(new Error(e.error?.message || "Recorder error"));
    recorder.onstop = resolve;

    recorder.start(5000); // 5-second timeslice

    // Stop on timeout
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, max);

    // Listen for explicit stop signal from background
    const stopListener = (msg) => {
      if (msg.type === "STOP_TAB_CAPTURE" && recorder.state !== "inactive") {
        recorder.stop();
        chrome.runtime.onMessage.removeListener(stopListener);
      }
    };
    chrome.runtime.onMessage.addListener(stopListener);
  });

  // Stop all tracks to release the tab stream
  stream.getTracks().forEach((t) => t.stop());

  if (!chunks.length) throw new Error("No data captured");

  const blob = new Blob(chunks, { type: mimeType });

  chrome.runtime.sendMessage({ type: "TAB_CAPTURE_UPLOADING" });

  // Get auth token
  const { fw_token: token } = await chrome.storage.local.get("fw_token");
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", blob, "capture.webm");
  formData.append("url", url || "");
  formData.append("title", title || url || "");
  formData.append("source", source || "tiktok");

  const res = await fetch(apiUrl + "/videos/upload-capture", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Upload failed: " + res.status + (text ? " — " + text : ""));
  }

  const data = await res.json();
  chrome.runtime.sendMessage({
    type: "TAB_CAPTURE_DONE",
    jobId: data.jobId,
    videoId: data.videoId,
  });
}

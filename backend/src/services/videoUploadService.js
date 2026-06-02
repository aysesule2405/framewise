// Handles receiving captured video from the extension and preparing it for Gemini.
//
// Two paths:
//   receiveAndUpload    — buffer arrives from the extension (captureStream / tabCapture)
//   directDownloadAndUpload — try to fetch a CDN URL server-side (Vimeo, Canvas, Loom, etc.)
//
// Both paths write a temp file, upload to Gemini File API, then clean up.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");
const { uploadVideoToGemini } = require("./geminiService");

const SUPPORTED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/mpeg",
  "video/mov",
  "video/quicktime",
  "video/avi",
  "video/x-msvideo",
  "video/3gpp",
]);

const MIME_TO_EXT = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/mpeg": ".mpeg",
  "video/mov": ".mov",
  "video/quicktime": ".mov",
  "video/avi": ".avi",
  "video/x-msvideo": ".avi",
  "video/3gpp": ".3gp",
};

function tempFilePath(mimeType) {
  const ext = MIME_TO_EXT[mimeType] || ".webm";
  const name = `fw-capture-${crypto.randomBytes(8).toString("hex")}${ext}`;
  return path.join(os.tmpdir(), name);
}

async function withTempFile(mimeType, fn) {
  const tmpPath = tempFilePath(mimeType);
  try {
    return await fn(tmpPath);
  } finally {
    fs.unlink(tmpPath, () => {}); // best-effort cleanup
  }
}

/**
 * Write a buffer (from multer memoryStorage) to a temp file,
 * upload to Gemini File API, return the hosted fileUri.
 */
async function receiveAndUpload(buffer, mimeType = "video/webm") {
  const safeMime = SUPPORTED_MIME_TYPES.has(mimeType) ? mimeType : "video/webm";
  return withTempFile(safeMime, async (tmpPath) => {
    await fs.promises.writeFile(tmpPath, buffer);
    return uploadVideoToGemini(tmpPath, safeMime);
  });
}

/**
 * Try to download a video directly from a CDN URL and upload it to Gemini.
 * Works for public Vimeo, Loom, Canvas/Kaltura CDN URLs, etc.
 * Throws if the download fails (auth-gated, CORS, 403, etc.) so the caller
 * can fall back to asking the extension to use captureStream instead.
 */
async function directDownloadAndUpload(videoUrl, mimeType = "video/mp4") {
  const safeMime = SUPPORTED_MIME_TYPES.has(mimeType) ? mimeType : "video/mp4";

  let response;
  try {
    response = await axios.get(videoUrl, {
      responseType: "arraybuffer",
      timeout: 30_000,
      maxContentLength: 500 * 1024 * 1024, // 500 MB cap
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Framewise/1.0)",
        Accept: "video/*,*/*",
      },
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      throw new Error("VIDEO_URL_AUTH_REQUIRED");
    }
    if (status === 404) {
      throw new Error("VIDEO_URL_NOT_FOUND");
    }
    throw new Error(`VIDEO_URL_DOWNLOAD_FAILED: ${err.message}`);
  }

  // Honour the server's Content-Type if it's a known video MIME
  const serverMime = response.headers["content-type"]?.split(";")[0]?.trim();
  const resolvedMime = serverMime && SUPPORTED_MIME_TYPES.has(serverMime) ? serverMime : safeMime;

  return withTempFile(resolvedMime, async (tmpPath) => {
    await fs.promises.writeFile(tmpPath, Buffer.from(response.data));
    return uploadVideoToGemini(tmpPath, resolvedMime);
  });
}

module.exports = { receiveAndUpload, directDownloadAndUpload };

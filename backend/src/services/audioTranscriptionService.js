// Generates captions from a YouTube video using ElevenLabs STT.
// Strategy: resolve a playable audio/video format, download it, and send the
// media container to ElevenLabs. If YouTube blocks formats, callers can fall
// back to Gemini video captions.
const ytdl = require("@distube/ytdl-core");
const FormData = require("form-data");
const axios = require("axios");
const { buildCues } = require("./captionService");

function normalizeYouTubeDownloadError(err) {
  const msg = err?.message || String(err || "");
  if (msg.includes("age") || msg.includes("sign in")) {
    return new Error("Audio download failed: this video requires sign-in and cannot be transcribed from audio.");
  }
  if (msg.includes("Private") || msg.includes("private") || msg.includes("unavailable")) {
    return new Error("Audio download failed: this video is private or unavailable.");
  }
  if (msg.includes("playable formats") || msg.includes("No video id found")) {
    return new Error("Audio download failed: YouTube did not expose a playable audio format for this video.");
  }
  return new Error(`Audio download failed: ${msg}`);
}

async function resolveFormat(videoUrl) {
  let info;
  try {
    info = await ytdl.getInfo(videoUrl);
  } catch (err) {
    throw normalizeYouTubeDownloadError(err);
  }

  const playable = (info.formats || []).filter((format) => format.url);

  const audioOnly = ytdl.filterFormats(playable, "audioonly");
  if (audioOnly.length) {
    audioOnly.sort((a, b) => (a.audioBitrate || 999) - (b.audioBitrate || 999));
    return { info, format: audioOnly[0] };
  }

  const withAudio = playable
    .filter((format) => format.hasAudio)
    .sort((a, b) => (a.bitrate || 999999) - (b.bitrate || 999999));
  if (withAudio.length) {
    return { info, format: withAudio[0] };
  }

  if (playable.length) {
    return { info, format: playable[0] };
  }

  throw new Error("Audio download failed: YouTube did not expose a playable audio format for this video.");
}

async function downloadBuffer(videoUrl) {
  const { info, format } = await resolveFormat(videoUrl);
  const contentType = format.mimeType?.split(";")[0] || "video/mp4";

  return new Promise((resolve, reject) => {
    const chunks = [];
    let stream;
    try {
      stream = ytdl.downloadFromInfo(info, { format });
    } catch (err) {
      reject(normalizeYouTubeDownloadError(err));
      return;
    }

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType }));
    stream.on("error", (err) => reject(normalizeYouTubeDownloadError(err)));
  });
}

async function transcribeWithElevenLabs(buffer, contentType) {
  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    throw new Error("ElevenLabs is not configured. Set ELEVENLABS_API_KEY to use audio-based captions.");
  }

  const typeToExt = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
  };
  const ext = typeToExt[contentType] || contentType.split("/")[1]?.split(";")[0] || "mp4";

  const form = new FormData();
  form.append("file", buffer, { filename: `media.${ext}`, contentType });
  form.append("model_id", "scribe_v1");
  form.append("timestamps_granularity", "word");

  const response = await axios.post(
    "https://api.elevenlabs.io/v1/speech-to-text",
    form,
    {
      headers: { "xi-api-key": API_KEY, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000,
    }
  );

  return response.data;
}

async function generateCaptionsFromAudio(videoUrl) {
  const { buffer, contentType } = await downloadBuffer(videoUrl);
  const result = await transcribeWithElevenLabs(buffer, contentType);

  const items = (result.words || [])
    .filter((word) => word.type === "word" && word.text?.trim())
    .map((word) => ({
      text: word.text.trim(),
      start: Number(word.start) || 0,
      duration: Math.max(0.05, (Number(word.end) || 0) - (Number(word.start) || 0)),
    }));

  if (!items.length) {
    throw new Error("No speech detected in this video.");
  }

  return buildCues(items);
}

async function generateCaptionsFromBuffer(buffer, mimeType = "video/webm") {
  const result = await transcribeWithElevenLabs(buffer, mimeType);

  const items = (result.words || [])
    .filter((word) => word.type === "word" && word.text?.trim())
    .map((word) => ({
      text: word.text.trim(),
      start: Number(word.start) || 0,
      duration: Math.max(0.05, (Number(word.end) || 0) - (Number(word.start) || 0)),
    }));

  if (!items.length) {
    throw new Error("No speech detected in this video.");
  }

  return buildCues(items);
}

module.exports = { generateCaptionsFromAudio, generateCaptionsFromBuffer };

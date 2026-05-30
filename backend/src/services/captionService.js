// Fetches YouTube's native transcript and converts it to timed cues. For
// YouTube transcript data, keep source cue timings intact; regrouping text can
// make injected captions drift away from the video clock.
const { YoutubeTranscript } = require("youtube-transcript");

// ── Constants (mirrored from better-youtube-captions) ─────────────────────────
const SRT_MAX_CHARS_PER_LINE = 42;
const SRT_MAX_CUE_CHARS      = 84;
const SRT_MAX_CUE_DURATION_S = 6;
const SRT_PAUSE_SPLIT_S      = 0.7;

// ── Text helpers ──────────────────────────────────────────────────────────────
function wrapText(text) {
  if (text.length <= SRT_MAX_CHARS_PER_LINE) return text;
  const mid = Math.floor(text.length / 2);
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " ") continue;
    const left  = text.slice(0, i).trim().length;
    const right = text.slice(i + 1).trim().length;
    if (left > SRT_MAX_CHARS_PER_LINE || right > SRT_MAX_CHARS_PER_LINE) continue;
    const dist = Math.abs(i - mid);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  if (bestIdx === -1) return text;
  return `${text.slice(0, bestIdx).trim()}\n${text.slice(bestIdx + 1).trim()}`;
}

function tokenEnd(token) {
  return token.start + token.duration;
}

// ── Cue-splitting logic (adapted from better-youtube-captions) ────────────────
function shouldSplitCue(tokens, nextToken) {
  if (!tokens.length) return false;
  const start    = tokens[0].start;
  const end      = tokenEnd(tokens[tokens.length - 1]);
  const duration = end - start;
  const text     = tokens.map((t) => t.text).join(" ");
  const lastText = tokens[tokens.length - 1].text;
  const pauseToNext = nextToken ? Math.max(0, nextToken.start - end) : 0;

  if (duration >= SRT_MAX_CUE_DURATION_S || text.length >= SRT_MAX_CUE_CHARS) return true;
  if (/[.!?]["')\]]*$/.test(lastText) && duration >= 1.2) return true;
  if (pauseToNext >= SRT_PAUSE_SPLIT_S && duration >= 1.0) return true;
  if (/[,;:]["')\]]*$/.test(lastText) && (duration >= 2.0 || text.length >= 32)) return true;
  return false;
}

function buildCues(items) {
  const cues = [];
  let current = [];

  for (let i = 0; i < items.length; i++) {
    const token = items[i];
    const next  = items[i + 1];
    if (!token.text?.trim()) continue;

    current.push(token);

    if (shouldSplitCue(current, next)) {
      const startTime = current[0].start;
      const endTime   = tokenEnd(current[current.length - 1]);
      const text      = wrapText(current.map((t) => t.text.replace(/\n/g, " ").trim()).join(" ").trim());
      if (text) cues.push({ startTime, endTime, text });
      current = [];
    }
  }

  if (current.length > 0) {
    const startTime = current[0].start;
    const endTime   = tokenEnd(current[current.length - 1]);
    const text      = wrapText(current.map((t) => t.text.replace(/\n/g, " ").trim()).join(" ").trim());
    if (text) cues.push({ startTime, endTime, text });
  }

  return cues;
}

// ── Public API ────────────────────────────────────────────────────────────────
function decodeTranscriptText(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inferTranscriptScale(items) {
  const offsets = items.map((item) => transcriptNumber(item.offset));
  const durations = items.map((item) => transcriptNumber(item.duration));
  const maxOffset = Math.max(...offsets, 0);
  const maxDuration = Math.max(...durations, 0);
  return maxOffset > 10000 || maxDuration > 60 ? 1000 : 1;
}

function normalizeTranscriptCue(item, scale) {
  const offset = transcriptNumber(item.offset);
  const duration = transcriptNumber(item.duration);
  const startTime = offset / scale;
  const cueDuration = duration / scale;
  const text = decodeTranscriptText(item.text);

  return {
    startTime,
    endTime: Math.max(startTime + 0.25, startTime + cueDuration),
    text: wrapText(text),
  };
}

async function generateCaptionsFromYouTube(videoUrl) {
  let raw;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoUrl, { lang: "en" });
  } catch (err) {
    try {
      raw = await YoutubeTranscript.fetchTranscript(videoUrl);
    } catch (fallbackErr) {
      const msg = fallbackErr.message || err.message || "";
      if (
        msg.includes("disabled") ||
        msg.includes("No captions") ||
        msg.includes("Could not get") ||
        msg.includes("no element found")
      ) {
        throw new Error(
          "No captions available for this video. Try pasting the transcript manually below."
        );
      }
      throw fallbackErr;
    }
  }

  if (!raw || raw.length === 0) {
    throw new Error("No captions available for this video.");
  }

  const scale = inferTranscriptScale(raw);
  return raw
    .map((item) => normalizeTranscriptCue(item, scale))
    .filter((cue) => cue.text && cue.endTime > cue.startTime)
    .sort((a, b) => a.startTime - b.startTime);
}

module.exports = { generateCaptionsFromYouTube, buildCues };

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const { logAiRequest } = require("./aiLogger");
const modelCandidates = [
  ...(process.env.GEMINI_MODEL || "").split(","),
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
]
  .map((name) => name.trim())
  .filter(Boolean)
  .filter((name, index, all) => all.indexOf(name) === index);

function getModel(modelName) {
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
    },
  });
}

function getGeminiRetryDelay(err, fallbackMs) {
  const message = err?.message || "";
  const retryInfo = message.match(/retryDelay":"([^"]+)"/i);
  const retryIn = message.match(/(?:Please\s+)?retry\s+in\s+([0-9.]+)s/i);
  const raw = retryInfo?.[1] || (retryIn?.[1] ? `${retryIn[1]}s` : "");
  const seconds = raw.endsWith("s") ? Number(raw.replace("s", "")) : Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000);
  return fallbackMs;
}

function isGeminiQuotaError(err) {
  const message = err?.message || "";
  return message.includes("429") || message.toLowerCase().includes("quota") || message.toLowerCase().includes("too many requests");
}

function isGeminiFetchError(err) {
  const message = err?.message || "";
  return (
    err instanceof TypeError ||
    message.includes("fetch failed") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
}

async function withRetry(fn, retries = 4, delayMs = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const is503 = err?.message?.includes("503") || err?.message?.includes("Service Unavailable");
      const isQuota = isGeminiQuotaError(err);
      const isFetch = isGeminiFetchError(err);
      if ((is503 || isQuota || isFetch) && i < retries - 1) {
        const fallback = isQuota
          ? Math.max(8_000, delayMs * (2 ** i))  // quota: minimum 8s between retries
          : delayMs * (2 ** i);
        const waitMs = isQuota ? getGeminiRetryDelay(err, fallback) : fallback;
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
}

function parseJsonResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini returned non-JSON response: ${String(raw).slice(0, 120)}`);
    }
  }
}

function looksTruncatedJsonError(err) {
  return err?.message?.startsWith("Gemini returned non-JSON response:");
}

// Safely extract text from a Gemini result, surfacing finish-reason errors clearly.
// text() throws GoogleGenerativeAIResponseError for RECITATION / SAFETY / LANGUAGE.
function safeText(result) {
  try {
    return result.response.text();
  } catch (err) {
    const reason = result.response?.candidates?.[0]?.finishReason || "UNKNOWN";
    throw new Error(`Gemini stopped generation (${reason}). Try again or rephrase your request.`);
  }
}

const TOPIC_CHUNK_SECONDS = Number(process.env.GEMINI_TOPIC_CHUNK_SECONDS) || 900;
const DANCE_CHUNK_SECONDS = Number(process.env.GEMINI_DANCE_CHUNK_SECONDS) || 900;
const CAPTION_CHUNK_SECONDS = Number(process.env.GEMINI_CAPTION_CHUNK_SECONDS) || 180;
const CHUNK_CONCURRENCY = Number(process.env.GEMINI_CHUNK_CONCURRENCY) || 3;

// Global sliding-window rate gate.
// Queues requests rather than letting them crash with 429s.
// Default: 14 req/min — just under flash-lite free-tier ceiling of 15 RPM.
const GEMINI_RPM_LIMIT = Number(process.env.GEMINI_RPM) || 14;
const _rateWindow = [];

async function acquireRateSlot() {
  const windowMs = 61_000; // 61 s to give the API a little breathing room
  for (;;) {
    const now = Date.now();
    while (_rateWindow.length && now - _rateWindow[0] >= windowMs) _rateWindow.shift();
    if (_rateWindow.length < GEMINI_RPM_LIMIT) {
      _rateWindow.push(now);
      return;
    }
    const waitMs = windowMs - (now - _rateWindow[0]) + 100;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

function buildYoutubePart(videoUrl, clip = null) {
  const part = {
    fileData: {
      fileUri: videoUrl,
      mimeType: "video/*",
    },
  };

  if (clip) {
    part.videoMetadata = {
      startOffset: `${Math.max(0, Math.floor(clip.start))}s`,
      endOffset: `${Math.max(0, Math.floor(clip.end))}s`,
    };
  }

  return part;
}

async function generateContent(parts) {
  await acquireRateSlot();
  let lastError = null;

  for (const modelName of modelCandidates) {
    try {
      return await withRetry(() => getModel(modelName).generateContent(parts));
    } catch (err) {
      lastError = err;
      const message = err?.message || "";
      const isUnavailableModel =
        message.includes("404 Not Found") ||
        message.includes("not found for API version") ||
        message.includes("no longer available");

      // fetch errors are transient — withRetry already exhausted its retries; rethrow
      if (!isUnavailableModel) throw err;
    }
  }

  throw lastError;
}

function makeChunks(durationSeconds, chunkSeconds) {
  const duration = Number(durationSeconds) || 0;
  if (duration <= chunkSeconds) return [null];

  const chunks = [];
  for (let start = 0; start < duration; start += chunkSeconds) {
    chunks.push({ start, end: Math.min(start + chunkSeconds, duration) });
  }
  return chunks;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

function normalizeSegmentTimes(segment, clip) {
  const clipStart = clip?.start || 0;
  const clipEnd = clip?.end || Infinity;
  let startTime = Number(segment.startTime) || 0;
  let endTime = Number(segment.endTime) || startTime + 1;

  const alreadyAbsolute = clip && startTime >= clipStart && endTime <= clipEnd + 5;
  if (clip && !alreadyAbsolute) {
    startTime += clipStart;
    endTime += clipStart;
  }

  startTime = Math.max(clipStart, startTime);
  endTime = Math.min(clipEnd, Math.max(startTime + 1, endTime));
  return { startTime, endTime };
}

function clampSegmentsToDuration(segments, durationSeconds) {
  const duration = Number(durationSeconds) || 0;
  return segments
    .map((segment) => {
      let startTime = Number(segment.startTime) || 0;
      let endTime = Number(segment.endTime) || startTime + 1;

      if (duration > 0) {
        startTime = Math.min(Math.max(0, startTime), Math.max(0, duration - 1));
        endTime = Math.min(Math.max(startTime + 1, endTime), duration);
      } else {
        startTime = Math.max(0, startTime);
        endTime = Math.max(startTime + 1, endTime);
      }

      return { ...segment, startTime, endTime };
    })
    .filter((segment) => segment.endTime > segment.startTime)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Analyze a YouTube video URL and return segments + transcript.
 * Uses Gemini's native YouTube URL support (Option A - no download needed).
 */
async function analyzeTopicChunk(videoUrl, clip) {
  const clipInstruction = clip
    ? `Analyze only the clipped interval ${clip.start}s-${clip.end}s. Return startTime/endTime relative to this clipped interval, starting at 0.`
    : "Analyze the full attached video.";

  const prompt = `
You are analyzing the attached YouTube video. Do not invent content from the title,
URL, or general knowledge. If you cannot access the attached video, return:
{ "title": "Unavailable video", "transcript": "", "segments": [] }

${clipInstruction}

Return a JSON object with this exact shape:
{
  "title": "string - the video title or topic",
  "transcript": "string - a concise video-grounded summary, max 1200 characters",
  "segments": [
    { "title": "string", "summary": "string", "startTime": number, "endTime": number }
  ]
}

Rules:
- startTime and endTime are in seconds
- Segment times must be grounded in the attached video
- Each segment covers a distinct topic or section
- For this interval, create a compact timeline that covers the whole interval from beginning to end.
- For long intervals, prefer 6-10 broad segments distributed across the entire interval.
- Avoid returning only the intro unless the interval only contains an intro.
- Keep segment titles specific to the actual video content
- The transcript field must be a short summary only. Do not output a full transcript.
- Write the transcript summary in the same language used by the video when possible.
- Return ONLY valid JSON, no markdown fences
`;

  const result = await generateContent([
    { text: prompt },
    buildYoutubePart(videoUrl, clip),
  ]);
  return parseJsonResponse(safeText(result).trim());
}

async function analyzeTopicChunkSafe(videoUrl, clip) {
  try {
    return await analyzeTopicChunk(videoUrl, clip);
  } catch (err) {
    if (!looksTruncatedJsonError(err)) throw err;

    const clipInstruction = clip
      ? `Analyze only ${clip.start}s-${clip.end}s. Times must be relative to this clipped interval.`
      : "Analyze the full attached video.";
    const prompt = `
Return ONLY compact valid JSON. ${clipInstruction}
Shape:
{"title":"string","transcript":"one short summary under 500 chars","segments":[{"title":"string","summary":"max 120 chars","startTime":number,"endTime":number}]}
Rules:
- 4-8 segments only.
- Do not output a full transcript.
- Keep all text short.
`;

    const result = await generateContent([
      { text: prompt },
      buildYoutubePart(videoUrl, clip),
    ]);
    return parseJsonResponse(safeText(result).trim());
  }
}

/**
 * Analyze a YouTube video URL and return segments + transcript.
 * Uses chunked clipping for long videos so a 40 minute video gets a full timeline.
 */
const analyzeWithGemini = async (videoUrl, { durationSeconds } = {}) => {
  const chunks = makeChunks(durationSeconds, TOPIC_CHUNK_SECONDS);
  logAiRequest("gemini.analyze.topics", { chunks: chunks.length, concurrency: CHUNK_CONCURRENCY, durationSeconds });
  const analyses = await mapWithConcurrency(
    chunks,
    CHUNK_CONCURRENCY,
    (clip) => analyzeTopicChunkSafe(videoUrl, clip)
  );

  const segments = clampSegmentsToDuration(analyses.flatMap((analysis, index) => {
    const clip = chunks[index];
    return (analysis.segments || []).map((segment) => ({
      ...segment,
      ...normalizeSegmentTimes(segment, clip),
    }));
  }), durationSeconds);

  return {
    title: analyses.find((analysis) => analysis.title)?.title || "Analyzed Video",
    transcript: analyses.map((analysis, index) => {
      const clip = chunks[index];
      const label = clip ? `[${clip.start}s-${clip.end}s]` : "[full video]";
      return `${label} ${analysis.transcript || ""}`.trim();
    }).filter(Boolean).join("\n"),
    segments,
  };
};

async function analyzeDanceChunk(videoUrl, clip) {
  const clipInstruction = clip
    ? `You are analyzing ONLY the section from ${clip.start}s to ${clip.end}s of the video (a ${clip.end - clip.start}s window). Return startTime and endTime as seconds RELATIVE to this window's start (the window starts at 0 and ends at ${clip.end - clip.start}s).`
    : "Analyze the ENTIRE video from the first second to the last.";

  const prompt = `
You are an expert dance instructor analyzing the attached YouTube video for a student who wants to learn every step.

${clipInstruction}

Your job: identify and timestamp EVERY distinct, teachable dance move or sequence visible in the video.

Return ONLY valid JSON with this exact shape:
{
  "title": "string - name of the dance or routine",
  "segments": [
    {
      "title": "specific move name (e.g. 'Hip Roll', 'Cross-Step Right', 'Body Wave', 'Arm Isolation')",
      "summary": "1-2 sentence clear description of what the dancer does, for a complete beginner",
      "bodyPosition": "precise body position: feet placement (width, angle), knees, hips, torso, arms, hands, head direction",
      "movementCue": "the single most important coaching cue that helps beginners remember this move",
      "practiceTips": ["specific beginner tip 1", "specific beginner tip 2"],
      "mirrorTip": "one thing to keep in mind when mirroring the dancer",
      "difficulty": "easy | medium | hard",
      "startTime": number,
      "endTime": number
    }
  ]
}

Critical rules — read carefully:
1. Watch the actual video movements. Only report moves that are visually present — do not invent.
2. Detect EVERY distinct choreographic move — do not skip or silently merge separate moves.
3. Timestamps must match exactly when each move starts and ends in the video (within 1-2 seconds accuracy).
4. List segments in chronological order by startTime.
5. Typical segment duration: 3-15 seconds. A longer repeated section can be one segment.
6. Skip non-dancing portions (introductions, pauses, talking heads) — do not create segments for them.
7. Give each move a specific descriptive name — not generic labels like "Move 1" or "Dance section".
8. If no dancing is detected, return: { "title": "", "segments": [] }
`;

  const result = await generateContent([
    { text: prompt },
    buildYoutubePart(videoUrl, clip),
  ]);
  return parseJsonResponse(safeText(result).trim());
}

const analyzeDanceWithGemini = async (videoUrl, { durationSeconds } = {}) => {
  const chunks = makeChunks(durationSeconds, DANCE_CHUNK_SECONDS);
  logAiRequest("gemini.analyze.dance", { chunks: chunks.length, concurrency: CHUNK_CONCURRENCY, durationSeconds });
  const analyses = await mapWithConcurrency(
    chunks,
    CHUNK_CONCURRENCY,
    (clip) => analyzeDanceChunk(videoUrl, clip)
  );

  const segments = clampSegmentsToDuration(analyses.flatMap((analysis, index) => {
    const clip = chunks[index];
    return (analysis.segments || []).map((segment) => ({
      ...segment,
      ...normalizeSegmentTimes(segment, clip),
    }));
  }), durationSeconds);

  return {
    title: analyses.find((analysis) => analysis.title)?.title || "Dance Tutorial",
    segments,
  };
};

/**
 * Chat with Gemini about a video, using transcript + segment context.
 */
const chatWithGemini = async ({ videoUrl, transcript, segments, history, userMessage, mode = "default" }) => {
  const keywords = String(userMessage || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 3);
  const relevantSegments = segments
    .filter((s) => {
      const haystack = `${s.title || ""} ${s.summary || ""} ${s.bodyPosition || ""} ${s.movementCue || ""}`.toLowerCase();
      return keywords.some((word) => haystack.includes(word));
    })
    .slice(0, 12);
  const contextSegments = relevantSegments.length ? relevantSegments : segments.slice(0, 16);
  const segmentContext = contextSegments
    .map((s) => `[${s.startTime}s-${s.endTime}s] ${s.title}: ${s.summary}`)
    .join("\n");

  // Keep context compact to reduce token usage and latency.
  const recentHistory = history.slice(-6);
  const historyText = recentHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const truncatedTranscript = (transcript || "").slice(0, 1200);
  logAiRequest("gemini.chat", { mode, segments: contextSegments.length, transcriptChars: truncatedTranscript.length });

  const prompt = `
You are an AI assistant helping a user understand a video.
${mode === "dance" ? "Dance tutor mode is active: explain movements, body positioning, timing, practice breakpoints, and how to repeat the move safely." : ""}

You have the attached YouTube video plus stored analysis context. Answer only from
the attached video and context. If the stored context conflicts with the video,
prefer the attached video.

Transcript/Summary:
${truncatedTranscript || "(not available)"}

Timeline segments:
${segmentContext || "(not available)"}

Conversation so far:
${historyText || "(none)"}

User: ${userMessage}

Instructions:
- Answer the user's question using the video content.
- If the user asks about a specific topic, action, move, word, or moment, find the closest matching segment and return its startTime as linkedSegmentTime.
- If the user asks to "show me", "go to", "find", "where is", or mentions any topic covered in the segments, ALWAYS return a linkedSegmentTime.
- linkedSegmentTime must be a number in seconds from the start of the video, not null, whenever you reference any part of the video.
- Only return null for linkedSegmentTime if the question is completely general and has no specific moment in the video.
- Detect action commands:
  - "generate captions", "add subtitles", "get subtitles" → action: "generate_captions"
  - "translate" + a language name → action: "translate_captions", actionParams: {"language": "<the language>"}
  - "quiz me", "create a quiz", "test me", "generate quiz" → action: "generate_quiz"
  - "take notes", "generate notes", "auto notes", "save notes" → action: "generate_notes"
  - "summarize", "give me a summary", "what is this about" → action: "summarize"
  - No command detected → action: null, actionParams: null
- For "summarize" action, include a concise summary in the answer field itself.

Reply with ONLY this JSON object, no markdown fences:
{
  "answer": "your response here",
  "linkedSegmentTime": <number in seconds or null>,
  "action": <"generate_captions"|"translate_captions"|"generate_quiz"|"generate_notes"|"summarize"|null>,
  "actionParams": <{"language": "string"} or null>
}
`;

  const result = await generateContent([
    { text: prompt },
    buildYoutubePart(videoUrl),
  ]);
  return parseJsonResponse(safeText(result).trim());
};

async function correctCaptionChunk(videoUrl, captions, clip) {
  const captionText = captions
    .map((c, index) => `${index + 1}. [${c.startTime}-${c.endTime}] ${c.text}`)
    .join("\n");
  const clipInstruction = clip
    ? `Work only on the clipped interval ${clip.start}s-${clip.end}s. Return startTime/endTime relative to this clipped interval, starting at 0.`
    : "Work on the full attached video.";

  const prompt = `
You are repairing subtitles for the attached video. Fix wrong subtitles and add
missing subtitles when speech or important on-screen words are present. Preserve
meaning and timing. If no input captions are provided, generate concise subtitles
for audible speech and important on-screen instructional text.
Use the same language that is spoken in the video. Do not translate unless the
user explicitly asks for translation.

${clipInstruction}

Input captions:
${captionText || "(none provided)"}

Return ONLY valid JSON with this exact shape:
{
  "captions": [
    { "startTime": number, "endTime": number, "text": "corrected or added caption text" }
  ]
}

Rules:
- Include corrected existing captions and newly added missing captions.
- Use short readable caption lines.
- Do not create captions for silence.
- Keep timestamps inside the requested interval.
- Keep the total number of captions compact and only include clear speech/text.
`;

  const result = await generateContent([
    { text: prompt },
    buildYoutubePart(videoUrl, clip),
  ]);
  return parseJsonResponse(safeText(result).trim());
};

async function correctCaptionChunkSafe(videoUrl, captions, clip) {
  try {
    return await correctCaptionChunk(videoUrl, captions, clip);
  } catch (err) {
    if (!looksTruncatedJsonError(err)) throw err;

    const captionText = captions
      .slice(0, 40)
      .map((c, index) => `${index + 1}. [${c.startTime}-${c.endTime}] ${c.text}`)
      .join("\n");
    const clipInstruction = clip
      ? `Only interval ${clip.start}s-${clip.end}s. Return times relative to this interval.`
      : "Full video.";
    const prompt = `
Return ONLY compact valid JSON. ${clipInstruction}
Use the spoken video language. Do not translate.
Input captions:
${captionText || "(none)"}
Shape: {"captions":[{"startTime":number,"endTime":number,"text":"short caption"}]}
Rules: max 40 captions, short text, no markdown.
`;
    const result = await generateContent([
      { text: prompt },
      buildYoutubePart(videoUrl, clip),
    ]);
    return parseJsonResponse(safeText(result).trim());
  }
}

const correctCaptionsWithGemini = async ({ videoUrl, captions = [], durationSeconds }) => {
  const chunks = makeChunks(durationSeconds, CAPTION_CHUNK_SECONDS);
  logAiRequest("gemini.captions.correct", { chunks: chunks.length, concurrency: CHUNK_CONCURRENCY, inputCaptions: captions.length });
  const analyses = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, (clip) => {
    const clipCaptions = clip
      ? captions
        .filter((caption) => caption.endTime >= clip.start && caption.startTime <= clip.end)
        .map((caption) => ({
          ...caption,
          startTime: Math.max(0, caption.startTime - clip.start),
          endTime: Math.max(0, caption.endTime - clip.start),
        }))
      : captions;
    return correctCaptionChunkSafe(videoUrl, clipCaptions, clip);
  });

  const corrected = clampSegmentsToDuration(analyses.flatMap((analysis, index) => {
    const clip = chunks[index];
    return (analysis.captions || []).map((caption) => ({
      ...caption,
      ...normalizeSegmentTimes(caption, clip),
    }));
  }), durationSeconds).map((caption) => ({
    startTime: caption.startTime,
    endTime: caption.endTime,
    text: String(caption.text || "").trim(),
  })).filter((caption) => caption.text);

  return { captions: corrected };
};

const translateCaptionsWithGemini = async ({ captions, language }) => {
  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < captions.length; i += BATCH) batches.push(captions.slice(i, i + BATCH));
  logAiRequest("gemini.captions.translate", { batches: batches.length, captions: captions.length, language });

  const results = await mapWithConcurrency(batches, CHUNK_CONCURRENCY, async (batch) => {
    const prompt = `Translate the following caption texts to ${language}. Return ONLY valid JSON with the same structure. Keep startTime and endTime unchanged. Translate only the "text" values.

Input: ${JSON.stringify(batch.map((c) => ({ startTime: c.startTime, endTime: c.endTime, text: c.correctedText || c.text })))}

Return: {"captions": [{"startTime": number, "endTime": number, "text": "translated text"}]}`;

    const result = await generateContent([{ text: prompt }]);
    const parsed = parseJsonResponse(safeText(result).trim());
    return Array.isArray(parsed.captions) ? parsed.captions : [];
  });

  return results.flat();
};

const generateNotesWithGemini = async ({ title, transcript, segments }) => {
  const compactSegments = segments.slice(0, 24);
  const segmentContext = compactSegments
    .map((s) => `[${s.startTime}s] ${s.title}: ${s.summary}`)
    .join("\n");

  const prompt = `Generate 5-7 concise study notes for this video. Each note should capture a key insight, concept, or takeaway grounded in the content.

Video: "${title}"

Timeline:
${segmentContext}

Transcript excerpt:
${(transcript || "").slice(0, 1000)}

Return ONLY valid JSON:
{
  "notes": [
    { "timestamp": <segment startTime closest to this note in seconds>, "content": "concise note (1-2 sentences)" }
  ]
}

Rules:
- Cover different parts of the video
- Use the segment startTime nearest the relevant content for timestamp
- Notes should be informative, not just repeat the segment title
- Return ONLY valid JSON, no markdown fences
`;

  logAiRequest("gemini.notes", { segments: compactSegments.length, transcriptChars: Math.min((transcript || "").length, 1000) });
  const result = await generateContent([{ text: prompt }]);
  const parsed = parseJsonResponse(safeText(result).trim());
  return Array.isArray(parsed.notes) ? parsed.notes : [];
};

const generateQuizWithGemini = async ({ title, transcript, segments, videoUrl }) => {
  const compactSegments = segments.slice(0, 24);
  const segmentContext = compactSegments
    .map((s) => `[${s.startTime}s] ${s.title}: ${s.summary}`)
    .join("\n");

  const prompt = `You are a quiz generator. Watch the video and create 6–8 questions that test real understanding.

Video: "${title || "Untitled"}"
${segmentContext ? `\nTopics:\n${segmentContext}\n` : ""}
${transcript ? `\nTranscript excerpt:\n${(transcript).slice(0, 800)}\n` : ""}
Return ONLY valid JSON:
{
  "quiz": [
    { "question": "string", "answer": "string", "timestamp": number_or_null }
  ]
}

Rules:
- Express all answers in your own words — conceptual understanding, not verbatim recall
- Mix "why", "how", and application questions
- Answers: 1–2 sentences
- timestamp: approximate second where the topic is discussed, or null
- Generate at least 3 questions even for short content
`;

  logAiRequest("gemini.quiz", { segments: compactSegments.length, transcriptChars: Math.min((transcript || "").length, 800), videoAttached: false });
  const parts = [{ text: prompt }];
  const result = await generateContent(parts);
  const parsed = parseJsonResponse(safeText(result).trim());
  return { quiz: Array.isArray(parsed.quiz) ? parsed.quiz : [] };
};

module.exports = { analyzeWithGemini, analyzeDanceWithGemini, chatWithGemini, correctCaptionsWithGemini, generateQuizWithGemini, translateCaptionsWithGemini, generateNotesWithGemini };

const ChatMessage = require("../models/ChatMessage");
const Video = require("../models/Video");
const Segment = require("../models/Segment");
const { chatWithGemini } = require("../services/geminiService");
const { textToSpeech } = require("../services/elevenLabsService");
const { logAiRequest } = require("../services/aiLogger");

const SEEK_WORDS = [
  "ac", "aç", "git", "goster", "göster", "bul", "nerede", "where", "show", "open", "jump", "go",
];

const STOP_WORDS = new Set([
  "bir", "bi", "bu", "su", "şu", "o", "ve", "veya", "ile", "icin", "için", "daki", "deki",
  "video", "videoda", "konu", "kismi", "kısmı", "yeri", "yer", "ac", "aç", "git", "goster",
  "göster", "bul", "nerede", "open", "show", "jump", "go", "to", "the", "in", "at",
]);

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ğüşıöç\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text) {
  return normalizeText(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function wantsSeek(text) {
  const normalized = normalizeText(text);
  return SEEK_WORDS.some((word) => normalized.includes(normalizeText(word)));
}

function findBestSegmentTime(message, segments) {
  const keywords = extractKeywords(message);
  if (keywords.length === 0) return null;

  let best = null;
  for (const segment of segments) {
    const haystack = normalizeText([
      segment.title,
      segment.summary,
      segment.bodyPosition,
      segment.movementCue,
      segment.mirrorTip,
      ...(segment.practiceTips || []),
    ].join(" "));

    const score = keywords.reduce((total, keyword) => (
      haystack.includes(keyword) ? total + Math.max(1, keyword.length / 4) : total
    ), 0);

    if (!best || score > best.score) {
      best = { score, segment };
    }
  }

  return best && best.score > 0 ? best.segment.startTime : null;
}

// POST /api/chat/:videoId/message
const sendMessage = async (req, res, next) => {
  try {
    const { content, mode = "default", persistUser = true, persistAssistant = true } = req.body;
    const { videoId } = req.params;

    const video = await Video.findOne({ _id: videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const segments = await Segment.find({ videoId }).sort("startTime");

    if (!content?.trim()) return res.status(400).json({ error: "content is required" });

    // Save user message unless this is an internal tool prompt, such as practice-session feedback.
    if (persistUser !== false) {
      await ChatMessage.create({ videoId, userId: req.user.id, role: "user", content });
    }

    // Build conversation history for Gemini
    const history = await ChatMessage.find({ videoId, userId: req.user.id })
      .sort("createdAt")
      .limit(10);

    const deterministicTime = wantsSeek(content) ? findBestSegmentTime(content, segments) : null;

    logAiRequest("request.chat", { userId: req.user.id, videoId, mode, segments: segments.length });
    const { answer, linkedSegmentTime, action = null, actionParams = null } = await chatWithGemini({
      videoUrl: video.url,
      transcript: video.transcript,
      segments,
      history,
      userMessage: content,
      mode,
    });

    const finalLinkedSegmentTime = deterministicTime ?? linkedSegmentTime;

    const assistantPayload = {
      videoId,
      userId: req.user.id,
      role: "assistant",
      content: answer,
      linkedSegmentTime: finalLinkedSegmentTime ?? null,
    };

    const assistantMsg = persistAssistant === false
      ? assistantPayload
      : await ChatMessage.create(assistantPayload);

    res.json({ ...(assistantMsg.toObject?.() || assistantMsg), action, actionParams });
  } catch (err) { next(err); }
};

// GET /api/chat/:videoId/history
const getHistory = async (req, res, next) => {
  try {
    const messages = await ChatMessage.find({
      videoId: req.params.videoId,
      userId: req.user.id,
    }).sort("createdAt");
    res.json(messages);
  } catch (err) { next(err); }
};

// POST /api/chat/:videoId/voice  — body: { text }
const getVoice = async (req, res, next) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: "Voice not configured" });
  }
  try {
    const { text, voicePreset } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });
    const audioBuffer = await textToSpeech(text, voicePreset);
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.warn("ElevenLabs TTS failed:", err.message);
    next(err);
  }
};

module.exports = { sendMessage, getHistory, getVoice };

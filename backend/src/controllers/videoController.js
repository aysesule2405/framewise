const Video = require("../models/Video");
const Segment = require("../models/Segment");
const Caption = require("../models/Caption");
const Collection = require("../models/Collection");
const ChatMessage = require("../models/ChatMessage");
const Note = require("../models/Note");
const Bookmark = require("../models/Bookmark");
const { analyzeWithGemini, analyzeDanceWithGemini, correctCaptionsWithGemini, generateQuizWithGemini, translateCaptionsWithGemini } = require("../services/geminiService");
const { generateCaptionsFromYouTube } = require("../services/captionService");
const { generateCaptionsFromAudio } = require("../services/audioTranscriptionService");
const { STATUS, createJob, updateJob } = require("../queue/jobQueue");
const { logAiRequest } = require("../services/aiLogger");

const ANALYSIS_VERSION = 4;

function clampTimeRange(startTime, endTime, durationSeconds) {
  const duration = Number(durationSeconds) || 0;
  let start = Number(startTime) || 0;
  let end = Number(endTime) || start + 1;

  if (duration > 0) {
    start = Math.min(Math.max(0, start), Math.max(0, duration - 1));
    end = Math.min(Math.max(start + 1, end), duration);
  } else {
    start = Math.max(0, start);
    end = Math.max(start + 1, end);
  }

  return { startTime: start, endTime: end };
}

function isValidRange(segment, durationSeconds) {
  const duration = Number(durationSeconds) || 0;
  if (segment.endTime <= segment.startTime) return false;
  if (duration > 0 && segment.startTime >= duration) return false;
  return true;
}

function normalizeYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let id = null;

    if (host === "youtu.be") {
      id = parsed.pathname.split("/").filter(Boolean)[0];
    } else if (host.endsWith("youtube.com")) {
      id = parsed.searchParams.get("v");
      if (!id && parsed.pathname.startsWith("/shorts/")) {
        id = parsed.pathname.split("/").filter(Boolean)[1];
      }
    }

    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  } catch {
    return url;
  }
}

function segmentSearchText(segments) {
  return segments
    .map((s) => [s.title, s.summary, s.bodyPosition, s.movementCue, ...(s.practiceTips || [])].filter(Boolean).join(" "))
    .join("\n")
    .slice(0, 120000);
}

function classifyVideoMode({ title = "", transcript = "", url = "", segments = [] }) {
  const text = [
    title,
    transcript.slice(0, 20000),
    url,
    ...segments.slice(0, 24).map((s) => [s.title, s.summary, s.movementCue, s.bodyPosition].filter(Boolean).join(" ")),
  ].join(" ").toLowerCase();

  const danceSignals = [
    "dance", "choreo", "choreography", "routine", "cover dance", "dance practice",
    "footwork", "counts", "8-count", "move", "moves", "mirror", "full speed",
    "slow tutorial", "hand sequence", "warmup", "chorus", "transition",
  ];
  const studySignals = [
    "lecture", "lesson", "tutorial", "course", "explainer", "concept", "theory",
    "chapter", "study", "learn", "exam", "quiz", "summary", "introduction",
    "programming", "react", "javascript", "math", "history", "philosophy",
  ];

  const matchedDance = danceSignals.filter((signal) => text.includes(signal));
  const matchedStudy = studySignals.filter((signal) => text.includes(signal));
  const danceScore = matchedDance.length;
  const studyScore = matchedStudy.length;

  if (danceScore >= Math.max(2, studyScore + 1)) {
    return {
      detectedMode: "dance",
      modeConfidence: Math.min(0.95, 0.55 + danceScore * 0.08),
      modeSignals: matchedDance.slice(0, 8),
    };
  }

  if (studyScore >= Math.max(2, danceScore + 1)) {
    return {
      detectedMode: "study",
      modeConfidence: Math.min(0.95, 0.55 + studyScore * 0.07),
      modeSignals: matchedStudy.slice(0, 8),
    };
  }

  return {
    detectedMode: "general",
    modeConfidence: 0.35,
    modeSignals: [...matchedDance, ...matchedStudy].slice(0, 8),
  };
}

// Shared analysis logic — used by the async job worker
async function runAnalysis(video, durationSeconds) {
  if (durationSeconds) video.durationSeconds = durationSeconds;
  video.analysisStatus = "processing";
  video.analysisVersion = ANALYSIS_VERSION;
  await video.save();

  const { segments: rawSegments, title, transcript } = await analyzeWithGemini(video.url, {
    durationSeconds: video.durationSeconds,
  });
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    video.analysisStatus = "error";
    await video.save();
    throw new Error("Gemini could not access or segment this YouTube video.");
  }

  await Segment.deleteMany({ videoId: video._id });
  const segments = await Segment.insertMany(
    rawSegments.map((s) => ({
      videoId: video._id,
      title: String(s.title || "Untitled segment"),
      summary: String(s.summary || ""),
      type: "topic",
      ...clampTimeRange(s.startTime, s.endTime, video.durationSeconds),
    })).filter((segment) => isValidRange(segment, video.durationSeconds))
  );

  video.title = title || "Analyzed Video";
  video.transcript = transcript || "";
  video.segmentSearchText = segmentSearchText(segments);
  Object.assign(video, classifyVideoMode({
    title: video.title,
    transcript: video.transcript,
    url: video.url,
    segments,
  }));
  video.analysisStatus = "done";
  video.analysisVersion = ANALYSIS_VERSION;
  await video.save();

  return { video, segments };
}

// POST /api/videos/analyze
// Returns cached result immediately; otherwise queues a job and returns { jobId } for the client to poll.
function formatAnalysisError(err) {
  const message = err?.message || "Analysis failed";
  const retryMatch = message.match(/retry(?:\s+in)?\s+([0-9.]+s|[0-9.]+\s*seconds?)/i) ||
    message.match(/retryDelay":"([^"]+)"/i);

  if (message.includes("429") || message.toLowerCase().includes("quota")) {
    const retryText = retryMatch?.[1] ? ` Try again in about ${retryMatch[1].replace(/\s+/g, " ")}.` : "";
    return `Gemini quota is temporarily exhausted for this API key.${retryText} Saved videos can still be opened from your Framewise library.`;
  }

  if (message.includes("PROHIBITED_CONTENT") || message.includes("Response was blocked")) {
    return "Gemini blocked this video due to its content. Please try a different video.";
  }

  return message;
}

function isQuotaError(err) {
  const message = err?.message || "";
  return message.includes("429") || message.toLowerCase().includes("quota") || message.toLowerCase().includes("too many requests");
}

const analyzeVideo = async (req, res, next) => {
  try {
    const { source = "youtube", force = false } = req.body;
    const durationSeconds = Number(req.body.durationSeconds) || undefined;
    const url = normalizeYouTubeUrl(req.body.url);
    if (!url) return res.status(400).json({ error: "url is required" });

    // Serve from cache immediately
    const existing = await Video.findOne({ url, userId: req.user.id, analysisStatus: "done" });
    if (existing && !force && existing.analysisVersion >= ANALYSIS_VERSION) {
      const segments = await Segment.find({ videoId: existing._id, type: "topic" }).sort("startTime");
      return res.json({ video: existing, segments, cached: true });
    }

    const video = existing || await Video.create({ userId: req.user.id, url, source });
    logAiRequest("queue.analyze", { userId: req.user.id, videoId: video._id, force, durationSeconds });

    // Create a job and return immediately — client polls GET /api/jobs/:jobId
    const job = createJob("analyze", { videoId: video._id.toString(), url, durationSeconds });
    res.json({ jobId: job.id, status: job.status });

    // Process asynchronously (fire-and-forget from the request perspective)
    setImmediate(async () => {
      updateJob(job.id, { status: STATUS.PROCESSING, message: "Gemini is reading the video…", progress: 10 });
      try {
        const { video: updatedVideo, segments } = await runAnalysis(video, durationSeconds);
        updateJob(job.id, {
          status: STATUS.COMPLETED,
          progress: 100,
          message: "Done",
          result: { videoId: updatedVideo._id.toString(), segmentCount: segments.length },
        });
      } catch (err) {
        const userMessage = formatAnalysisError(err);
        updateJob(job.id, { status: STATUS.FAILED, message: userMessage, error: userMessage });
        console.error("[analyzeVideo job]", err.message);
      }
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/videos/:videoId/dance
const analyzeDance = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    if (!req.body.force) {
      const existingDanceSegments = await Segment.find({ videoId: video._id, type: "dance" }).sort("startTime");
      if (existingDanceSegments.length > 0) {
        return res.json({ segments: existingDanceSegments, cached: true });
      }
    }

    const durationSeconds = Number(req.body.durationSeconds) || video.durationSeconds;
    if (durationSeconds && durationSeconds !== video.durationSeconds) {
      video.durationSeconds = durationSeconds;
      await video.save();
    }

    logAiRequest("request.dance", { userId: req.user.id, videoId: video._id, durationSeconds, force: !!req.body.force });
    const { segments: rawSegments } = await analyzeDanceWithGemini(video.url, { durationSeconds });
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
      return res.status(502).json({ error: "Gemini could not detect teachable dance moves in this video." });
    }

    await Segment.deleteMany({ videoId: video._id, type: "dance" });
    const segments = await Segment.insertMany(
      rawSegments.map((s) => ({
        videoId: video._id,
        type: "dance",
        title: String(s.title || "Dance step"),
        summary: String(s.summary || ""),
        bodyPosition: String(s.bodyPosition || ""),
        movementCue: String(s.movementCue || ""),
        practiceTips: Array.isArray(s.practiceTips) ? s.practiceTips.map(String).slice(0, 4) : [],
        mirrorTip: String(s.mirrorTip || ""),
        difficulty: ["easy", "medium", "hard"].includes(s.difficulty) ? s.difficulty : "medium",
        ...clampTimeRange(s.startTime, s.endTime, video.durationSeconds),
      })).filter((segment) => isValidRange(segment, video.durationSeconds))
    );

    const allSegments = await Segment.find({ videoId: video._id });
    video.segmentSearchText = segmentSearchText(allSegments);
    video.detectedMode = "dance";
    video.modeConfidence = Math.max(Number(video.modeConfidence) || 0, 0.9);
    video.modeSignals = Array.from(new Set([...(video.modeSignals || []), "dance analysis", "movement segments"])).slice(0, 8);
    await video.save();

    res.json({ segments });
  } catch (err) {
    next(err);
  }
};

const listVideos = async (req, res, next) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.collectionId) query.collectionIds = req.query.collectionId;
    const videos = await Video.find(query).sort("-createdAt");
    res.json(videos);
  } catch (err) {
    next(err);
  }
};

const searchVideos = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const collectionId = String(req.query.collectionId || "").trim();
    if (!q) {
      const query = { userId: req.user.id };
      if (collectionId) query.collectionIds = collectionId;
      const videos = await Video.find(query).sort("-createdAt").limit(50);
      return res.json(videos);
    }

    const query = { userId: req.user.id, $text: { $search: q } };
    if (collectionId) query.collectionIds = collectionId;

    const textMatches = await Video.find(query, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, updatedAt: -1 })
      .limit(50);

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const segmentMatches = await Segment.find({ $or: [{ title: regex }, { summary: regex }] }).distinct("videoId");
    const fallbackQuery = {
      userId: req.user.id,
      _id: { $in: segmentMatches, $nin: textMatches.map((video) => video._id) },
    };
    if (collectionId) fallbackQuery.collectionIds = collectionId;
    const fallbackMatches = await Video.find(fallbackQuery).sort("-updatedAt").limit(Math.max(0, 50 - textMatches.length));

    res.json([...textMatches, ...fallbackMatches]);
  } catch (err) {
    next(err);
  }
};

const lookupVideo = async (req, res, next) => {
  try {
    const url = normalizeYouTubeUrl(req.query.url);
    if (!url) return res.status(400).json({ error: "url is required" });

    const video = await Video.findOne({ url, userId: req.user.id, analysisStatus: "done" });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const segments = await Segment.find({ videoId: video._id, type: "topic" }).sort("startTime");
    res.json({ video, segments, cached: true });
  } catch (err) {
    next(err);
  }
};

const getVideo = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json(video);
  } catch (err) {
    next(err);
  }
};

const updateVideoMode = async (req, res, next) => {
  try {
    const modeOverride = String(req.body.modeOverride || "").trim();
    if (!["auto", "study", "dance"].includes(modeOverride)) {
      return res.status(400).json({ error: "modeOverride must be auto, study, or dance" });
    }

    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    video.modeOverride = modeOverride;
    await video.save();
    res.json(video);
  } catch (err) {
    next(err);
  }
};

const getSegments = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const query = { videoId: video._id };
    if (req.query.type) query.type = req.query.type;
    const rawSegments = await Segment.find(query).sort("startTime");
    const segments = rawSegments
      .map((segment) => ({
        ...segment.toObject(),
        ...clampTimeRange(segment.startTime, segment.endTime, video.durationSeconds),
      }))
      .filter((segment) => isValidRange(segment, video.durationSeconds));
    res.json(segments);
  } catch (err) {
    next(err);
  }
};

const updateProgress = async (req, res, next) => {
  try {
    const position = Math.max(0, Number(req.body.positionSeconds) || 0);
    const durationSeconds = Number(req.body.durationSeconds) || undefined;
    const update = { lastPositionSeconds: position, lastWatchedAt: new Date() };
    if (durationSeconds) update.durationSeconds = durationSeconds;
    const video = await Video.findOneAndUpdate(
      { _id: req.params.videoId, userId: req.user.id },
      update,
      { new: true }
    );
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json({
      videoId: video._id,
      lastPositionSeconds: video.lastPositionSeconds,
      lastWatchedAt: video.lastWatchedAt,
    });
  } catch (err) {
    next(err);
  }
};

const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findOneAndDelete({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    await Promise.all([
      Segment.deleteMany({ videoId: video._id }),
      Caption.deleteMany({ videoId: video._id, userId: req.user.id }),
      ChatMessage.deleteMany({ videoId: video._id, userId: req.user.id }),
      Note.deleteMany({ videoId: video._id, userId: req.user.id }),
      Bookmark.deleteMany({ videoId: video._id, userId: req.user.id }),
      Collection.updateMany({ userId: req.user.id }, { $pull: { videoIds: video._id } }),
    ]);

    res.json({ success: true });
  } catch (err) { next(err); }
};

const getCaptions = async (req, res, next) => {
  try {
    const captions = await Caption.find({ videoId: req.params.videoId, userId: req.user.id }).sort("startTime");
    res.json(captions);
  } catch (err) {
    next(err);
  }
};

// POST /api/videos/:videoId/captions/correct
const correctCaptions = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    if (!req.body.force) {
      const existing = await Caption.find({ videoId: video._id, userId: req.user.id }).sort("startTime");
      if (existing.length && !Array.isArray(req.body.captions)) {
        return res.json({ captions: existing, cached: true });
      }
    }

    const inputCaptions = Array.isArray(req.body.captions) ? req.body.captions : [];
    const normalized = inputCaptions.map((caption) => ({
      startTime: Number(caption.startTime) || 0,
      endTime: Number(caption.endTime) || 0,
      text: String(caption.text || "").trim(),
    })).filter((caption) => caption.text);

    logAiRequest("request.captions.correct", { userId: req.user.id, videoId: video._id, inputCaptions: normalized.length, force: !!req.body.force });
    const { captions: correctedCaptions } = await correctCaptionsWithGemini({
      videoUrl: video.url,
      captions: normalized,
      durationSeconds: video.durationSeconds,
    });

    await Caption.deleteMany({ videoId: video._id, userId: req.user.id });
    const captions = await Caption.insertMany(
      correctedCaptions.map((caption, index) => ({
        videoId: video._id,
        userId: req.user.id,
        ...clampTimeRange(
          caption.startTime ?? normalized[index]?.startTime,
          caption.endTime ?? normalized[index]?.endTime,
          video.durationSeconds
        ),
        text: normalized[index]?.text || String(caption.text || ""),
        correctedText: String(caption.text || ""),
        status: normalized[index] ? "corrected" : "draft",
      })).filter((caption) => caption.correctedText && isValidRange(caption, video.durationSeconds))
    );

    res.json({ captions });
  } catch (err) {
    res.status(isQuotaError(err) ? 429 : 500).json({ error: formatAnalysisError(err) });
  }
};

// POST /api/videos/:videoId/captions/generate
const generateCaptions = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    if (!req.body.force) {
      const existing = await Caption.find({ videoId: video._id, userId: req.user.id }).sort("startTime");
      if (existing.length) return res.json({ captions: existing, count: existing.length, cached: true });
    }

    logAiRequest("request.captions.youtube", { userId: req.user.id, videoId: video._id, force: !!req.body.force });
    const cues = await generateCaptionsFromYouTube(video.url);

    await Caption.deleteMany({ videoId: video._id, userId: req.user.id });
    const captions = await Caption.insertMany(
      cues
        .map((c) => ({
          videoId:       video._id,
          userId:        req.user.id,
          ...clampTimeRange(c.startTime, c.endTime, video.durationSeconds),
          text:          c.text,
          correctedText: c.text,
          status:        "draft",
        }))
        .filter((c) => isValidRange(c, video.durationSeconds))
    );

    res.json({ captions, count: captions.length });
  } catch (err) {
    if (err.message?.includes("No captions available")) {
      return res.status(422).json({ error: err.message });
    }
    next(err);
  }
};

// POST /api/videos/:videoId/captions/generate-audio
const generateCaptionsAudio = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    if (!req.body.force) {
      const existing = await Caption.find({ videoId: video._id, userId: req.user.id }).sort("startTime");
      if (existing.length) return res.json({ captions: existing, count: existing.length, source: "cache", cached: true });
    }

    let cues;
    let source = "elevenlabs";
    try {
      logAiRequest("request.captions.audio", { userId: req.user.id, videoId: video._id, force: !!req.body.force });
      cues = await generateCaptionsFromAudio(video.url);
    } catch (audioErr) {
      if (!audioErr.message?.includes("Audio download failed")) throw audioErr;
      console.warn("Audio transcription failed, falling back to Gemini captions:", audioErr.message);
      logAiRequest("request.captions.gemini_fallback", { userId: req.user.id, videoId: video._id });
      const fallback = await correctCaptionsWithGemini({
        videoUrl: video.url,
        captions: [],
        durationSeconds: video.durationSeconds,
      });
      cues = fallback.captions || [];
      source = "gemini";
    }

    await Caption.deleteMany({ videoId: video._id, userId: req.user.id });
    const captions = await Caption.insertMany(
      cues
        .map((c) => ({
          videoId:       video._id,
          userId:        req.user.id,
          ...clampTimeRange(c.startTime, c.endTime, video.durationSeconds),
          text:          c.text,
          correctedText: c.text,
          status:        "draft",
        }))
        .filter((c) => isValidRange(c, video.durationSeconds))
    );

    res.json({ captions, count: captions.length, source });
  } catch (err) {
    if (
      err.message?.includes("not configured") ||
      err.message?.includes("ELEVENLABS")
    ) {
      return res.status(503).json({ error: err.message });
    }
    if (err.message?.includes("Audio download failed") || err.message?.includes("private") || err.message?.includes("sign-in")) {
      return res.status(422).json({ error: err.message });
    }
    res.status(isQuotaError(err) ? 429 : 500).json({ error: formatAnalysisError(err) });
  }
};

// POST /api/videos/:videoId/captions/translate
const translateCaptions = async (req, res, next) => {
  try {
    const { language } = req.body;
    if (!language?.trim()) return res.status(400).json({ error: "language is required" });

    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const captions = await Caption.find({ videoId: video._id, userId: req.user.id }).sort("startTime");
    if (!captions.length) return res.status(422).json({ error: "Generate captions first before translating." });
    const normalizedLanguage = language.trim();
    if (!req.body.force && captions.every((caption) => caption.translatedLanguage === normalizedLanguage && caption.translatedText)) {
      return res.json({ captions, language: normalizedLanguage, cached: true });
    }

    logAiRequest("request.captions.translate", { userId: req.user.id, videoId: video._id, language: normalizedLanguage, force: !!req.body.force });
    const translated = await translateCaptionsWithGemini({ captions, language: normalizedLanguage });

    const ops = translated.map((t, i) => {
      const caption = captions[i];
      if (!caption) return null;
      return {
        updateOne: {
          filter: { _id: caption._id },
          update: { $set: { translatedText: String(t.text || ""), translatedLanguage: normalizedLanguage } },
        },
      };
    }).filter(Boolean);

    if (ops.length) await Caption.bulkWrite(ops);

    const updated = await Caption.find({ videoId: video._id, userId: req.user.id }).sort("startTime");
    res.json({ captions: updated, language: normalizedLanguage });
  } catch (err) {
    res.status(isQuotaError(err) ? 429 : 500).json({ error: formatAnalysisError(err) });
  }
};

const generateQuiz = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    if (!req.body.force && Array.isArray(video.generatedQuiz) && video.generatedQuiz.length) {
      return res.json({ quiz: video.generatedQuiz, cached: true });
    }

    const segments = await Segment.find({ videoId: video._id, type: "topic" }).sort("startTime");
    logAiRequest("request.quiz", { userId: req.user.id, videoId: video._id, segments: segments.length, force: !!req.body.force });
    const { quiz } = await generateQuizWithGemini({
      title: video.title,
      transcript: video.transcript,
      segments,
      videoUrl: video.url,
    });

    if (!quiz.length) {
      return res.status(500).json({ error: "Gemini could not generate questions for this video — it may be restricted or unavailable." });
    }

    video.generatedQuiz = quiz.map((item) => ({
      question: String(item.question || ""),
      answer: String(item.answer || ""),
      timestamp: item.timestamp == null ? null : Number(item.timestamp),
    })).filter((item) => item.question && item.answer);
    video.generatedQuizAt = new Date();
    await video.save();

    res.json({ quiz });
  } catch (err) {
    res.status(isQuotaError(err) ? 429 : 500).json({ error: formatAnalysisError(err) });
  }
};

// PUT /api/videos/:videoId/captions — bulk save edited captions from the web app
const saveCaptions = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const incoming = Array.isArray(req.body.captions) ? req.body.captions : [];
    if (!incoming.length) return res.status(400).json({ error: "captions array is required" });

    await Caption.deleteMany({ videoId: video._id, userId: req.user.id });
    const captions = await Caption.insertMany(
      incoming
        .map((c) => ({
          videoId: video._id,
          userId: req.user.id,
          ...clampTimeRange(c.startTime, c.endTime, video.durationSeconds),
          text: String(c.text || ""),
          correctedText: String(c.correctedText || c.text || ""),
          status: "corrected",
        }))
        .filter((c) => c.text && isValidRange(c, video.durationSeconds))
    );

    res.json({ captions, count: captions.length });
  } catch (err) { next(err); }
};

// POST /api/videos/:videoId/transcript — import a raw transcript string
const importTranscript = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const transcript = String(req.body.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "transcript is required" });
    if (transcript.length > 200_000) return res.status(413).json({ error: "Transcript exceeds 200 000 character limit" });

    video.transcript = transcript;
    await video.save();

    res.json({ success: true, length: transcript.length });
  } catch (err) { next(err); }
};

module.exports = {
  analyzeVideo,
  analyzeDance,
  listVideos,
  searchVideos,
  lookupVideo,
  getVideo,
  updateVideoMode,
  getSegments,
  updateProgress,
  deleteVideo,
  getCaptions,
  correctCaptions,
  generateCaptions,
  generateCaptionsAudio,
  translateCaptions,
  generateQuiz,
  saveCaptions,
  importTranscript,
};

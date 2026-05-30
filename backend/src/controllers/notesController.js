const Note = require("../models/Note");
const Video = require("../models/Video");
const Segment = require("../models/Segment");
const { generateNotesWithGemini } = require("../services/geminiService");
const { logAiRequest } = require("../services/aiLogger");

function isQuotaError(err) {
  const message = err?.message || "";
  return message.includes("429") || message.toLowerCase().includes("quota") || message.toLowerCase().includes("too many requests");
}

function formatAiError(err) {
  if (isQuotaError(err)) return "Gemini quota is temporarily exhausted for this API key. Please try again later, or use already generated notes.";
  return err?.message || "AI note generation failed.";
}

const getNotes = async (req, res, next) => {
  try {
    const notes = await Note.find({ videoId: req.params.videoId, userId: req.user.id }).sort("timestamp");
    res.json(notes);
  } catch (err) { next(err); }
};

const addNote = async (req, res, next) => {
  try {
    const { timestamp, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Note content is required" });

    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });

    const note = await Note.create({
      videoId:   video._id,
      userId:    req.user.id,
      timestamp: Number(timestamp) || 0,
      content:   content.trim(),
    });
    res.status(201).json(note);
  } catch (err) { next(err); }
};

const deleteNote = async (req, res, next) => {
  try {
    await Note.findOneAndDelete({ _id: req.params.noteId, userId: req.user.id });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/videos/:videoId/notes/generate
const generateNotes = async (req, res, next) => {
  try {
    const video = await Video.findOne({ _id: req.params.videoId, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found" });
    if (!req.body.force) {
      const existing = await Note.find({ videoId: video._id, userId: req.user.id }).sort("timestamp");
      if (existing.length) return res.json(existing);
    }

    const segments = await Segment.find({ videoId: video._id, type: "topic" }).sort("startTime");
    logAiRequest("request.notes", { userId: req.user.id, videoId: video._id, segments: segments.length, force: !!req.body.force });
    const rawNotes = await generateNotesWithGemini({
      title: video.title,
      transcript: video.transcript,
      segments,
    });

    const notes = await Note.insertMany(
      rawNotes
        .filter((n) => n?.content?.trim())
        .map((n) => ({
          videoId:   video._id,
          userId:    req.user.id,
          timestamp: Number(n.timestamp) || 0,
          content:   String(n.content).trim(),
        }))
    );

    res.status(201).json(notes);
  } catch (err) {
    res.status(isQuotaError(err) ? 429 : 500).json({ error: formatAiError(err) });
  }
};

module.exports = { getNotes, addNote, deleteNote, generateNotes };

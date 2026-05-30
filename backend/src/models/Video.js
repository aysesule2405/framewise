const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    source:         { type: String, enum: ["youtube", "upload"], required: true },
    url:            { type: String, required: true },
    title:          { type: String, default: "Untitled Video" },
    thumbnail:      { type: String },
    transcript:     { type: String },
    segmentSearchText: { type: String, default: "" },
    durationSeconds: { type: Number },
    collectionIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    lastPositionSeconds: { type: Number, default: 0 },
    lastWatchedAt:  { type: Date },
    detectedMode:   { type: String, enum: ["study", "dance", "general"], default: "general" },
    modeOverride:   { type: String, enum: ["auto", "study", "dance"], default: "auto" },
    modeConfidence: { type: Number, default: 0 },
    modeSignals:    [{ type: String }],
    analysisVersion: { type: Number, default: 0 },
    analysisStatus: { type: String, enum: ["pending", "processing", "done", "error"], default: "pending" },
    generatedQuiz: [{
      question:  { type: String },
      answer:    { type: String },
      timestamp: { type: Number, default: null },
    }],
    generatedQuizAt: { type: Date },
  },
  { timestamps: true }
);

videoSchema.index(
  { title: "text", transcript: "text", segmentSearchText: "text" },
  { weights: { title: 8, segmentSearchText: 5, transcript: 1 } }
);
videoSchema.index({ userId: 1, url: 1 });
videoSchema.index({ userId: 1, lastWatchedAt: -1 });
videoSchema.index({ userId: 1, collectionIds: 1 });
videoSchema.index({ userId: 1, detectedMode: 1 });
videoSchema.index({ userId: 1, modeOverride: 1 });

module.exports = mongoose.model("Video", videoSchema);

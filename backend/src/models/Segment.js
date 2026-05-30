const mongoose = require("mongoose");

const segmentSchema = new mongoose.Schema(
  {
    videoId:   { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    title:     { type: String, required: true },
    summary:   { type: String },
    type:      { type: String, enum: ["topic", "dance"], default: "topic" },
    bodyPosition: { type: String },
    movementCue:  { type: String },
    practiceTips: [{ type: String }],
    mirrorTip:    { type: String },
    difficulty:   { type: String, enum: ["easy", "medium", "hard"] },
    startTime: { type: Number, required: true }, // seconds
    endTime:   { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Segment", segmentSchema);

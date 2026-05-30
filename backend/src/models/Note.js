const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    videoId:   { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
    timestamp: { type: Number, required: true },
    content:   { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

noteSchema.index({ videoId: 1, userId: 1, timestamp: 1 });

module.exports = mongoose.model("Note", noteSchema);

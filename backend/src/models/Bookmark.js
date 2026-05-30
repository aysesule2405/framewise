const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema(
  {
    videoId:   { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    timestamp: { type: Number, required: true },
    label:     { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

bookmarkSchema.index({ videoId: 1, userId: 1, timestamp: 1 });

module.exports = mongoose.model("Bookmark", bookmarkSchema);

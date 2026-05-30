const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    videoId:          { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role:             { type: String, enum: ["user", "assistant"], required: true },
    content:          { type: String, required: true },
    linkedSegmentTime: { type: Number, default: null }, // timestamp in seconds if AI references a moment
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);

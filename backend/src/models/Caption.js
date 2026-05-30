const mongoose = require("mongoose");

const captionSchema = new mongoose.Schema(
  {
    videoId:       { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startTime:     { type: Number, required: true },
    endTime:       { type: Number, required: true },
    text:          { type: String, required: true },
    correctedText:      { type: String },
    translatedText:     { type: String },
    translatedLanguage: { type: String },
    status:             { type: String, enum: ["draft", "corrected", "approved"], default: "draft" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Caption", captionSchema);

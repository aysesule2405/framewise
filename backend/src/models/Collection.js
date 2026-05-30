const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:     { type: String, required: true, trim: true, maxlength: 80 },
    videoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
  },
  { timestamps: true }
);

collectionSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Collection", collectionSchema);

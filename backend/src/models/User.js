const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: {
      type: String,
      required: function () { return !this.googleId; },
    },
    googleId:     { type: String, sparse: true, unique: true },
    displayName:  { type: String, unique: true, sparse: true, trim: true },
    bio:          { type: String, trim: true, maxlength: 160 },
    learningGoal: { type: String, trim: true, maxlength: 160 },
    avatarColor:  { type: String, trim: true, default: "rust" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

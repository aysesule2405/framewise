const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Video = require("../models/Video");
const Segment = require("../models/Segment");
const Caption = require("../models/Caption");
const ChatMessage = require("../models/ChatMessage");
const Note = require("../models/Note");
const Bookmark = require("../models/Bookmark");
const Collection = require("../models/Collection");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const publicUser = (user) => ({
  id: user._id,
  email: user.email,
  displayName: user.displayName,
  bio: user.bio || "",
  learningGoal: user.learningGoal || "",
  avatarColor: user.avatarColor || "rust",
});

const signToken = (user) =>
  jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const register = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    const existingEmail = await User.findOne({ email });
    if (existingEmail) return res.status(409).json({ error: "Email already registered" });

    if (displayName) {
      const existingName = await User.findOne({ displayName });
      if (existingName) return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash, displayName });
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.passwordHash) return res.status(401).json({ error: "This account uses Google sign-in" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
};

const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing Google credential" });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // New user — ensure displayName is unique
      let displayName = name;
      const nameTaken = await User.findOne({ displayName });
      if (nameTaken) displayName = `${name}${Math.floor(Math.random() * 9000) + 1000}`;

      user = await User.create({ email, googleId, displayName });
    } else if (!user.googleId) {
      // Existing email account — link Google
      user.googleId = googleId;
      await user.save();
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    res.json(user);
  } catch (err) { next(err); }
};

const updateMe = async (req, res, next) => {
  try {
    const { displayName, bio, learningGoal, avatarColor } = req.body;
    if (!displayName?.trim()) return res.status(400).json({ error: "Display name is required" });
    const trimmed = displayName.trim();
    const taken = await User.findOne({ displayName: trimmed, _id: { $ne: req.user.id } });
    if (taken) return res.status(409).json({ error: "Username already taken" });
    const allowedAvatarColors = new Set(["rust", "sage", "peach", "cocoa"]);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        displayName: trimmed,
        bio: String(bio || "").trim().slice(0, 160),
        learningGoal: String(learningGoal || "").trim().slice(0, 160),
        avatarColor: allowedAvatarColors.has(avatarColor) ? avatarColor : "rust",
      },
      { new: true }
    ).select("-passwordHash");
    res.json(user);
  } catch (err) { next(err); }
};

const deleteMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const videos = await Video.find({ userId }).select("_id");
    const videoIds = videos.map((v) => v._id);

    await Promise.all([
      Segment.deleteMany({ videoId: { $in: videoIds } }),
      Caption.deleteMany({ videoId: { $in: videoIds } }),
      ChatMessage.deleteMany({ videoId: { $in: videoIds } }),
      Note.deleteMany({ videoId: { $in: videoIds } }),
      Bookmark.deleteMany({ userId }),
      Collection.deleteMany({ userId }),
      Video.deleteMany({ userId }),
    ]);
    await User.findByIdAndDelete(userId);

    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { register, login, googleAuth, getMe, updateMe, deleteMe };

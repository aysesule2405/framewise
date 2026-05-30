const Bookmark = require("../models/Bookmark");
const Video = require("../models/Video");

async function findOwnedVideo(videoId, userId) {
  return Video.findOne({ _id: videoId, userId });
}

const listBookmarks = async (req, res, next) => {
  try {
    const video = await findOwnedVideo(req.params.videoId, req.user.id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const bookmarks = await Bookmark.find({ videoId: video._id, userId: req.user.id }).sort("timestamp");
    res.json(bookmarks);
  } catch (err) { next(err); }
};

const addBookmark = async (req, res, next) => {
  try {
    const video = await findOwnedVideo(req.params.videoId, req.user.id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const label = String(req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "Bookmark label is required" });

    const bookmark = await Bookmark.create({
      videoId: video._id,
      userId: req.user.id,
      timestamp: Math.max(0, Number(req.body.timestamp) || 0),
      label,
    });
    res.status(201).json(bookmark);
  } catch (err) { next(err); }
};

const updateBookmark = async (req, res, next) => {
  try {
    const label = String(req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "label is required" });

    const bookmark = await Bookmark.findOneAndUpdate(
      { _id: req.params.bookmarkId, videoId: req.params.videoId, userId: req.user.id },
      { $set: { label } },
      { new: true }
    );
    if (!bookmark) return res.status(404).json({ error: "Bookmark not found" });
    res.json(bookmark);
  } catch (err) { next(err); }
};

const deleteBookmark = async (req, res, next) => {
  try {
    await Bookmark.findOneAndDelete({
      _id: req.params.bookmarkId,
      videoId: req.params.videoId,
      userId: req.user.id,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { listBookmarks, addBookmark, updateBookmark, deleteBookmark };

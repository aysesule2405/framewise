const Collection = require("../models/Collection");
const Video = require("../models/Video");

const listCollections = async (req, res, next) => {
  try {
    const collections = await Collection.find({ userId: req.user.id }).sort("name");
    res.json(collections);
  } catch (err) { next(err); }
};

const createCollection = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Collection name is required" });

    const collection = await Collection.create({ userId: req.user.id, name, videoIds: [] });
    res.status(201).json(collection);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Collection already exists" });
    next(err);
  }
};

const addVideoToCollection = async (req, res, next) => {
  try {
    const [collection, video] = await Promise.all([
      Collection.findOne({ _id: req.params.collectionId, userId: req.user.id }),
      Video.findOne({ _id: req.body.videoId, userId: req.user.id }),
    ]);
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    if (!video) return res.status(404).json({ error: "Video not found" });

    await Promise.all([
      Collection.updateOne({ _id: collection._id }, { $addToSet: { videoIds: video._id } }),
      Video.updateOne({ _id: video._id }, { $addToSet: { collectionIds: collection._id } }),
    ]);

    const updated = await Collection.findById(collection._id);
    res.json(updated);
  } catch (err) { next(err); }
};

const removeVideoFromCollection = async (req, res, next) => {
  try {
    const collection = await Collection.findOne({ _id: req.params.collectionId, userId: req.user.id });
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    await Promise.all([
      Collection.updateOne({ _id: collection._id }, { $pull: { videoIds: req.params.videoId } }),
      Video.updateOne({ _id: req.params.videoId, userId: req.user.id }, { $pull: { collectionIds: collection._id } }),
    ]);

    const updated = await Collection.findById(collection._id);
    res.json(updated);
  } catch (err) { next(err); }
};

const renameCollection = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const collection = await Collection.findOneAndUpdate(
      { _id: req.params.collectionId, userId: req.user.id },
      { $set: { name } },
      { new: true }
    );
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    res.json(collection);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Collection name already in use" });
    next(err);
  }
};

const deleteCollection = async (req, res, next) => {
  try {
    const collection = await Collection.findOneAndDelete({ _id: req.params.collectionId, userId: req.user.id });
    if (collection) {
      await Video.updateMany({ userId: req.user.id }, { $pull: { collectionIds: collection._id } });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = {
  listCollections,
  createCollection,
  renameCollection,
  addVideoToCollection,
  removeVideoFromCollection,
  deleteCollection,
};

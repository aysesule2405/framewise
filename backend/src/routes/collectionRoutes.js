const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");
const {
  listCollections,
  createCollection,
  renameCollection,
  addVideoToCollection,
  removeVideoFromCollection,
  deleteCollection,
} = require("../controllers/collectionController");

router.use(protect);

const col    = validateObjectId("collectionId");
const colVid = validateObjectId("collectionId", "videoId");

router.get("/",  listCollections);
router.post("/", createCollection);
router.patch("/:collectionId",                    col,    renameCollection);
router.post("/:collectionId/videos",              col,    addVideoToCollection);
router.delete("/:collectionId/videos/:videoId",   colVid, removeVideoFromCollection);
router.delete("/:collectionId",                   col,    deleteCollection);

module.exports = router;

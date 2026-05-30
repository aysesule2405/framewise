const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");
const timeout = require("../middleware/timeout");
const rateLimiter = require("../middleware/rateLimiter");
const {
  analyzeVideo, analyzeDance, getVideo, listVideos, searchVideos, lookupVideo, updateProgress,
  deleteVideo, getSegments, getCaptions, correctCaptions, generateCaptions, generateCaptionsAudio, translateCaptions, generateQuiz,
  saveCaptions, importTranscript, updateVideoMode,
} = require("../controllers/videoController");
const { getNotes, addNote, deleteNote, generateNotes } = require("../controllers/notesController");
const { listBookmarks, addBookmark, updateBookmark, deleteBookmark } = require("../controllers/bookmarkController");

router.use(protect);

// AI rate limit: 15 requests per minute per user
const aiLimit = rateLimiter({ windowMs: 60_000, max: 15, message: "Too many AI requests — please wait a minute." });

// Non-parameterized routes
router.post("/analyze",  aiLimit, timeout(180_000), analyzeVideo);
router.get("/search",                      searchVideos);
router.get("/lookup",                      lookupVideo);
router.get("/",                            listVideos);

// Parameterized routes — validate :videoId on all; validate :bookmarkId / :noteId where present
const vid  = validateObjectId("videoId");
const vidBm = validateObjectId("videoId", "bookmarkId");
const vidNt = validateObjectId("videoId", "noteId");

router.get("/:videoId",                          vid,   getVideo);
router.patch("/:videoId/mode",                   vid,   updateVideoMode);
router.delete("/:videoId",                       vid,   deleteVideo);
router.get("/:videoId/segments",                 vid,   getSegments);
router.patch("/:videoId/progress",               vid,   updateProgress);
router.post("/:videoId/dance",                   vid,   aiLimit, timeout(120_000), analyzeDance);
router.get("/:videoId/bookmarks",                vid,   listBookmarks);
router.post("/:videoId/bookmarks",               vid,   addBookmark);
router.patch("/:videoId/bookmarks/:bookmarkId",  vidBm, updateBookmark);
router.delete("/:videoId/bookmarks/:bookmarkId", vidBm, deleteBookmark);
router.get("/:videoId/captions",                 vid,   getCaptions);
router.post("/:videoId/captions/generate",       vid,   aiLimit, generateCaptions);
router.post("/:videoId/captions/generate-audio", vid,   aiLimit, timeout(300_000), generateCaptionsAudio);
router.post("/:videoId/captions/correct",        vid,   aiLimit, timeout(180_000), correctCaptions);
router.post("/:videoId/captions/translate",      vid,   aiLimit, translateCaptions);
router.put("/:videoId/captions",                 vid,   saveCaptions);
router.post("/:videoId/transcript",              vid,   importTranscript);
router.post("/:videoId/quiz",                    vid,   aiLimit, generateQuiz);
router.get("/:videoId/notes",                    vid,   getNotes);
router.post("/:videoId/notes",                   vid,   addNote);
router.post("/:videoId/notes/generate",          vid,   aiLimit, generateNotes);
router.delete("/:videoId/notes/:noteId",         vidNt, deleteNote);

module.exports = router;

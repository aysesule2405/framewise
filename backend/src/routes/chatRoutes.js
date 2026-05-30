const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const validateObjectId = require("../middleware/validateObjectId");
const rateLimiter = require("../middleware/rateLimiter");
const { sendMessage, getHistory, getVoice } = require("../controllers/chatController");

router.use(protect);

const vid = validateObjectId("videoId");
const aiLimit = rateLimiter({ windowMs: 60_000, max: 8, message: "Too many AI chat requests — please wait a minute." });

router.post("/:videoId/message", vid, aiLimit, sendMessage); // POST { content }
router.get("/:videoId/history",  vid, getHistory);  // GET  chat history
router.post("/:videoId/voice",   vid, getVoice);    // POST { text } → audio buffer

module.exports = router;

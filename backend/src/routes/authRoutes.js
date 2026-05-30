const express = require("express");
const router = express.Router();
const { register, login, googleAuth, getMe, updateMe, deleteMe } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login",    login);
router.post("/google",   googleAuth);
router.get("/me",        protect, getMe);
router.put("/me",        protect, updateMe);
router.delete("/me",     protect, deleteMe);

module.exports = router;

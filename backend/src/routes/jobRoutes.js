const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { getJob } = require("../queue/jobQueue");

router.use(protect);

// GET /api/jobs/:jobId
router.get("/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

module.exports = router;

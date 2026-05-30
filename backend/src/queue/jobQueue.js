const crypto = require("crypto");

// In-memory job store — no Redis required.
// Each job lives for 1 hour then is swept. Keys: id → { id, status, progress, message, result, error, createdAt }
const jobs = new Map();

const STATUS = { QUEUED: "queued", PROCESSING: "processing", COMPLETED: "completed", FAILED: "failed" };

function createJob(type, data) {
  const id = crypto.randomUUID();
  const job = {
    id, type, data,
    status: STATUS.QUEUED,
    progress: 0,
    message: "Queued",
    result: null,
    error: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) ?? null;
}

function updateJob(id, updates) {
  const job = jobs.get(id);
  if (job) Object.assign(job, updates);
  return job;
}

// Sweep completed/failed jobs older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 300_000).unref();

module.exports = { STATUS, createJob, getJob, updateJob };

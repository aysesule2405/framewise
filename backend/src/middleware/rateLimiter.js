// Lightweight in-process rate limiter — no Redis required.
// Tracks request counts per user (or IP fallback) in a sliding window.
const windows = new Map();

// Sweep expired windows every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (w.resetAt < now) windows.delete(key);
  }
}, 300_000).unref();

function rateLimiter({ windowMs = 60_000, max = 10, message = "Too many requests — please wait a moment." } = {}) {
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();

    let w = windows.get(key);
    if (!w || w.resetAt < now) {
      w = { count: 0, resetAt: now + windowMs };
      windows.set(key, w);
    }

    w.count += 1;
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - w.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(w.resetAt / 1000));

    if (w.count > max) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = rateLimiter;

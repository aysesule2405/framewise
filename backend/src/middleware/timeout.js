// Responds with 503 if the handler hasn't sent a response within `ms` milliseconds.
function timeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: "Request timed out — AI processing is taking too long. Please try again." });
      }
    }, ms);
    res.on("finish", () => clearTimeout(timer));
    res.on("close",  () => clearTimeout(timer));
    next();
  };
}

module.exports = timeout;

const { Types } = require("mongoose");

// Returns middleware that validates one or more named route params as MongoDB ObjectIds.
// Responds 400 immediately if any param is present but not a valid ObjectId.
function validateObjectId(...params) {
  return (req, res, next) => {
    for (const param of params) {
      const value = req.params[param];
      if (value && !Types.ObjectId.isValid(value)) {
        return res.status(400).json({ error: `Invalid ${param}` });
      }
    }
    next();
  };
}

module.exports = validateObjectId;

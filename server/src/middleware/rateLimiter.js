const rateLimiter = require("express-rate-limit");

const followerLimiter = rateLimiter({
    windowMs: 60 * 1000, // 1 minute window
    max: 15,             // limit each IP to 15 requests per window
    message: {
        message: "Too many requests from this IP, please try again after an hour"
    }
});

const globalLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests"
  }
});

const likeLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    message: "Too many likes"
  }
});

module.exports = { followerLimiter, globalLimiter, likeLimiter };

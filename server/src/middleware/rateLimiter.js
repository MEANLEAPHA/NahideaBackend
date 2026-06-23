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


// auth limiter

const registerLimiter = rateLimiter({
  windowMs: 5* 60 * 1000,
  max: 5,
  message: {
    message: "Too many registrations"
  }
});

const loginLimiter = rateLimiter({
  windowMs: 5* 60 * 1000, 
  max: 20,                 
  message: { message: "Too many login attempts, try again later." }
});

const verifyLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 20,
  message: { message: "Too many verify requests, You are being noticed by us." }
});

const
 resendLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 10,
  message: { message: "Too many resend requests, You are being noticed by us." }
});

const changePasswordLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 3,
  message: { message: "Too many password changes, You are being noticed by us." }
});

const forgetPasswordLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 10,
  message: { "message": "Too many requests, please try again later." }

});

const updateAccLimiter = rateLimiter({
  windowMs: 1 * 60 * 1000, 
  max: 3,
  message: { "message": "Too many requests, please try again later." }

});

const getUserInfoLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 50,
  message: { "message": "Too many requests, please try again later." }

});

const getOwnInfoLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 100,
  message: { "message": "Too many requests, please try again later." }

});


module.exports = { followerLimiter, globalLimiter, likeLimiter,

  // auth
  registerLimiter,
  verifyLimiter,
  loginLimiter,
  resendLimiter, 
  changePasswordLimiter,
  forgetPasswordLimiter,
  updateAccLimiter,
  getUserInfoLimiter,
  getOwnInfoLimiter

 };

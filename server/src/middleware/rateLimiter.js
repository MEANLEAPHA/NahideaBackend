// const rateLimiter = require("express-rate-limit");

// const followerLimiter = rateLimiter({
//     windowMs: 60 * 1000, // 1 minute window
//     max: 15,             // limit each IP to 15 requests per window
//     message: {
//         message: "Too many requests from this IP, please try again after an hour"
//     }
// });

// const globalLimiter = rateLimiter({
//   windowMs: 15 * 60 * 1000,
//   max: 300,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: {
//     message: "Too many requests"
//   }
// });

// const likeLimiter = rateLimiter({
//   windowMs: 60 * 1000,
//   max: 60,
//   message: {
//     message: "Too many likes"
//   }
// });


// // auth limiter

// const registerLimiter = rateLimiter({
//   windowMs: 5* 60 * 1000,
//   max: 5,
//   message: {
//     message: "Too many registrations"
//   }
// });

// const loginLimiter = rateLimiter({
//   windowMs: 5* 60 * 1000, 
//   max: 20,                 
//   message: { message: "Too many login attempts, try again later." }
// });

// const verifyLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 20,
//   message: { message: "Too many verify requests, You are being noticed by us." }
// });

// const
//  resendLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 10,
//   message: { message: "Too many resend requests, You are being noticed by us." }
// });

// const changePasswordLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 3,
//   message: { message: "Too many password changes, You are being noticed by us." }
// });

// const forgetPasswordLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 10,
//   message: { "message": "Too many requests, please try again later." }

// });

// const updateAccLimiter = rateLimiter({
//   windowMs: 1 * 60 * 1000, 
//   max: 3,
//   message: { "message": "Too many requests, please try again later." }

// });

// const getUserInfoLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 50,
//   message: { "message": "Too many requests, please try again later." }

// });

// const getOwnInfoLimiter = rateLimiter({
//   windowMs: 5 * 60 * 1000, 
//   max: 100,
//   message: { "message": "Too many requests, please try again later." }

// });


// module.exports = { followerLimiter, globalLimiter, likeLimiter,

//   // auth
//   registerLimiter,
//   verifyLimiter,
//   loginLimiter,
//   resendLimiter, 
//   changePasswordLimiter,
//   forgetPasswordLimiter,
//   updateAccLimiter,
//   getUserInfoLimiter,
//   getOwnInfoLimiter

//  };


const rateLimiter = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const keyByUserOrIp = (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req));

const keyByEmailOrIp = (req) => {
  const email = req.body?.email?.toLowerCase()?.trim();
  return email ? `email:${email}` : ipKeyGenerator(req);
};
/* ------------------------- AUTH: PUBLIC ROUTES ------------------------- */

const registerLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: keyByEmailOrIp, // stop one bot spinning up many accounts from one IP OR hammering one email
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts, please try again later." }
});

// Two layers on login: per-IP AND per-account, so an attacker can't get around
// the IP limit by rotating proxies while still hammering one victim's email.
const loginIpLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true, // only failed attempts count
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts from this network, try again later." }
});

const loginAccountLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 7,
  skipSuccessfulRequests: true,
  keyGenerator: keyByEmailOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many failed login attempts on this account, try again later." }
});

const verifyLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 15,
  keyGenerator: keyByEmailOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts, you are being noticed by us." }
});

// Resend endpoints are an email-bombing vector (attacker spams YOUR real user's
// inbox by repeatedly requesting a resend). Key by target email, keep it tight.
const resendLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 4,
  keyGenerator: keyByEmailOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many resend requests for this account, please wait before retrying." }
});

// Same email-bombing concern as resend.
const forgetPasswordLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: keyByEmailOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests for this account, please wait before retrying." }
});

/* ------------------------- AUTH: LOGGED-IN ROUTES ------------------------- */
// These all require `protect` to run BEFORE the limiter in your route definition.

const changePasswordLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password change attempts, please try again later." }
});

const updateAccLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5, // involves file uploads (avatar/banner) — keep tight
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many profile update attempts, please slow down." }
});

const getOwnInfoLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 150,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down." }
});

// Public-ish lookup route (no `protect` on it currently) — key by IP,
// generous enough for normal use, tight enough to stop user-enumeration scraping.
const getUserInfoLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down." }
});

/* ------------------------- GENERIC REUSABLE LIMITERS ------------------------- */
// Use these across posts / comments / answers instead of writing one bespoke
// limiter per endpoint. All keyed by user (protect runs first), IP fallback.

// For scrolling/pagination/feed-reading — generous, still stops scraping bots.
const readLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 300, // 
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down." }
});

// Heavy write: creating a post (multer + possible S3/Cloudinary upload).
const heavyUploadLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many uploads, please wait before posting again." }
});

// Normal writes: comments, answers, edits, deletes.
const writeLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many actions, please slow down." }
});

// Likes/upvotes/downvotes/favorites — light action but easy to bot-spam.
const likeLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many likes, please slow down." }
});

// Reports — must stay strict. Attackers/trolls mass-reporting to abuse your
// moderation system is a real pattern; legit users rarely report often.
const reportLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: keyByUserOrIp,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reports submitted, please try again later." }
});

module.exports = {
  registerLimiter,
  loginIpLimiter,
  loginAccountLimiter,
  verifyLimiter,
  resendLimiter,
  forgetPasswordLimiter,
  changePasswordLimiter,
  updateAccLimiter,
  getOwnInfoLimiter,
  getUserInfoLimiter,
  readLimiter,
  heavyUploadLimiter,
  writeLimiter,
  likeLimiter,
  reportLimiter,
};
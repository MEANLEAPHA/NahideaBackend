const express = require("express");
const router = express.Router();
const { register, login,
        verifyEmail,
        resendverifyEmailPin,
        forgetPassword,
        verifyforgetPasswordPin,
        resendForgetPasswordPin,
        setNewPassword,
        changePassword,
        newPassword,
        updateUser,
        getUserInfo,
        getUserInfoById
      } = require("../../controllers/authentication/authController");

const { protect } = require("../../middleware/authMiddleware");
const {
  registerLimiter, loginIpLimiter, loginAccountLimiter, verifyLimiter,
  resendLimiter, forgetPasswordLimiter, changePasswordLimiter,
  updateAccLimiter, getOwnInfoLimiter, getUserInfoLimiter
} = require("../../middleware/rateLimiter");
const {
  upload
} = require("../../controllers/upload/contentController");

router.post("/register", registerLimiter, register);
router.post("/verify-email", verifyLimiter, verifyEmail);
router.post("/resend-verify-email-pin", resendLimiter, resendverifyEmailPin);

// login now runs BOTH limiters — IP layer + account layer
router.post("/login", loginIpLimiter, loginAccountLimiter, login);

router.post("/forget-password", forgetPasswordLimiter, forgetPassword);
router.post("/verify-forget-password-pin", verifyLimiter, verifyforgetPasswordPin);
router.post("/resend-forget-password-pin", resendLimiter, resendForgetPasswordPin);
router.post("/set-new-password", changePasswordLimiter, setNewPassword);

router.post("/change-password", protect, changePasswordLimiter, changePassword);
router.post("/new-password", protect, changePasswordLimiter, newPassword);

router.put(
  "/update-user",
  protect,                
  updateAccLimiter,
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]),
  updateUser
);

// ⚠️ swapped order so req.user is set before the limiter runs
router.get("/me", protect, getOwnInfoLimiter, getUserInfo);

router.get("/get-user-info/:userId", getUserInfoLimiter, getUserInfoById);

module.exports = router;
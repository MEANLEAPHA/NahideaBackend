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
const {  registerLimiter, verifyLimiter, getOwnInfoLimiter,
         forgetPasswordLimiter, loginLimiter, 
         resendLimiter, changePasswordLimiter,
         updateAccLimiter, getUserInfoLimiter } = require("../../middleware/rateLimiter");
const {
  upload
} = require("../../controllers/upload/contentController");

router.post("/register", registerLimiter,register);
router.post("/verify-email", verifyLimiter, verifyEmail);
router.post("/resend-verify-email-pin", resendLimiter, resendverifyEmailPin);
router.post("/login", loginLimiter, login);

router.post("/forget-password", forgetPasswordLimiter, forgetPassword);
router.post("/verify-forget-password-pin", verifyLimiter,verifyforgetPasswordPin);
router.post("/resend-forget-password-pin", resendLimiter, resendForgetPasswordPin);
router.post("/set-new-password", changePasswordLimiter, setNewPassword);

router.post("/change-password", changePasswordLimiter, changePassword);
router.post("/new-password", changePasswordLimiter, newPassword);

router.put(
  "/update-user",
  updateAccLimiter,
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  updateUser
);

router.get("/me",  getOwnInfoLimiter, protect, getUserInfo);

router.get("/get-user-info/:userId", getUserInfoLimiter, getUserInfoById);

module.exports = router;
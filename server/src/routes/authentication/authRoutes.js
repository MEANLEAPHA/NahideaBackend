const express = require("express");
const router = express.Router();
const { register, 
        login,
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

const {protect} = require("../../middleware/authMiddleware");
const {
  upload
} = require("../../controllers/upload/contentController");

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verify-email-pin", resendverifyEmailPin);
router.post("/login", login);

router.post("/forget-password", forgetPassword);
router.post("/verify-forget-password-pin", verifyforgetPasswordPin);
router.post("/resend-forget-password-pin", resendForgetPasswordPin);
router.post("/set-new-password", setNewPassword);

router.post("/change-password", changePassword);
router.post("/new-password", newPassword);

router.put(
  "/update-user",
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  updateUser
);

router.get("/me", protect, getUserInfo);

router.get("/get-user-info/:userId", getUserInfoById);

module.exports = router;
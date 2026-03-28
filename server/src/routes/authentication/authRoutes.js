const router = require("express").Router();
const { register, 
        login,
        verifyEmail,
        resendverifyEmailPin,
        forgetPassword,
        verifyforgetPasswordPin,
        resendForgetPasswordPin,
        setNewPassword,
        changePassword,
        newPassword
      } = require("../../controllers/authentication/authController");

const {protect} = require("../../middleware/authMiddleware")

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

module.exports = router;
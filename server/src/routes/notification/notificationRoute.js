const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    getNotifications,
    markNotificationRead
} = require("../../controllers/notifications/notificationController");

router.get(
    "/notifications",
    protect,
    getNotifications
);

router.patch(
    "/notifications/:notificationId/read",
    protect,
    markNotificationRead
);

module.exports = router;
const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    getNotifications,
    markNotificationRead,
    markAllNotification,
    deleteNotification,
    deleteAllNotification,
    getUnreadCount
} = require("../../controllers/notifications/notificationController");

router.get(
    "/notifications/get-all",
    protect,
    getNotifications
);

router.patch(
    "/notifications/:notificationId/read",
    protect,
    markNotificationRead
);

router.patch(
    "/notifications/mark-all-read",
    protect,
    markAllNotification
);

router.delete(
    "/notifications/:notificationId",
    protect,
    deleteNotification
);

router.delete(
    "/notifications/delete-all",
    protect,
    deleteAllNotification
);


router.get(
    "/notifications/unread-count",
    protect,
    getUnreadCount
);

module.exports = router;
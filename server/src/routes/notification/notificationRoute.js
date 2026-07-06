const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    getNotifications,
    markNotificationRead,
    markAllNotification,
    deleteNotification,
    deleteAllNotifications,
    getUnreadCount
} = require("../../controllers/notifications/notificationController");

router.delete(
    "/notifications/delete-all",
    protect,
    deleteAllNotifications
);

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




router.get(
    "/notifications/unread-count",
    protect,
    getUnreadCount
);

module.exports = router;
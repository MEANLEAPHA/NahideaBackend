const express = require("express");
const router = express.Router();
const {
  sendSpam,
  getInboxSpam,
  getUnreadSpam,
  markSpamViewed,
  markAllViewed,
  getSentSpam,
  deleteOneSpam,
  deleteAllSpam
} = require("../../controllers/spammy/spamController");

const {protect} = require("../../middleware/authMiddleware");

router.post("/spam/send", protect, sendSpam);

router.get("/spam/inbox", protect, getInboxSpam);

router.get("/spam/unread-count", protect, getUnreadSpam);

router.put("/spam/view/:spamId", protect, markSpamViewed);

router.put("/spam/view-all", protect, markAllViewed);

router.get("/spam/sent", protect, getSentSpam);

router.delete("/spam/delete/:spamId", protect, deleteOneSpam);

router.delete("/spam/delete-all", protect, deleteAllSpam);

module.exports = router;
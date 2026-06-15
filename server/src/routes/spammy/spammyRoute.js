const express = require("express");
const router = express.Router();
const {
  sendSpam,
  getInboxSpam,
  getUnreadSpam,
  markSpamViewed,
  getSentSpam
} = require("../../controllers/spammy/spamController");

const {protect} = require("../../middleware/authMiddleware");

router.post("/spam/send", protect, sendSpam);

router.get("/spam/inbox", protect, getInboxSpam);

router.get("/spam/unread-count", protect, getUnreadSpam);

router.put("/spam/view/:spamId", protect, markSpamViewed);

router.get("/spam/sent", protect, getSentSpam);

module.exports = router;
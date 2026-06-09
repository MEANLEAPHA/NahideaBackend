const express = require("express");
const router = express.Router();
const {protect} = require("../../middleware/authMiddleware");

const {
    getChatUser, getMessage, deleteConversation, deleteMessage, reportMessage, searchGif, reportConversation,getChatSpamUser,
    getChatArchivedUser, openConversation, getUnreadChatCount, searchGifFav
} = require("../../controllers/chat/getChatUserController");


router.get("/get-chat-user", protect, getChatUser);
router.get("/get-message/:userId", protect, getMessage);
router.delete("/delete-conversation/:userId", protect, deleteConversation);
router.delete("/delete-message/:messageId", protect, deleteMessage);
router.post("/report-message", protect, reportMessage);
router.post("/report-conversation/:conversationId", protect, reportConversation);
router.get("/get-chat-spam-user", protect, getChatSpamUser);
router.get("/get-chat-archived-user", protect, getChatArchivedUser);
router.put("/open-conversation/:otherUserId", protect, openConversation);
router.get("/search-gif", searchGif);
router.get("/search-gif-fav", protect, searchGifFav);
router.get(
  "/chat/unread-count",
  protect,
  getUnreadChatCount
);

module.exports = router;
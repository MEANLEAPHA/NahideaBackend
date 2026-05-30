const express = require("express");
const router = express.Router();
const {protect} = require("../../middleware/authMiddleware");

const {
    getChatUser, getMessage, deleteConversation, deleteMessage, reportMessage, searchGif 
} = require("../../controllers/chat/getChatUserController");


router.get("/get-chat-user", protect, getChatUser);
router.get("/get-message/:userId", protect, getMessage);
router.delete("/delete-conversation/:userId", protect, deleteConversation);
router.delete("/delete-message/:messageId", protect, deleteMessage);
router.post("/report-message", protect, reportMessage);
router.get("/search-gif", protect, searchGif);

module.exports = router;
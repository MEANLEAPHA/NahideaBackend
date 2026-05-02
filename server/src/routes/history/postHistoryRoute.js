const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    getHistoryPost,
    savePostHistory,
    removeHistoryPost,
    removeAllHistoryPost
} = require("../../controllers/history/postHistoryController");

router.get("/history-post", protect, getHistoryPost);
router.post("/history-post/:postId", protect, savePostHistory);
router.delete("/history-post", protect, removeHistoryPost);
router.delete("/remove-all-history-post", protect, removeAllHistoryPost);

module.exports = router;
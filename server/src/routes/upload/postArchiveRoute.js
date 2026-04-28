const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    getPostFavorite, addPostFavorite, removePostFavorite,
    getLikePost, addLikePost, removeLikePost,
    getHistoryPost, addHistoryPost, removeHistoryPost, removeAllHistoryPost,
    getReportPost, addReportPost, removeReportPost, removeAllReportPost,
    getFeedback, addFeedback, removeFeedback, removeAllFeedback
} = require("../../controllers/upload/postArchiveController");


// favorite
router.get("/post-favorite", protect, getPostFavorite);
router.post("/post-favorite", protect, addPostFavorite);
router.delete("/post-favorite", protect, removePostFavorite);

// like
router.get("/like-post", protect, getLikePost);
router.post("/like-post", protect, addLikePost);
router.delete("/like-post", protect, removeLikePost);

// history
router.get("/history-post", protect, getHistoryPost);
router.post("/history-post", protect, addHistoryPost);
router.delete("/history-post", protect, removeHistoryPost);
router.delete("/remove-all-history-post", protect, removeAllHistoryPost);

//report
router.get("/report-post", protect, getReportPost);
router.post("/report-post", protect, addReportPost);
router.delete("/report-post", protect, removeReportPost);
router.delete("/remove-all-report-post", protect, removeAllReportPost);

// feedback
router.get("/feedback", protect, getFeedback);
router.post("/feedback", protect, addFeedback);
router.delete("/feedback", protect, removeFeedback);
router.delete("/remove-all-feedback", protect, removeAllFeedback);

module.exports = router;
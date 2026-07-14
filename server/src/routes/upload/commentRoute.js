const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const { 
        addComment, updateComment, deleteComment, getCommentsByPostId, getAnonIdentity,
        likeComment, reportComment } = require("../../controllers/upload/commentController");
const { readLimiter, writeLimiter, likeLimiter, reportLimiter } = require("../../middleware/rateLimiter");


router.post("/posts/:postId/comments", protect, writeLimiter, addComment);
router.get("/posts/:postId/comments", protect, readLimiter, getCommentsByPostId);
router.put("/comments/:commentId", protect, writeLimiter, updateComment);
router.delete("/comments/:commentId/:postId", protect, writeLimiter, deleteComment);
router.post("/comments/:commentId/like", protect, likeLimiter, likeComment);
router.post("/comments/:commentId/report", protect, reportLimiter, reportComment);
router.get("/get-anon-identity/:postId", protect, readLimiter, getAnonIdentity);

module.exports = router;


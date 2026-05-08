const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const { 
        addComment, updateComment, deleteComment, getCommentsByPostId, getAnonIdentity,
        likeComment, reportComment } = require("../../controllers/upload/commentController");

router.post(
    "/posts/:postId/comments",
    protect,
    addComment
);

router.get(
    "/posts/:postId/comments",
    protect,
    getCommentsByPostId
);

router.put(
    "/comments/:commentId",
    protect,
    updateComment
);

router.delete(
    "/comments/:commentId",
    protect,
    deleteComment
);

router.post(
    "/comments/:commentId/like",
    protect,
    likeComment
);

router.post(
    "/comments/:commentId/report",
    protect,
    reportComment
);


router.get("/get-anon-identity/:postId", protect, getAnonIdentity);
module.exports = router;


// router.post("/add-comment/:postId", protect, addComment);
// router.put("/update-comment/:commentId", protect, updateComment);
// router.delete("/delete-comment/:commentId", protect, deleteComment);

// router.get("/get-comments/:postId", getCommentsByPostId);
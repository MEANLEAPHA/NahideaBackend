const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
  createPost,
  getAllPosts,
  getAllTrending,
  getUnsolvedQuestions,
  updatePostBodyContent,
  deletePost,
  likePost,
  favoritePost,
  getPostsByLike,
  getPostsByFavorite,
  getPostByUserId,
  getPostByUserIds,
  markQuestionSolved,
  getPostsByPostId

} = require("../../controllers/upload/postController");
const {
  upload
} = require("../../controllers/upload/contentController");


const { likeLimiter, readLimiter, heavyUploadLimiter, writeLimiter } = require("../../middleware/rateLimiter");

// post with multiple media and signle media
router.post("/create-posts", protect, heavyUploadLimiter,
   upload.fields([
    // content 
    { name: "contentFile", maxCount: 5 }, 

    // confession
    {name : "confessionFile", maxCount: 1},

    // question 
    {name: "questionFile", maxCount: 1 }
  ]),
  createPost);

  
router.get("/all-posts", protect, readLimiter, getAllPosts);
router.get("/all-trending", protect, readLimiter, getAllTrending);
router.get("/questions/unsolved", protect, readLimiter, getUnsolvedQuestions);
router.get("/user/yourposts", protect, readLimiter, getPostByUserIds);
router.get("/get-posts/:postId", protect, readLimiter, getPostsByPostId);
router.get("/user/:userId/posts", protect, readLimiter, getPostByUserId);

router.put("/update-post-body-content/:contentId/:postId", protect, writeLimiter, updatePostBodyContent);
router.delete("/delete-post/:postId", protect, writeLimiter, deletePost);

router.post("/posts/:postId/:ownerId/like", protect, likeLimiter, likePost);
router.post("/posts/:postId/favorite", protect, likeLimiter, favoritePost);

router.get("/posts/likes", protect, readLimiter, getPostsByLike);
router.get("/posts/favorites", protect, readLimiter, getPostsByFavorite);
router.patch("/posts/:postId/solve", protect, writeLimiter, markQuestionSolved);

module.exports = router;
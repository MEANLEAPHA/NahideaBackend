const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
  createPost,
  getAllPosts,
  getAllTrending,
  getUnsolvedQuestions,
  // getPostsById,
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
  content,
  upload
} = require("../../controllers/upload/contentController");

const { likeLimiter } = require("../../middleware/rateLimiter");

// post with multiple media and signle media
router.post("/create-posts", protect, 
   upload.fields([
    // content 
    { name: "contentFile", maxCount: 5 }, 

    // confession
    {name : "confessionFile", maxCount: 1},

    // question 
    {name: "questionFile", maxCount: 1 }
  ]),
  createPost);

  router.get("/all-posts", protect, getAllPosts);

  router.get("/all-trending", protect, getAllTrending);

  router.get("/questions/unsolved", protect, getUnsolvedQuestions);

  // router.get("/get-post/:id", protect, getPostsById);

  router.get("/get-posts/:postId", protect, getPostsByPostId);

  router.get("/user/:userId/posts", protect, getPostByUserIds);

   router.get("/user/posts", protect, getPostByUserIds);

  router.put("/update-post-body-content/:contentId/:postId", protect, updatePostBodyContent);
  
  router.delete("/delete-post/:postId", protect, deletePost);

  router.post("/posts/:postId/:ownerId/like", protect, likeLimiter, likePost);

  router.post(
    "/posts/:postId/favorite",
    protect,
    favoritePost
  );

router.get("/posts/likes", protect, getPostsByLike);
router.get("/posts/favorites", protect, getPostsByFavorite);
router.patch(
  "/posts/:postId/solve",
  protect,
  markQuestionSolved
);

module.exports = router;
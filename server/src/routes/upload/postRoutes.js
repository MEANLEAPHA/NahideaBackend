const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
  createPost,
  // markSolved,
  getAllPosts,
  getPostsById,
  updatePostBodyContent,
  deletePost,
  likePost,
  favoritePost,

} = require("../../controllers/upload/postController");
const {
  content,
  upload
} = require("../../controllers/upload/contentController");

// const { addComment } = require("../../controllers/upload/commentController");
// const { vote } = require("../../controllers/upload/voteController");

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

  router.get("/all-posts", protect ,getAllPosts);

  router.get("/get-post/:id", getPostsById);

  router.put("/update-post-body-content/:contentId/:postId", protect, updatePostBodyContent);
  
  router.delete("/delete-post/:postId", protect, deletePost);

  router.post("/posts/:postId/:ownerId/like", protect, likeLimiter, likePost);

  router.post(
    "/posts/:postId/favorite",
    protect,
    favoritePost
  );


// router.post("/:id/comments", protect, addComment);
// router.post("/:id/vote", protect, vote); 
// router.patch("/:id/solve", protect, markSolved);


// router.post("/create/content", upload.array("media", 5), content);
module.exports = router;
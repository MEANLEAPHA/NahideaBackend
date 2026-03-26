const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
  createPost,
  getPosts,
  getPostById,
  markSolved,
} = require("../../controllers/upload/postController");
const {
  content,
  upload
} = require("../../controllers/upload/contentController");

const { addComment } = require("../../controllers/upload/commentController");
const { vote } = require("../../controllers/upload/voteController");



router.post("/", protect, createPost);
router.get("/", getPosts);
router.get("/:id", getPostById);

router.post("/:id/comments", protect, addComment);
router.post("/:id/vote", protect, vote);
router.patch("/:id/solve", protect, markSolved);


router.post("/create/content", upload.array("media", 5), content);
module.exports = router;
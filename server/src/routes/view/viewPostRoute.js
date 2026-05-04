const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {
     recordViewPost, getTotalViewsByPost
} = require("../../controllers/view/viewPostController");


router.post("/record-view-post/:postId", protect, recordViewPost);
router.get("/total-views-by-post/:postId", protect, getTotalViewsByPost);

module.exports = router;
const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    recordLogin,
    getHallOfFame,
    // getTrendingPost
} = require("../../controllers/rank/rankController");


router.post("/record-login", protect, recordLogin);

router.get("/hof", getHallOfFame);
// router.get("/trending-post", getTrendingPost);

module.exports = router;

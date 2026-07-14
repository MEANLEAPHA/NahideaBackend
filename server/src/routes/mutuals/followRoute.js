const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    likeLimiter
} = require("../../middleware/rateLimiter");

const {
    followUser,
    unfollowUser,
    getFollowStatus
} = require("../../controllers/mutuals/followController");


router.post(
    "/add-follow/:userId",
    protect,
    likeLimiter,
    followUser
);

router.delete(
    "/unfollow/:userId",
    protect,
    likeLimiter,
    unfollowUser
);

router.get(
  "/follow-status/:userId",
  protect,
  getFollowStatus
);

module.exports = router;
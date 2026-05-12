const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    followerLimiter
} = require("../../middleware/rateLimiter");

const {
    followUser,
    unfollowUser,
    acceptFollowRequest,
    getFollowStatus
} = require("../../controllers/mutuals/followController");


router.post(
    "/add-follow/:userId",
    protect,
    followerLimiter,
    followUser
);

router.delete(
    "/unfollow/:userId",
    protect,
    unfollowUser
);

router.post(
    "/follow/accept/:requestId",
    protect,
    acceptFollowRequest
);

router.get(
  "/follow-status/:userId",
  protect,
  getFollowStatus
);

module.exports = router;
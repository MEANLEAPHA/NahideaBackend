const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    followerLimiter
} = require("../../middleware/rateLimiter");

const {
    followUser,
    unfollowUser,
    acceptFollowRequest
} = require("../../controllers/mutuals/followController");


router.post(
    "/:userId",
    protect,
    followLimiter,
    followUser
);

router.delete(
    "/:userId",
    protect,
    unfollowUser
);

router.post(
    "/accept/:requestId",
    protect,
    acceptFollowRequest
);

module.exports = router;
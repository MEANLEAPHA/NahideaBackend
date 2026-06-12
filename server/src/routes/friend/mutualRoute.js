const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    getMutuals,getAllFriends, getFriendsById, getMutualFriendsById, getFollowersById, getFollowingsById
} = require("../../controllers/friend/mutaulController");

router.get("/get-mutuals", protect, getMutuals);

router.get("/get-all-friends", protect, getAllFriends);

router.get("/get-friends-by-id/:userId", protect, getFriendsById);
// Get mutual friends
router.get('/friends/:userId', protect, getMutualFriendsById);

// Get followers
router.get('/followers/:userId', protect, getFollowersById);

// Get followings
router.get('/followings/:userId', protect, getFollowingsById);

module.exports = router;
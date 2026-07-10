const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    getMutuals,getAllFriends, getFriendsById, getMutualFriendsById, getFollowersById, getFollowingsById
} = require("../../controllers/friend/mutaulController");

router.get("/get-mutuals", protect, getMutuals);

router.get("/get-all-friends", protect, getAllFriends);

router.get("/get-friends-by-id/:userId", protect, getFriendsById);

router.get('/friends/:userId', protect, getMutualFriendsById);

router.get('/followers/:userId', protect, getFollowersById);

router.get('/followings/:userId', protect, getFollowingsById);

module.exports = router;
const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    getMutuals,getAllFriends, getFriendsById, getAllFriendsById
} = require("../../controllers/friend/mutaulController");

router.get("/get-mutuals", protect, getMutuals);

router.get("/get-all-friends", protect, getAllFriends);

router.get("/get-friends-by-id/:userId", protect, getFriendsById);

router.get("/get-all-friends-by-id", protect, getAllFriendsById);

module.exports = router;
const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    getMutuals,getAllFriends
} = require("../../controllers/friend/mutaulController");

router.get("/get-mutuals", protect, getMutuals);

router.get("/get-all-friends", protect, getAllFriends);

module.exports = router;
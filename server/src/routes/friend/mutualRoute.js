const express = require("express");

const router = express.Router();

const {protect} = require("../../middleware/authMiddleware");

const {
    getMutuals
} = require("../../controllers/friend/mutaulController");

router.get("/get-mutuals", protect, getMutuals);

module.exports = router;
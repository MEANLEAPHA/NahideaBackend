const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    recordLogin
} = require("../../controllers/rank/rankController");


router.post("/record-login", protect, recordLogin);

module.exports = router;

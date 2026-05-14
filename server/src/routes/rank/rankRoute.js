const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    recordLogin,
    getHallOfFame
} = require("../../controllers/rank/rankController");


router.post("/record-login", protect, recordLogin);
router.get("/hof", getHallOfFame);

module.exports = router;

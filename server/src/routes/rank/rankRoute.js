const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    recordLogin,
    getHallOfFame,
    getMyRanking,
    getLeaderboard          
} = require("../../controllers/rank/rankController");

router.get("/ranking/me", protect, getMyRanking);
router.get("/leaderboard", getLeaderboard);
router.post("/record-login", protect, recordLogin);
router.get("/hof", getHallOfFame);


module.exports = router;

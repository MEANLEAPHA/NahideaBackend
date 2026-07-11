const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");

const {
    recordLogin,
    getHallOfFame,
    getMyRanking,
    getRankingByUserId, 
} = require("../../controllers/rank/rankController");

router.get("/ranking/me", protect, getMyRanking);
router.get("/ranking/user/:userId", protect, getRankingByUserId);
router.post("/record-login", protect, recordLogin);
router.get("/hof", getHallOfFame);


module.exports = router;

// routes/signals.js
const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");
 const { sendPoke, getPoke} = require("../../controllers/poke/pokeController");

router.post("/send-poke", protect, sendPoke);
router.get("/get-pokes", protect, getPoke);

module.exports = router;

const express = require("express");
const multer = require("multer");
const { uploadGif, getGifs, searchGif } = require("../../controllers/upload/gifController");


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const { protect } = require("../../middleware/authMiddleware");

router.post("/upload", upload.single("gif"), protect, uploadGif);
router.get("/", getGifs);
router.get("/search", searchGif);

module.exports = router;

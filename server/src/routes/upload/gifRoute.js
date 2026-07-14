const express = require("express");
const multer = require("multer");
const { uploadGif, getGifs, searchGif,searchByCategory,
        addFavorite, removeFavorite, getFavorites, getUserFavoritesFeed
 } = require("../../controllers/upload/gifController");
 const { protect } = require("../../middleware/authMiddleware");


const router = express.Router();


router.post("/upload", uploadGif);
router.get("/getGifs", getGifs);
router.get("/search", searchGif);
router.get("/category", searchByCategory);

router.post("/favorites/add", protect, addFavorite);
router.post("/favorites/remove", protect, removeFavorite);
router.get("/favorites", protect, getFavorites);
router.get("/favorites/feed", protect, getUserFavoritesFeed);



module.exports = router;
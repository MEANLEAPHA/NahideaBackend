const express = require("express");
const router = express.Router();
const { globalSearch, getAutocomplete } = require("../../controllers/search/searchAllController");
const {protect} = require("../../middleware/authMiddleware"); 

router.get("/search", protect, globalSearch);
router.get("/search/autocomplete", protect, getAutocomplete);

module.exports = router;


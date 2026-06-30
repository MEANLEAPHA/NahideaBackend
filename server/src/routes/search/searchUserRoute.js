const express = require('express');
const router = express.Router();

const {searchUser} =  require("../../controllers/search/searchUserController");
const {protect} = require("../../middleware/authMiddleware");

router.get("/searchUser", protect, searchUser);

module.exports = router;
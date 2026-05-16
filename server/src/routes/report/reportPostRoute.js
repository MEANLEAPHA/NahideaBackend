const express = require("express");
const router = express.Router();
const  { createReport } = require("../../controllers/report/reportPostController.js");
const {protect} = require("../../middleware/authMiddleware");

router.post("/report-post", protect, createReport);

module.exports = router;
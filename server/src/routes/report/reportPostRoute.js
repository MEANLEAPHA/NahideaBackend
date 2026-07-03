const express = require("express");
const router = express.Router();
const  { createReport, submitFeedback, report } = require("../../controllers/report/reportPostController.js");
const {protect} = require("../../middleware/authMiddleware");

router.post("/report-post", protect, createReport);

router.post("/reports/:id/:type", protect, report);

router.post('/feedback', protect, submitFeedback);

module.exports = router;
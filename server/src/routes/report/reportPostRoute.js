const express = require("express");
const router = express.Router();
const  { createReport, submitFeedback, report, getAllReportByUserId } = require("../../controllers/report/reportPostController.js");
const {protect} = require("../../middleware/authMiddleware");

router.post("/report-post", protect, createReport);

router.post("/reports/:id/:type/:type_id", protect, report);

router.get('/get-all-report-by-user-id', protect, getAllReportByUserId);

router.post('/feedback', protect, submitFeedback);

module.exports = router;
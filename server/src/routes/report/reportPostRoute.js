const express = "express";
const  { createReport } = require("../../controllers/report/reportPostController.js");
const {protect} = require("../../middleware/authMiddleware");

const router = express.Router();

router.post("/report-post", protect, createReport);

module.exports = router;
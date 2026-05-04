const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {answerQA} = require("../../controllers/upload/answerQAcontroller");

router.post("/answer-qa/:postId/:questionId/:questionType", protect, answerQA);

module.exports = router;
const router = require("express").Router();
const { protect } = require("../../middleware/authMiddleware");

const {answerQA, getQuestionById} = require("../../controllers/upload/answerQAcontroller");

router.post("/answer-qa/:postId/:questionId/:questionType", protect, answerQA);
router.get("/get-question/:questionId/:questionType", getQuestionById);
module.exports = router;
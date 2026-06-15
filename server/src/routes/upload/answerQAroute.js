const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");

const {  
  answerQA,
  getQuestionById,
  getAllAnswersByQuestionId,
  upvoteAnswer,
  downvoteAnswer,
  getAnswerById,
  getMostPopularAnswer
} = require("../../controllers/upload/answerQAcontroller");

router.post("/answers/answer-qa/:postId/:questionId/:questionType", protect, answerQA);
router.get("/answers/get-question/:questionId/:questionType", getQuestionById);

// Public routes (with auth for vote tracking)
router.get('/answers/question/:questionId', protect, getAllAnswersByQuestionId);
router.get('/answers/question/:questionId/popular', protect, getMostPopularAnswer);
router.get('/answers/:answerId', protect, getAnswerById);

// Vote routes
router.post('/answers/:answerId/upvote', protect, upvoteAnswer);
router.post('/answers/:answerId/downvote', protect, downvoteAnswer);
module.exports = router;
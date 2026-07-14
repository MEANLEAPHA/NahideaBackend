const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");

const {  
  answerQA,
  getQuestionById,
  getAllAnswersByQuestionId,
  upvoteAnswer,
  downvoteAnswer,
  checkAlreadyAnswered,
  getAnswerById,
  getMostPopularAnswer
} = require("../../controllers/upload/answerQAcontroller");

const { readLimiter, writeLimiter, likeLimiter } = require("../../middleware/rateLimiter");

router.post("/answers/answer-qa/:postId/:questionId/:questionType", protect, writeLimiter, answerQA);
router.get("/answers/get-question/:questionId/:questionType", readLimiter, getQuestionById); 
router.get("/answers/check-answered/:questionId", protect, readLimiter, checkAlreadyAnswered);

router.get('/answers/question/:questionId', protect, readLimiter, getAllAnswersByQuestionId);
router.get('/answers/question/:questionId/popular', protect, readLimiter, getMostPopularAnswer);
router.get('/answers/:answerId', protect, readLimiter, getAnswerById);

router.post('/answers/:answerId/upvote', protect, likeLimiter, upvoteAnswer);
router.post('/answers/:answerId/downvote', protect, likeLimiter, downvoteAnswer);
module.exports = router;
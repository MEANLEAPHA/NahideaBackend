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

router.post("/answer-qa/:postId/:questionId/:questionType", protect, answerQA);
router.get("/get-question/:questionId/:questionType", getQuestionById);

// Public routes (with auth for vote tracking)
router.get('/question/:questionId', protect, getAllAnswersByQuestionId);
router.get('/question/:questionId/popular', protect, getMostPopularAnswer);
router.get('/:answerId', protect, getAnswerById);

// Vote routes
router.post('/:answerId/upvote', protect, upvoteAnswer);
router.post('/:answerId/downvote', protect, downvoteAnswer);
module.exports = router;
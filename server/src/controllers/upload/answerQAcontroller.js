const pool = require("../../config/db");
const answerQA = async (req, res) => {
    try{
        const userId = req.user.userId;
        const { postId, questionId, questionType } = req.params;

        const {
            is_anonymous, anonymous_name, anonymous_bg_color,

            // opened
            answerText,

            // closed
            answerYesNo,

            // rating
            ratingValue,

            // singlechoice
            optionId,
            optionText,

            // multiplechoice
            optionIds,
            optionTexts,

            // ranking
            rankingIds,
            rankingTexts,

            // range
            rangeValue
        } = req.body;

        switch(questionType){
            case "openend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'openend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerText, is_anonymous || null, anonymous_name || null, anonymous_bg_color || null]);
                break;
            case "closedend":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'closedend', ?, ?, ?, ?)`,
                [questionId, postId, userId, answerYesNo, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "rating":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, rating_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'rating', ?, ?, ?, ?)`,
                [questionId, postId, userId, ratingValue, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "singlechoice":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, singlechoice_option_id, singlechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'singlechoice', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, optionId, optionText, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "multiplechoice":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, multiplechoice_option_ids, multiplechoice_option_value,is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'multiplechoice', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(optionIds), JSON.stringify(optionTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "rankingorder":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, ranking_positions, ranking_position_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'rankingorder', ?, ?, ?, ?, ?)`,
                [questionId, postId, userId, JSON.stringify(rankingIds) ,JSON.stringify(rankingTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
                break;

            case "range":
                await pool.query(
                `INSERT INTO answers 
                    (question_id, post_id, user_id, question_type, range_value, is_anonymous, anonymous_name, anonymous_bg_color)
                    VALUES (?, ?, ?, 'range', ?, ?, ?, ?)`,
                [questionId, postId, userId, rangeValue, is_anonymous, anonymous_name, anonymous_bg_color]);
                break;
        }
        res.status(200).json(
            {
                success: true,
                message: "Answer submitted successfully"
            }
        );

    }catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
}

const getQuestionById = async (req, res) => {
   try{
    const { questionId, questionType } = req.params;
    const [questions] = await pool.query(
      `SELECT title, question_related_to FROM question WHERE id = ?`,
      [questionId]
    );
    const question = questions[0];
    let data = {};
    switch(questionType){
      case 'openend' :
        data = {...question};
        break;
      case 'closedend' :
        data = {...question};
        break;
      case 'range':
        const [rangeRows] = await pool.query(
          `SELECT * FROM question_range WHERE question_id = ?`,
          [questionId]
        );
        const range = rangeRows[0] || null;
        if (!range) {
          console.warn("No range data found for question_id:", questionId);
        }

        data ={ ...question, ...range };
      break;
      case 'rating' :
        const [ratingRows] = await pool.query(
          `SELECT * FROM rating WHERE question_id = ?`,
          [questionId]
        );
        const rating = ratingRows[0] || null;
        
        data = { ...question, ...rating };
        break;
      case 'singlechoice' :
        const [singleRows] = await pool.query(`
          SELECT sco.*, sc.question_id
          FROM singlechoice_option sco
          JOIN singlechoice sc ON sco.singlechoice_id = sc.id
          WHERE sc.question_id = ?`, [questionId]);
        data = { ...question, choice: singleRows };
        break;
      case 'multiplechoice' :
        const [multiRows] = await pool.query(`
          SELECT mco.*, mc.question_id, mc.include_all_above
          FROM multiplechoice_option mco
          JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
          WHERE mc.question_id = ?`, [questionId]);
          const include_all_above = multiRows[0]?.include_all_above || 0;
        data = { ...question, include_all_above, choices: multiRows };
        break;
      case 'rankingorder' :
        const [rankRows] = await pool.query(`
          SELECT ri.*, ro.question_id
          FROM ranking_item ri
          JOIN rankingorder ro ON ri.ranking_id = ro.id
          WHERE ro.question_id = ?`, [questionId]);
        data = { ...question, items: rankRows };
        break;
    }

    res.status(200).json({
      source: "pool",
      datas: data,
    });
   }catch(err){
    console.error(err);
    res.status(500).json({ message: "Server error" });
   }
}

const getAllAnswersByQuestionId = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { questionId } = req.params;
    let { page = 1, limit = 20, sort = 'top' } = req.query;

    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Get user's votes on answers
    const [userVotes] = await pool.query(
      `SELECT answer_id, vote_type FROM answer_votes WHERE user_id = ?`,
      [userId]
    );
    
    const voteMap = new Map();
    userVotes.forEach(vote => {
      voteMap.set(vote.answer_id, vote.vote_type);
    });

    // Sorting logic
    let orderBy = '';
    switch (sort) {
      case 'top':
        orderBy = 'ORDER BY a.vote_score DESC, a.upvotes DESC';
        break;
      case 'newest':
        orderBy = 'ORDER BY a.created_at DESC';
        break;
      case 'oldest':
        orderBy = 'ORDER BY a.created_at ASC';
        break;
      case 'controversial':
        orderBy = 'ORDER BY (a.upvotes + a.downvotes) DESC, a.vote_score DESC';
        break;
      default:
        orderBy = 'ORDER BY a.vote_score DESC, a.created_at DESC';
    }

    // Get answers with user info
    const [answers] = await pool.query(
      `SELECT 
        a.id,
        a.question_id,
        a.user_id,
        a.is_anonymous,
        a.anonymous_name,
        a.anonymous_bg_color,
        a.post_id,
        a.question_type,
        a.text_answer,
        a.yes_no,
        a.rating_value,
        a.singlechoice_option_id,
        a.singlechoice_option_value,
        a.multiplechoice_option_ids,
        a.multiplechoice_option_value,
        a.ranking_positions,
        a.ranking_position_value,
        a.range_value,
        a.upvotes,
        a.downvotes,
        a.vote_score,
        a.created_at,
        a.updated_at,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_name
          ELSE u.username
        END AS author_name,
        
        CASE
          WHEN a.is_anonymous = 1 THEN NULL
          ELSE u.avatar_url
        END AS author_avatar,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_bg_color
          ELSE NULL
        END AS author_bg_color,
        
        -- Check if current user voted
        ? AS user_vote_type,
        
        -- Get total answers count
        COUNT(*) OVER() AS total_count
        
      FROM answers a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.question_id = ?
      ${orderBy}
      LIMIT ? OFFSET ?`,
      [userId, questionId, limit, offset]
    );

    // Add user_vote_type to each answer
    const answersWithVotes = answers.map(answer => ({
      ...answer,
      user_vote_type: voteMap.get(answer.id) || null
    }));

    const total = answersWithVotes[0]?.total_count || 0;

    res.json({
      success: true,
      data: answersWithVotes,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_more: offset + limit < total
      }
    });

  } catch (err) {
    console.error("getAllAnswersByQuestionId error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching answers"
    });
  }
};
const getMostPopularAnswer = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { questionId } = req.params;

    // Get user's votes
    const [userVotes] = await pool.query(
      `SELECT answer_id, vote_type FROM answer_votes WHERE user_id = ?`,
      [userId]
    );
    
    const voteMap = new Map();
    userVotes.forEach(vote => {
      voteMap.set(vote.answer_id, vote.vote_type);
    });

    const [answer] = await pool.query(
      `SELECT 
        a.id,
        a.question_id,
        a.user_id,
        a.is_anonymous,
        a.anonymous_name,
        a.anonymous_bg_color,
        a.post_id,
        a.question_type,
        a.text_answer,
        a.yes_no,
        a.rating_value,
        a.singlechoice_option_id,
        a.singlechoice_option_value,
        a.multiplechoice_option_ids,
        a.multiplechoice_option_value,
        a.ranking_positions,
        a.ranking_position_value,
        a.range_value,
        a.upvotes,
        a.downvotes,
        a.vote_score,
        a.created_at,
        a.updated_at,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_name
          ELSE u.username
        END AS author_name,
        
        CASE
          WHEN a.is_anonymous = 1 THEN NULL
          ELSE u.avatar_url
        END AS author_avatar,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_bg_color
          ELSE NULL
        END AS author_bg_color
        
      FROM answers a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.question_id = ?
      ORDER BY a.vote_score DESC, a.upvotes DESC
      LIMIT 1`,
      [questionId]
    );

    if (!answer.length) {
      return res.json({
        success: true,
        data: null,
        message: "No answers yet"
      });
    }

    res.json({
      success: true,
      data: {
        ...answer[0],
        user_vote_type: voteMap.get(answer[0].id) || null
      }
    });

  } catch (err) {
    console.error("getMostPopularAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching popular answer"
    });
  }
};
const upvoteAnswer = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answerId } = req.params;

    // Check if answer exists
    const [answer] = await pool.query(
      `SELECT id, user_id FROM answers WHERE id = ?`,
      [answerId]
    );

    if (!answer.length) {
      return res.status(404).json({
        success: false,
        message: "Answer not found"
      });
    }

    // Check existing vote
    const [existingVote] = await pool.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
      [answerId, userId]
    );

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;

    if (existingVote.length === 0) {
      // No existing vote - add upvote
      await pool.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'upvote')`,
        [answerId, userId]
      );
      upvotesChange = 1;
      voteScoreChange = 1;
      newVoteType = 'upvote';
    } else if (existingVote[0].vote_type === 'upvote') {
      // Already upvoted - remove upvote
      await pool.query(
        `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = -1;
      voteScoreChange = -1;
      newVoteType = null;
    } else if (existingVote[0].vote_type === 'downvote') {
      // Was downvoted - change to upvote
      await pool.query(
        `UPDATE answer_votes SET vote_type = 'upvote' WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = 1;
      downvotesChange = -1;
      voteScoreChange = 2; // +1 for upvote, -(-1) for removing downvote = +2
      newVoteType = 'upvote';
    }

    // Update answer vote counts
    await pool.query(
      `UPDATE answers 
       SET upvotes = upvotes + ?,
           downvotes = downvotes + ?,
           vote_score = vote_score + ?
       WHERE id = ?`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated counts
    const [updatedAnswer] = await pool.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
      [answerId]
    );

    res.json({
      success: true,
      data: {
        upvotes: updatedAnswer[0].upvotes,
        downvotes: updatedAnswer[0].downvotes,
        vote_score: updatedAnswer[0].vote_score,
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer upvoted" : 
               existingVote[0].vote_type === 'upvote' ? "Upvote removed" : 
               "Changed from downvote to upvote"
    });

  } catch (err) {
    console.error("upvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error upvoting answer"
    });
  }
};

const downvoteAnswer = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answerId } = req.params;

    // Check if answer exists
    const [answer] = await pool.query(
      `SELECT id, user_id FROM answers WHERE id = ?`,
      [answerId]
    );

    if (!answer.length) {
      return res.status(404).json({
        success: false,
        message: "Answer not found"
      });
    }

    // Check existing vote
    const [existingVote] = await pool.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
      [answerId, userId]
    );

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;

    if (existingVote.length === 0) {
      // No existing vote - add downvote
      await pool.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'downvote')`,
        [answerId, userId]
      );
      downvotesChange = 1;
      voteScoreChange = -1;
      newVoteType = 'downvote';
    } else if (existingVote[0].vote_type === 'downvote') {
      // Already downvoted - remove downvote
      await pool.query(
        `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      downvotesChange = -1;
      voteScoreChange = 1;
      newVoteType = null;
    } else if (existingVote[0].vote_type === 'upvote') {
      // Was upvoted - change to downvote
      await pool.query(
        `UPDATE answer_votes SET vote_type = 'downvote' WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = -1;
      downvotesChange = 1;
      voteScoreChange = -2; // -1 for removing upvote, -1 for adding downvote = -2
      newVoteType = 'downvote';
    }

    // Update answer vote counts
    await pool.query(
      `UPDATE answers 
       SET upvotes = upvotes + ?,
           downvotes = downvotes + ?,
           vote_score = vote_score + ?
       WHERE id = ?`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated counts
    const [updatedAnswer] = await pool.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
      [answerId]
    );

    res.json({
      success: true,
      data: {
        upvotes: updatedAnswer[0].upvotes,
        downvotes: updatedAnswer[0].downvotes,
        vote_score: updatedAnswer[0].vote_score,
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer downvoted" : 
               existingVote[0].vote_type === 'downvote' ? "Downvote removed" : 
               "Changed from upvote to downvote"
    });

  } catch (err) {
    console.error("downvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error downvoting answer"
    });
  }
};

const getAnswerById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answerId } = req.params;

    // Get user's vote
    const [userVote] = await pool.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
      [answerId, userId]
    );

    const [answer] = await pool.query(
      `SELECT 
        a.id,
        a.question_id,
        a.user_id,
        a.is_anonymous,
        a.anonymous_name,
        a.anonymous_bg_color,
        a.post_id,
        a.question_type,
        a.text_answer,
        a.yes_no,
        a.rating_value,
        a.singlechoice_option_id,
        a.singlechoice_option_value,
        a.multiplechoice_option_ids,
        a.multiplechoice_option_value,
        a.ranking_positions,
        a.ranking_position_value,
        a.range_value,
        a.upvotes,
        a.downvotes,
        a.vote_score,
        a.created_at,
        a.updated_at,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_name
          ELSE u.username
        END AS author_name,
        
        CASE
          WHEN a.is_anonymous = 1 THEN NULL
          ELSE u.avatar_url
        END AS author_avatar,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_bg_color
          ELSE NULL
        END AS author_bg_color
        
      FROM answers a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.id = ?`,
      [answerId]
    );

    if (!answer.length) {
      return res.status(404).json({
        success: false,
        message: "Answer not found"
      });
    }

    res.json({
      success: true,
      data: {
        ...answer[0],
        user_vote_type: userVote[0]?.vote_type || null
      }
    });

  } catch (err) {
    console.error("getAnswerById error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching answer"
    });
  }
};

module.exports = {
  answerQA,
  getQuestionById,
  getAllAnswersByQuestionId,
  upvoteAnswer,
  downvoteAnswer,
  getAnswerById,
  getMostPopularAnswer,
};

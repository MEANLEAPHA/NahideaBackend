const pool = require("../../config/db");
// const answerQA = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         const { postId, questionId, questionType } = req.params;

//         const {
//             is_anonymous, anonymous_name, anonymous_bg_color,

//             // opened
//             answerText,

//             // closed
//             answerYesNo,

//             // rating
//             ratingValue,

//             // singlechoice
//             optionId,
//             optionText,

//             // multiplechoice
//             optionIds,
//             optionTexts,

//             // ranking
//             rankingIds,
//             rankingTexts,

//             // range
//             rangeValue
//         } = req.body;

//         switch(questionType){
//             case "openend":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'openend', ?, ?, ?, ?)`,
//                 [questionId, postId, userId, answerText, is_anonymous || null, anonymous_name || null, anonymous_bg_color || null]);
//                 break;
//             case "closedend":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'closedend', ?, ?, ?, ?)`,
//                 [questionId, postId, userId, answerYesNo, is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;

//             case "rating":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, rating_value, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'rating', ?, ?, ?, ?)`,
//                 [questionId, postId, userId, ratingValue, is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;

//             case "singlechoice":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, singlechoice_option_id, singlechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'singlechoice', ?, ?, ?, ?, ?)`,
//                 [questionId, postId, userId, optionId, optionText, is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;

//             case "multiplechoice":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, multiplechoice_option_ids, multiplechoice_option_value,is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'multiplechoice', ?, ?, ?, ?, ?)`,
//                 [questionId, postId, userId, JSON.stringify(optionIds), JSON.stringify(optionTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;

//             case "rankingorder":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, ranking_positions, ranking_position_value, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'rankingorder', ?, ?, ?, ?, ?)`,
//                 [questionId, postId, userId, JSON.stringify(rankingIds) ,JSON.stringify(rankingTexts), is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;

//             case "range":
//                 await pool.query(
//                 `INSERT INTO answers 
//                     (question_id, post_id, user_id, question_type, range_value, is_anonymous, anonymous_name, anonymous_bg_color)
//                     VALUES (?, ?, ?, 'range', ?, ?, ?, ?)`,
//                 [questionId, postId, userId, rangeValue, is_anonymous, anonymous_name, anonymous_bg_color]);
//                 break;
//         }
//         res.status(200).json(
//             {
//                 success: true,
//                 message: "Answer submitted successfully"
//             }
//         );

//     }catch(err){
//         console.log(err.message);
//         res.status(500).json({ error: "Something went wrong" });
//     }
// }
const answerQA = async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const userId = req.user.userId;
        const { postId, questionId, questionType } = req.params;
        
        // Get username for notification
        const [[user]] = await connection.query(
            `SELECT username FROM users WHERE id = ?`,
            [userId]
        );
        const username = user?.username || 'Someone';
        
        // Get post owner for notification
        const [[post]] = await connection.query(
            `SELECT user_id FROM posts WHERE id = ?`,
            [postId]
        );
        const postOwnerId = post?.user_id;
        
        // Get question details for notification
        const [[question]] = await connection.query(
            `SELECT title FROM question WHERE id = ?`,
            [questionId]
        );
        const questionTitle = question?.title || 'your question';
        
        const today = new Date().toISOString().split("T")[0];
        const currentDate = today;
        const currentMonth = today.slice(0, 7).replace("-", "");
        
        const aggregateKey = `answer_${postOwnerId}_${questionId}`;
        
        const {
            is_anonymous, anonymous_name, anonymous_bg_color,
            answerText,
            answerYesNo,
            ratingValue,
            optionId,
            optionText,
            optionIds,
            optionTexts,
            rankingIds,
            rankingTexts,
            rangeValue
        } = req.body;
        
        let answerId;
        
        // =========================
        // INSERT ANSWER
        // =========================
        
        switch(questionType){
            case "openend":
                const [openResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'openend', ?, ?, ?, ?)`,
                    [questionId, postId, userId, answerText, is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = openResult.insertId;
                break;
                
            case "closedend":
                const [closedResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'closedend', ?, ?, ?, ?)`,
                    [questionId, postId, userId, answerYesNo, is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = closedResult.insertId;
                break;

            case "rating":
                const [ratingResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, rating_value, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'rating', ?, ?, ?, ?)`,
                    [questionId, postId, userId, ratingValue, is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = ratingResult.insertId;
                break;

            case "singlechoice":
                const [singleResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, singlechoice_option_id, singlechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'singlechoice', ?, ?, ?, ?, ?)`,
                    [questionId, postId, userId, optionId, optionText, is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = singleResult.insertId;
                break;

            case "multiplechoice":
                const [multiResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, multiplechoice_option_ids, multiplechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'multiplechoice', ?, ?, ?, ?, ?)`,
                    [questionId, postId, userId, JSON.stringify(optionIds), JSON.stringify(optionTexts), is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = multiResult.insertId;
                break;

            case "rankingorder":
                const [rankingResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, ranking_positions, ranking_position_value, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'rankingorder', ?, ?, ?, ?, ?)`,
                    [questionId, postId, userId, JSON.stringify(rankingIds), JSON.stringify(rankingTexts), is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = rankingResult.insertId;
                break;

            case "range":
                const [rangeResult] = await connection.query(
                    `INSERT INTO answers 
                        (question_id, post_id, user_id, question_type, range_value, is_anonymous, anonymous_name, anonymous_bg_color)
                        VALUES (?, ?, ?, 'range', ?, ?, ?, ?)`,
                    [questionId, postId, userId, rangeValue, is_anonymous || 0, anonymous_name || null, anonymous_bg_color || null]
                );
                answerId = rangeResult.insertId;
                break;
                
            default:
                throw new Error("Invalid question type");
        }
        
        // =========================
        // UPDATE POST ANSWERS COUNT
        // =========================
        
        await connection.query(
            `UPDATE question SET answers_count = answers_count + 1 WHERE id = ?`,
            [questionId]
        );
        
        // =========================
        // NOTIFICATION LOGIC
        // =========================
        
        // Don't notify if user is answering their own question
        if (Number(postOwnerId) !== Number(userId)) {
            
            // Get total answers count for this question
            const [[answerData]] = await connection.query(
                `SELECT COUNT(*) as total_answers FROM answers WHERE question_id = ?`,
                [questionId]
            );
            const totalAnswers = answerData.total_answers;
            
            // Build notification content
            let notificationContent = '';
            let displayName = is_anonymous ? 'Someone' : username;
            
            if (totalAnswers === 1) {
                notificationContent = `${displayName} answered your question: "${questionTitle.slice(0, 50)}${questionTitle.length > 50 ? '...' : ''}"`;
            } else {
                notificationContent = `${displayName} and ${totalAnswers - 1} other${totalAnswers - 1 > 1 ? 's' : ''} answered your question: "${questionTitle.slice(0, 50)}${questionTitle.length > 50 ? '...' : ''}"`;
            }
            
            // Check if there's already an existing aggregate notification
            const [existingNotification] = await connection.query(
                `SELECT id FROM notifications WHERE aggregate_key = ? AND type = 'answer' LIMIT 1`,
                [aggregateKey]
            );
            
            if (existingNotification.length > 0) {
                // Update existing notification
                await connection.query(
                    `UPDATE notifications 
                     SET sender_id = ?,
                         content = ?,
                         is_viewed = 0,
                         created_at = NOW()
                     WHERE aggregate_key = ? AND type = 'answer'`,
                    [userId, notificationContent, aggregateKey]
                );
            } else {
                // Create new notification
                await connection.query(
                    `INSERT INTO notifications (
                        receiver_id, 
                        sender_id, 
                        type, 
                        content, 
                        post_id, 
                        answer_id,
                        aggregate_key, 
                        is_viewed
                    ) VALUES (?, ?, 'answer', ?, ?, ?, ?, 0)`,
                    [
                        postOwnerId,
                        userId,
                        notificationContent,
                        postId,
                        answerId,
                        aggregateKey
                    ]
                );
            }
        }
        
        // =========================
        // TRENDING/RANKING (TODO - implement later)
        // =========================
        // await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 5, postId.toString());
        // await ranking.zIncrBy(`hof:month:${currentMonth}`, 3, userId.toString());
        
        await connection.commit();
        
        res.status(200).json({
            success: true,
            message: "Answer submitted successfully",
            data: {
                answer_id: answerId
            }
        });
        
    } catch(err) {
        await connection.rollback();
        console.error("answerQA error:", err);
        res.status(500).json({ 
            success: false,
            error: "Something went wrong",
            message: err.message 
        });
    } finally {
        connection.release();
    }
};

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
// const upvoteAnswer = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { answerId } = req.params;

//     // Check if answer exists
//     const [answer] = await pool.query(
//       `SELECT id, user_id FROM answers WHERE id = ?`,
//       [answerId]
//     );

//     if (!answer.length) {
//       return res.status(404).json({
//         success: false,
//         message: "Answer not found"
//       });
//     }

//     // Check existing vote
//     const [existingVote] = await pool.query(
//       `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
//       [answerId, userId]
//     );

//     let upvotesChange = 0;
//     let downvotesChange = 0;
//     let voteScoreChange = 0;
//     let newVoteType = null;

//     if (existingVote.length === 0) {
//       // No existing vote - add upvote
//       await pool.query(
//         `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'upvote')`,
//         [answerId, userId]
//       );
//       upvotesChange = 1;
//       voteScoreChange = 1;
//       newVoteType = 'upvote';
//     } else if (existingVote[0].vote_type === 'upvote') {
//       // Already upvoted - remove upvote
//       await pool.query(
//         `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
//         [answerId, userId]
//       );
//       upvotesChange = -1;
//       voteScoreChange = -1;
//       newVoteType = null;
//     } else if (existingVote[0].vote_type === 'downvote') {
//       // Was downvoted - change to upvote
//       await pool.query(
//         `UPDATE answer_votes SET vote_type = 'upvote' WHERE answer_id = ? AND user_id = ?`,
//         [answerId, userId]
//       );
//       upvotesChange = 1;
//       downvotesChange = -1;
//       voteScoreChange = 2; // +1 for upvote, -(-1) for removing downvote = +2
//       newVoteType = 'upvote';
//     }

//     // Update answer vote counts
//     await pool.query(
//       `UPDATE answers 
//        SET upvotes = upvotes + ?,
//            downvotes = downvotes + ?,
//            vote_score = vote_score + ?
//        WHERE id = ?`,
//       [upvotesChange, downvotesChange, voteScoreChange, answerId]
//     );

//     // Get updated counts
//     const [updatedAnswer] = await pool.query(
//       `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
//       [answerId]
//     );

//     res.json({
//       success: true,
//       data: {
//         upvotes: updatedAnswer[0].upvotes,
//         downvotes: updatedAnswer[0].downvotes,
//         vote_score: updatedAnswer[0].vote_score,
//         user_vote_type: newVoteType
//       },
//       message: existingVote.length === 0 ? "Answer upvoted" : 
//                existingVote[0].vote_type === 'upvote' ? "Upvote removed" : 
//                "Changed from downvote to upvote"
//     });

//   } catch (err) {
//     console.error("upvoteAnswer error:", err);
//     res.status(500).json({
//       success: false,
//       message: "Error upvoting answer"
//     });
//   }
// };

// const downvoteAnswer = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { answerId } = req.params;

//     // Check if answer exists
//     const [answer] = await pool.query(
//       `SELECT id, user_id FROM answers WHERE id = ?`,
//       [answerId]
//     );

//     if (!answer.length) {
//       return res.status(404).json({
//         success: false,
//         message: "Answer not found"
//       });
//     }

//     // Check existing vote
//     const [existingVote] = await pool.query(
//       `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
//       [answerId, userId]
//     );

//     let upvotesChange = 0;
//     let downvotesChange = 0;
//     let voteScoreChange = 0;
//     let newVoteType = null;

//     if (existingVote.length === 0) {
//       // No existing vote - add downvote
//       await pool.query(
//         `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'downvote')`,
//         [answerId, userId]
//       );
//       downvotesChange = 1;
//       voteScoreChange = -1;
//       newVoteType = 'downvote';
//     } else if (existingVote[0].vote_type === 'downvote') {
//       // Already downvoted - remove downvote
//       await pool.query(
//         `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
//         [answerId, userId]
//       );
//       downvotesChange = -1;
//       voteScoreChange = 1;
//       newVoteType = null;
//     } else if (existingVote[0].vote_type === 'upvote') {
//       // Was upvoted - change to downvote
//       await pool.query(
//         `UPDATE answer_votes SET vote_type = 'downvote' WHERE answer_id = ? AND user_id = ?`,
//         [answerId, userId]
//       );
//       upvotesChange = -1;
//       downvotesChange = 1;
//       voteScoreChange = -2; // -1 for removing upvote, -1 for adding downvote = -2
//       newVoteType = 'downvote';
//     }

//     // Update answer vote counts
//     await pool.query(
//       `UPDATE answers 
//        SET upvotes = upvotes + ?,
//            downvotes = downvotes + ?,
//            vote_score = vote_score + ?
//        WHERE id = ?`,
//       [upvotesChange, downvotesChange, voteScoreChange, answerId]
//     );

//     // Get updated counts
//     const [updatedAnswer] = await pool.query(
//       `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
//       [answerId]
//     );

//     res.json({
//       success: true,
//       data: {
//         upvotes: updatedAnswer[0].upvotes,
//         downvotes: updatedAnswer[0].downvotes,
//         vote_score: updatedAnswer[0].vote_score,
//         user_vote_type: newVoteType
//       },
//       message: existingVote.length === 0 ? "Answer downvoted" : 
//                existingVote[0].vote_type === 'downvote' ? "Downvote removed" : 
//                "Changed from upvote to downvote"
//     });

//   } catch (err) {
//     console.error("downvoteAnswer error:", err);
//     res.status(500).json({
//       success: false,
//       message: "Error downvoting answer"
//     });
//   }
// };

const upvoteAnswer = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const userId = req.user.userId;
    const { answerId } = req.params;
    
    // Get username for notification
    const [[user]] = await connection.query(
      `SELECT username FROM users WHERE id = ?`,
      [userId]
    );
    const username = user?.username || 'Someone';

    // Check if answer exists
    const [answer] = await connection.query(
      `SELECT id, user_id, question_id, post_id FROM answers WHERE id = ?`,
      [answerId]
    );

    if (!answer.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Answer not found"
      });
    }

    const answerOwnerId = answer[0].user_id;
    const questionId = answer[0].question_id;
    const postId = answer[0].post_id;
    const aggregateKey = `answer_vote_${answerOwnerId}_${answerId}`;

    // Check existing vote
    const [existingVote] = await connection.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
      [answerId, userId]
    );

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;
    let notificationAction = null; // 'create', 'update', 'delete'

    if (existingVote.length === 0) {
      // No existing vote - add upvote
      await connection.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'upvote')`,
        [answerId, userId]
      );
      upvotesChange = 1;
      voteScoreChange = 1;
      newVoteType = 'upvote';
      notificationAction = 'create';
      
    } else if (existingVote[0].vote_type === 'upvote') {
      // Already upvoted - remove upvote
      await connection.query(
        `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = -1;
      voteScoreChange = -1;
      newVoteType = null;
      notificationAction = 'delete';
      
    } else if (existingVote[0].vote_type === 'downvote') {
      // Was downvoted - change to upvote
      await connection.query(
        `UPDATE answer_votes SET vote_type = 'upvote' WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = 1;
      downvotesChange = -1;
      voteScoreChange = 2;
      newVoteType = 'upvote';
      notificationAction = 'update';
    }

    // Update answer vote counts
    await connection.query(
      `UPDATE answers 
       SET upvotes = upvotes + ?,
           downvotes = downvotes + ?,
           vote_score = vote_score + ?
       WHERE id = ?`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated vote counts
    const [[updatedAnswer]] = await connection.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
      [answerId]
    );

    // ============================================
    // NOTIFICATION LOGIC
    // ============================================
    
    // Don't notify if user is voting on their own answer
    if (Number(answerOwnerId) !== Number(userId)) {
      
      // Get total upvotes for this answer
      const [[voteData]] = await connection.query(
        `SELECT upvotes FROM answers WHERE id = ?`,
        [answerId]
      );
      const totalUpvotes = voteData.upvotes;
      
      let notificationContent = '';
      let notificationType = 'answer_upvote';
      
      if (notificationAction === 'create') {
        // New upvote
        if (totalUpvotes === 1) {
          notificationContent = `${username} upvoted your answer`;
        } else {
          notificationContent = `${username} and ${totalUpvotes - 1} other${totalUpvotes - 1 > 1 ? 's' : ''} upvoted your answer`;
        }
        
        // Check if there's already an existing aggregate notification
        const [existingNotification] = await connection.query(
          `SELECT id FROM notifications WHERE aggregate_key = ? LIMIT 1`,
          [aggregateKey]
        );
        
        if (existingNotification.length > 0) {
          // Update existing notification
          await connection.query(
            `UPDATE notifications 
             SET sender_id = ?,
                 content = ?,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = ?`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          // Create new notification
          await connection.query(
            `INSERT INTO notifications (
              receiver_id, 
              sender_id, 
              type, 
              content, 
              answer_id,
              post_id,
              aggregate_key, 
              is_viewed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              answerOwnerId,
              userId,
              notificationType,
              notificationContent,
              answerId,
              postId,
              aggregateKey
            ]
          );
        }
        
      } else if (notificationAction === 'update') {
        // Changed from downvote to upvote
        if (totalUpvotes === 1) {
          notificationContent = `${username} upvoted your answer`;
        } else {
          notificationContent = `${username} and ${totalUpvotes - 1} other${totalUpvotes - 1 > 1 ? 's' : ''} upvoted your answer`;
        }
        
        // Update existing notification
        const [existingNotification] = await connection.query(
          `SELECT id FROM notifications WHERE aggregate_key = ? LIMIT 1`,
          [aggregateKey]
        );
        
        if (existingNotification.length > 0) {
          await connection.query(
            `UPDATE notifications 
             SET sender_id = ?,
                 content = ?,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = ?`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          await connection.query(
            `INSERT INTO notifications (
              receiver_id, 
              sender_id, 
              type, 
              content, 
              answer_id,
              post_id,
              aggregate_key, 
              is_viewed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              answerOwnerId,
              userId,
              notificationType,
              notificationContent,
              answerId,
              postId,
              aggregateKey
            ]
          );
        }
        
      } else if (notificationAction === 'delete') {
        // Remove upvote - check if there are any other upvotes
        if (totalUpvotes === 0) {
          // No upvotes left, delete notification
          await connection.query(
            `DELETE FROM notifications WHERE aggregate_key = ?`,
            [aggregateKey]
          );
        } else {
          // Still have upvotes, update notification with latest liker
          const [[latestUpvoter]] = await connection.query(
            `SELECT 
               av.user_id,
               u.username
             FROM answer_votes av
             JOIN users u ON u.id = av.user_id
             WHERE av.answer_id = ? 
               AND av.vote_type = 'upvote'
             ORDER BY av.id DESC
             LIMIT 1`,
            [answerId]
          );
          
          if (latestUpvoter) {
            if (totalUpvotes === 1) {
              notificationContent = `${latestUpvoter.username} upvoted your answer`;
            } else {
              notificationContent = `${latestUpvoter.username} and ${totalUpvotes - 1} other${totalUpvotes - 1 > 1 ? 's' : ''} upvoted your answer`;
            }
            
            await connection.query(
              `UPDATE notifications 
               SET sender_id = ?,
                   content = ?,
                   is_viewed = 0,
                   created_at = NOW()
               WHERE aggregate_key = ?`,
              [latestUpvoter.user_id, notificationContent, aggregateKey]
            );
          }
        }
      }
    }

    // ============================================
    // TRENDING/RANKING (TODO - implement later)
    // ============================================
    // const currentDay = new Date().toISOString().split("T")[0];
    // await ranking.zIncrBy(`trendingAnswer:day:${currentDay}`, 1, answerId.toString());
    // await ranking.zIncrBy(`hof:month:${currentDay.slice(0, 7).replace("-", "")}`, 0.5, userId.toString());

    await connection.commit();

    res.json({
      success: true,
      data: {
        upvotes: updatedAnswer.upvotes,
        downvotes: updatedAnswer.downvotes,
        vote_score: updatedAnswer.vote_score,
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer upvoted" : 
               existingVote[0]?.vote_type === 'upvote' ? "Upvote removed" : 
               "Changed from downvote to upvote"
    });

  } catch (err) {
    await connection.rollback();
    console.error("upvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error upvoting answer"
    });
  } finally {
    connection.release();
  }
};

const downvoteAnswer = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const userId = req.user.userId;
    const { answerId } = req.params;
    
    // Get username for notification
    const [[user]] = await connection.query(
      `SELECT username FROM users WHERE id = ?`,
      [userId]
    );
    const username = user?.username || 'Someone';

    // Check if answer exists
    const [answer] = await connection.query(
      `SELECT id, user_id, question_id, post_id FROM answers WHERE id = ?`,
      [answerId]
    );

    if (!answer.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Answer not found"
      });
    }

    const answerOwnerId = answer[0].user_id;
    const questionId = answer[0].question_id;
    const postId = answer[0].post_id;
    const aggregateKey = `answer_vote_${answerOwnerId}_${answerId}`;

    // Check existing vote
    const [existingVote] = await connection.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
      [answerId, userId]
    );

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;
    let notificationAction = null; // 'create', 'update', 'delete'

    if (existingVote.length === 0) {
      // No existing vote - add downvote
      await connection.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES (?, ?, 'downvote')`,
        [answerId, userId]
      );
      downvotesChange = 1;
      voteScoreChange = -1;
      newVoteType = 'downvote';
      notificationAction = 'create';
      
    } else if (existingVote[0].vote_type === 'downvote') {
      // Already downvoted - remove downvote
      await connection.query(
        `DELETE FROM answer_votes WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      downvotesChange = -1;
      voteScoreChange = 1;
      newVoteType = null;
      notificationAction = 'delete';
      
    } else if (existingVote[0].vote_type === 'upvote') {
      // Was upvoted - change to downvote
      await connection.query(
        `UPDATE answer_votes SET vote_type = 'downvote' WHERE answer_id = ? AND user_id = ?`,
        [answerId, userId]
      );
      upvotesChange = -1;
      downvotesChange = 1;
      voteScoreChange = -2;
      newVoteType = 'downvote';
      notificationAction = 'update';
    }

    // Update answer vote counts
    await connection.query(
      `UPDATE answers 
       SET upvotes = upvotes + ?,
           downvotes = downvotes + ?,
           vote_score = vote_score + ?
       WHERE id = ?`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated vote counts
    const [[updatedAnswer]] = await connection.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = ?`,
      [answerId]
    );

    // ============================================
    // NOTIFICATION LOGIC FOR DOWNVOTES
    // ============================================
    
    // Note: For downvotes, you may or may not want to notify.
    // Option 1: Don't notify for downvotes (negative experience)
    // Option 2: Notify for downvotes (but content different)
    
    // OPTION 2: Notify for downvotes (uncomment if you want this)
    /*
    if (Number(answerOwnerId) !== Number(userId)) {
      
      const [[voteData]] = await connection.query(
        `SELECT downvotes FROM answers WHERE id = ?`,
        [answerId]
      );
      const totalDownvotes = voteData.downvotes;
      
      let notificationContent = '';
      let notificationType = 'answer_downvote';
      
      if (notificationAction === 'create') {
        if (totalDownvotes === 1) {
          notificationContent = `${username} downvoted your answer`;
        } else {
          notificationContent = `${username} and ${totalDownvotes - 1} other${totalDownvotes - 1 > 1 ? 's' : ''} downvoted your answer`;
        }
        
        const [existingNotification] = await connection.query(
          `SELECT id FROM notifications WHERE aggregate_key = ? AND type = 'answer_downvote' LIMIT 1`,
          [aggregateKey]
        );
        
        if (existingNotification.length > 0) {
          await connection.query(
            `UPDATE notifications 
             SET sender_id = ?,
                 content = ?,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = ? AND type = 'answer_downvote'`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          await connection.query(
            `INSERT INTO notifications (
              receiver_id, sender_id, type, content, answer_id, post_id, aggregate_key, is_viewed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [answerOwnerId, userId, notificationType, notificationContent, answerId, postId, aggregateKey]
          );
        }
        
      } else if (notificationAction === 'delete') {
        const [existingDownvote] = await connection.query(
          `SELECT id FROM answer_votes WHERE answer_id = ? AND vote_type = 'downvote' LIMIT 1`,
          [answerId]
        );
        
        if (!existingDownvote.length) {
          await connection.query(
            `DELETE FROM notifications WHERE aggregate_key = ? AND type = 'answer_downvote'`,
            [aggregateKey]
          );
        }
      }
    }
    */

    // ============================================
    // TRENDING/RANKING (TODO - implement later)
    // ============================================
    // const currentDay = new Date().toISOString().split("T")[0];
    // For downvotes, you might want to decrement trending score
    // await ranking.zIncrBy(`trendingAnswer:day:${currentDay}`, -1, answerId.toString());

    await connection.commit();

    res.json({
      success: true,
      data: {
        upvotes: updatedAnswer.upvotes,
        downvotes: updatedAnswer.downvotes,
        vote_score: updatedAnswer.vote_score,
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer downvoted" : 
               existingVote[0]?.vote_type === 'downvote' ? "Downvote removed" : 
               "Changed from upvote to downvote"
    });

  } catch (err) {
    await connection.rollback();
    console.error("downvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error downvoting answer"
    });
  } finally {
    connection.release();
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

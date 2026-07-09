const db = require("../../config/db");

const ALREADY_ANSWERED_MESSAGE = "You have already answered this question";

const QUESTION_TYPES = [
  "openend", "closedend", "rating", "range",
  "singlechoice", "multiplechoice", "rankingorder",
];

const REQUIRED_FIELDS = {
  openend: ["answerText"],
  closedend: ["answerYesNo"],
  rating: ["ratingValue"],
  range: ["rangeValue"],
  singlechoice: ["optionId", "optionText"],
  multiplechoice: ["optionIds", "optionTexts"],
  rankingorder: ["rankingIds", "rankingTexts"],
};

const generateAnonymousName = () => {
  const num = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join("");
  return `An${num}nymous`;
};

const generateAnonymousBgColor = () => {
  const colors = [
    "#8B5CF6", "#EC4899", "#38BDF8", "#818CF8", "#EAB308",
    "#4ADE80", "#F87171", "#FB923C", "#22D3EE", "#2DD4BF",
    "#F472B6", "#A78BFA", "#FCA5A5", "#FACC15", "#60A5FA",
    "#34D399", "#FB7185", "#6366F1", "#A855F7", "#3B82F6",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

const validateAnswerPayload = (questionType, body) => {
  const required = REQUIRED_FIELDS[questionType];
  if (!required) return "Invalid question type";

  for (const field of required) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      return `Missing required field: ${field}`;
    }
    if (Array.isArray(value) && value.length === 0) {
      return `Missing required field: ${field}`;
    }
  }

  if (questionType === "rating") {
    const rating = Number(body.ratingValue);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return "ratingValue must be an integer between 1 and 5";
    }
  }

  if (questionType === "closedend" && !["yes", "no"].includes(body.answerYesNo)) {
    return "answerYesNo must be 'yes' or 'no'";
  }

  return null;
};

const answerQA = async (req, res) => {
  const client = await db.connect();

  try {
    const userId = req.user?.userId;
    if (!userId) {
      client.release();
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { postId, questionId, questionType } = req.params;

    if (!QUESTION_TYPES.includes(questionType)) {
      client.release();
      return res.status(400).json({ success: false, message: "Invalid question type" });
    }

    if (!Number.isInteger(Number(postId)) || !Number.isInteger(Number(questionId))) {
      client.release();
      return res.status(400).json({ success: false, message: "Invalid postId or questionId" });
    }

    const validationError = validateAnswerPayload(questionType, req.body);
    if (validationError) {
      client.release();
      return res.status(400).json({ success: false, message: validationError });
    }

    await client.query("BEGIN");

    const questionResult = await client.query(
      `SELECT title FROM question WHERE id = $1`,
      [questionId]
    );
    const question = questionResult.rows[0];

    if (!question) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    // ── Duplicate-answer guard ──────────────────────────────────────────
    const existingAnswerResult = await client.query(
      `SELECT id FROM answers WHERE question_id = $1 AND user_id = $2 LIMIT 1`,
      [questionId, userId]
    );
    const existingAnswer = existingAnswerResult.rows[0];

    if (existingAnswer) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        code: "ALREADY_ANSWERED",
        message: ALREADY_ANSWERED_MESSAGE,
      });
    }
    // ─────────────────────────────────────────────────────────────────

    const userResult = await client.query(`SELECT username FROM users WHERE id = $1`, [userId]);
    const user = userResult.rows[0];
    const username = user?.username || "Someone";

    const postResult = await client.query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
    const post = postResult.rows[0];
    if (!post) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Post not found" });
    }
    const postOwnerId = post.user_id;
    const questionTitle = question.title || "your question";

    const aggregateKey = `answer_${postOwnerId}_${questionId}`;

    const {
      is_anonymous, answerText, answerYesNo, ratingValue, optionId, optionText,
      optionIds, optionTexts, rankingIds, rankingTexts, rangeValue,
    } = req.body;

    const isAnon = Number(is_anonymous) === 1 ? 1 : 0;
    const anonymousName = isAnon ? generateAnonymousName() : null;
    const anonymousBgColor = isAnon ? generateAnonymousBgColor() : null;

    let answerId;

    switch (questionType) {
      case "openend": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, text_answer, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'openend', $4, $5, $6, $7) RETURNING id`,
          [questionId, postId, userId, answerText, isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "closedend": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, yes_no, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'closedend', $4, $5, $6, $7) RETURNING id`,
          [questionId, postId, userId, answerYesNo, isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "rating": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, rating_value, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'rating', $4, $5, $6, $7) RETURNING id`,
          [questionId, postId, userId, ratingValue, isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "singlechoice": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, singlechoice_option_id, singlechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'singlechoice', $4, $5, $6, $7, $8) RETURNING id`,
          [questionId, postId, userId, optionId, optionText, isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "multiplechoice": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, multiplechoice_option_ids, multiplechoice_option_value, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'multiplechoice', $4, $5, $6, $7, $8) RETURNING id`,
          [questionId, postId, userId, JSON.stringify(optionIds), JSON.stringify(optionTexts), isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "rankingorder": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, ranking_positions, ranking_position_value, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'rankingorder', $4, $5, $6, $7, $8) RETURNING id`,
          [questionId, postId, userId, JSON.stringify(rankingIds), JSON.stringify(rankingTexts), isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
      case "range": {
        const r = await client.query(
          `INSERT INTO answers (question_id, post_id, user_id, question_type, range_value, is_anonymous, anonymous_name, anonymous_bg_color)
           VALUES ($1, $2, $3, 'range', $4, $5, $6, $7) RETURNING id`,
          [questionId, postId, userId, rangeValue, isAnon, anonymousName, anonymousBgColor]
        );
        answerId = r.rows[0].id;
        break;
      }
    }

    await client.query(`UPDATE posts SET answers_count = answers_count + 1 WHERE id = $1`, [postId]);

    if (Number(postOwnerId) !== Number(userId)) {
      const answerDataResult = await client.query(
        `SELECT COUNT(*) as total_answers FROM answers WHERE question_id = $1`,
        [questionId]
      );
      const answerData = answerDataResult.rows[0];
      const totalAnswers = Number(answerData.total_answers);
      const displayName = isAnon ? "Someone" : username;
      const truncatedTitle = `${questionTitle.slice(0, 50)}${questionTitle.length > 50 ? "..." : ""}`;

      const notificationContent =
        totalAnswers === 1
          ? `${displayName} answered your question: "${truncatedTitle}"`
          : `${displayName} and ${totalAnswers - 1} other${totalAnswers - 1 > 1 ? "s" : ""} answered your question: "${truncatedTitle}"`;

      const existingNotificationResult = await client.query(
        `SELECT id FROM notifications WHERE aggregate_key = $1 AND type = 'answer' LIMIT 1`,
        [aggregateKey]
      );

      if (existingNotificationResult.rowCount > 0) {
        await client.query(
          `UPDATE notifications SET sender_id = $1, content = $2, is_viewed = 0, created_at = NOW()
           WHERE aggregate_key = $3 AND type = 'answer'`,
          [userId, notificationContent, aggregateKey]
        );
      } else {
        await client.query(
          `INSERT INTO notifications (receiver_id, sender_id, type, content, post_id, answer_id, aggregate_key, is_viewed)
           VALUES ($1, $2, 'answer', $3, $4, $5, $6, 0)`,
          [postOwnerId, userId, notificationContent, postId, answerId, aggregateKey]
        );
      }
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Answer submitted successfully",
      data: { answer_id: answerId },
    });
  } catch (err) {
    await client.query("ROLLBACK");

    // Safety net if you add the UNIQUE(question_id, user_id) constraint below —
    // catches a race where two simultaneous submits both pass the SELECT check.
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        code: "ALREADY_ANSWERED",
        message: ALREADY_ANSWERED_MESSAGE,
      });
    }

    console.error("answerQA error:", err);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  } finally {
    client.release();
  }
};

const checkAlreadyAnswered = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { questionId } = req.params;

    const existingResult = await db.query(
      `SELECT id FROM answers WHERE question_id = $1 AND user_id = $2 LIMIT 1`,
      [questionId, userId]
    );
    const existing = existingResult.rows[0];

    return res.status(200).json({ success: true, alreadyAnswered: !!existing });
  } catch (err) {
    console.error("checkAlreadyAnswered error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getQuestionById = async (req, res) => {
  try {
    const { questionId, questionType } = req.params;

    if (!QUESTION_TYPES.includes(questionType)) {
      return res.status(400).json({ success: false, message: "Invalid question type" });
    }

    const questionsResult = await db.query(
      `SELECT id, title FROM question WHERE id = $1`,
      [questionId]
    );
    const question = questionsResult.rows[0];

    if (!question) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    let data = { ...question };

    switch (questionType) {
      case "openend":
      case "closedend":
        break;

      case "range": {
        const rowsResult = await db.query(`SELECT * FROM question_range WHERE question_id = $1`, [questionId]);
        data = { ...data, ...(rowsResult.rows[0] || {}) };
        break;
      }
      case "rating": {
        const rowsResult = await db.query(`SELECT * FROM rating WHERE question_id = $1`, [questionId]);
        data = { ...data, ...(rowsResult.rows[0] || {}) };
        break;
      }
      case "singlechoice": {
        const rowsResult = await db.query(
          `SELECT sco.*, sc.question_id
           FROM singlechoice_option sco
           JOIN singlechoice sc ON sco.singlechoice_id = sc.id
           WHERE sc.question_id = $1`,
          [questionId]
        );
        data = { ...data, choice: rowsResult.rows };
        break;
      }
      case "multiplechoice": {
        const rowsResult = await db.query(
          `SELECT mco.*, mc.question_id, mc.include_all_above
           FROM multiplechoice_option mco
           JOIN multiplechoice mc ON mco.multiplechoice_id = mc.id
           WHERE mc.question_id = $1`,
          [questionId]
        );
        data = { ...data, include_all_above: rowsResult.rows[0]?.include_all_above || 0, choices: rowsResult.rows };
        break;
      }
      case "rankingorder": {
        const rowsResult = await db.query(
          `SELECT ri.*, ro.question_id
           FROM ranking_item ri
           JOIN rankingorder ro ON ri.ranking_id = ro.id
           WHERE ro.question_id = $1`,
          [questionId]
        );
        data = { ...data, items: rowsResult.rows };
        break;
      }
    }

    return res.status(200).json({ success: true, source: "pool", datas: data });
  } catch (err) {
    console.error("getQuestionById error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllAnswersByQuestionId = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { questionId } = req.params;
    let { page = 1, limit = 20, sort = 'top' } = req.query;

    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    // Get user's votes on answers
    const userVotesResult = await db.query(
      `SELECT answer_id, vote_type FROM answer_votes WHERE user_id = $1`,
      [userId]
    );
    const userVotes = userVotesResult.rows;

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
    const answersResult = await db.query(
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
        u.avatar_url,

        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_name
          ELSE u.username
        END AS author_name,
        
        CASE
          WHEN a.is_anonymous = 1 THEN a.anonymous_bg_color
          ELSE NULL
        END AS author_bg_color,
        
        -- Check if current user voted
        $1 AS user_vote_type,
        
        -- Get total answers count
        COUNT(*) OVER() AS total_count
        
      FROM answers a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.question_id = $2
      ${orderBy}
      LIMIT $3 OFFSET $4`,
      [userId, questionId, limit, offset]
    );
    const answers = answersResult.rows;

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
    const userVotesResult = await db.query(
      `SELECT answer_id, vote_type FROM answer_votes WHERE user_id = $1`,
      [userId]
    );
    const userVotes = userVotesResult.rows;

    const voteMap = new Map();
    userVotes.forEach(vote => {
      voteMap.set(vote.answer_id, vote.vote_type);
    });

    const answerResult = await db.query(
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
      WHERE a.question_id = $1
      ORDER BY a.vote_score DESC, a.upvotes DESC
      LIMIT 1`,
      [questionId]
    );
    const answer = answerResult.rows;

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
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const userId = req.user.userId;
    const { answerId } = req.params;
    
    // Get username for notification
    const userResult = await client.query(
      `SELECT username FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    const username = user?.username || 'Someone';

    // Check if answer exists
    const answerResult = await client.query(
      `SELECT id, user_id, question_id, post_id FROM answers WHERE id = $1`,
      [answerId]
    );
    const answer = answerResult.rows;

    if (!answer.length) {
      await client.query("ROLLBACK");
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
    const existingVoteResult = await client.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = $1 AND user_id = $2`,
      [answerId, userId]
    );
    const existingVote = existingVoteResult.rows;

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;
    let notificationAction = null; // 'create', 'update', 'delete'

    if (existingVote.length === 0) {
      // No existing vote - add upvote
      await client.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES ($1, $2, 'upvote')`,
        [answerId, userId]
      );
      upvotesChange = 1;
      voteScoreChange = 1;
      newVoteType = 'upvote';
      notificationAction = 'create';
      
    } else if (existingVote[0].vote_type === 'upvote') {
      // Already upvoted - remove upvote
      await client.query(
        `DELETE FROM answer_votes WHERE answer_id = $1 AND user_id = $2`,
        [answerId, userId]
      );
      upvotesChange = -1;
      voteScoreChange = -1;
      newVoteType = null;
      notificationAction = 'delete';
      
    } else if (existingVote[0].vote_type === 'downvote') {
      // Was downvoted - change to upvote
      await client.query(
        `UPDATE answer_votes SET vote_type = 'upvote' WHERE answer_id = $1 AND user_id = $2`,
        [answerId, userId]
      );
      upvotesChange = 1;
      downvotesChange = -1;
      voteScoreChange = 2;
      newVoteType = 'upvote';
      notificationAction = 'update';
    }

    // Update answer vote counts
    await client.query(
      `UPDATE answers 
       SET upvotes = upvotes + $1,
           downvotes = downvotes + $2,
           vote_score = vote_score + $3
       WHERE id = $4`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated vote counts
    const updatedAnswerResult = await client.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = $1`,
      [answerId]
    );
    const updatedAnswer = updatedAnswerResult.rows[0];

    // ============================================
    // NOTIFICATION LOGIC
    // ============================================
    
    // Don't notify if user is voting on their own answer
    if (Number(answerOwnerId) !== Number(userId)) {
      
      // Get total upvotes for this answer
      const voteDataResult = await client.query(
        `SELECT upvotes FROM answers WHERE id = $1`,
        [answerId]
      );
      const voteData = voteDataResult.rows[0];
      const totalUpvotes = voteData.upvotes;
      
      let notificationContent = '';
      let notificationType = 'answer_upvote';
      
      if (notificationAction === 'create') {
        // New upvote
        if (Number(totalUpvotes) === 1) {
          notificationContent = `${username} upvoted your answer`;
        } else {
          notificationContent = `${username} and ${Number(totalUpvotes) - 1} other${Number(totalUpvotes) - 1 > 1 ? 's' : ''} upvoted your answer`;
        }
        
        // Check if there's already an existing aggregate notification
        const existingNotificationResult = await client.query(
          `SELECT id FROM notifications WHERE aggregate_key = $1 LIMIT 1`,
          [aggregateKey]
        );
        const existingNotification = existingNotificationResult.rows;
        
        if (existingNotification.length > 0) {
          // Update existing notification
          await client.query(
            `UPDATE notifications 
             SET sender_id = $1,
                 content = $2,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = $3`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          // Create new notification
          await client.query(
            `INSERT INTO notifications (
              receiver_id, 
              sender_id, 
              type, 
              content, 
              post_id,
              aggregate_key, 
              is_viewed
            ) VALUES ($1, $2, $3, $4, $5, $6, 0)`,
            [
              answerOwnerId,
              userId,
              notificationType,
              notificationContent,
              postId,
              aggregateKey
            ]
          );
        }
        
      } else if (notificationAction === 'update') {
        // Changed from downvote to upvote
        if (Number(totalUpvotes) === 1) {
          notificationContent = `${username} upvoted your answer`;
        } else {
          notificationContent = `${username} and ${Number(totalUpvotes) - 1} other${Number(totalUpvotes) - 1 > 1 ? 's' : ''} upvoted your answer`;
        }
        
        // Update existing notification
        const existingNotificationResult = await client.query(
          `SELECT id FROM notifications WHERE aggregate_key = $1 LIMIT 1`,
          [aggregateKey]
        );
        const existingNotification = existingNotificationResult.rows;
        
        if (existingNotification.length > 0) {
          await client.query(
            `UPDATE notifications 
             SET sender_id = $1,
                 content = $2,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = $3`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          await client.query(
            `INSERT INTO notifications (
              receiver_id, 
              sender_id, 
              type, 
              content, 
              post_id,
              aggregate_key, 
              is_viewed
            ) VALUES ($1, $2, $3, $4, $5, $6, 0)`,
            [
              answerOwnerId,
              userId,
              notificationType,
              notificationContent,
              postId,
              aggregateKey
            ]
          );
        }
        
      } else if (notificationAction === 'delete') {
        // Remove upvote - check if there are any other upvotes
        if (Number(totalUpvotes) === 0) {
          // No upvotes left, delete notification
          await client.query(
            `DELETE FROM notifications WHERE aggregate_key = $1`,
            [aggregateKey]
          );
        } else {
          // Still have upvotes, update notification with latest liker
          const latestUpvoterResult = await client.query(
            `SELECT 
               av.user_id,
               u.username
             FROM answer_votes av
             JOIN users u ON u.id = av.user_id
             WHERE av.answer_id = $1 
               AND av.vote_type = 'upvote'
             ORDER BY av.id DESC
             LIMIT 1`,
            [answerId]
          );
          const latestUpvoter = latestUpvoterResult.rows[0];
          
          if (latestUpvoter) {
            if (Number(totalUpvotes) === 1) {
              notificationContent = `${latestUpvoter.username} upvoted your answer`;
            } else {
              notificationContent = `${latestUpvoter.username} and ${Number(totalUpvotes) - 1} other${Number(totalUpvotes) - 1 > 1 ? 's' : ''} upvoted your answer`;
            }
            
            await client.query(
              `UPDATE notifications 
               SET sender_id = $1,
                   content = $2,
                   is_viewed = 0,
                   created_at = NOW()
               WHERE aggregate_key = $3`,
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

    await client.query("COMMIT");

    res.json({
      success: true,
      data: {
        upvotes: Number(updatedAnswer.upvotes),
        downvotes: Number(updatedAnswer.downvotes),
        vote_score: Number(updatedAnswer.vote_score),
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer upvoted" : 
               existingVote[0]?.vote_type === 'upvote' ? "Upvote removed" : 
               "Changed from downvote to upvote"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("upvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error upvoting answer"
    });
  } finally {
    client.release();
  }
};

const downvoteAnswer = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const userId = req.user.userId;
    const { answerId } = req.params;
    
    // Get username for notification
    const userResult = await client.query(
      `SELECT username FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    const username = user?.username || 'Someone';

    // Check if answer exists
    const answerResult = await client.query(
      `SELECT id, user_id, question_id, post_id FROM answers WHERE id = $1`,
      [answerId]
    );
    const answer = answerResult.rows;

    if (!answer.length) {
      await client.query("ROLLBACK");
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
    const existingVoteResult = await client.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = $1 AND user_id = $2`,
      [answerId, userId]
    );
    const existingVote = existingVoteResult.rows;

    let upvotesChange = 0;
    let downvotesChange = 0;
    let voteScoreChange = 0;
    let newVoteType = null;
    let notificationAction = null; // 'create', 'update', 'delete'

    if (existingVote.length === 0) {
      // No existing vote - add downvote
      await client.query(
        `INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES ($1, $2, 'downvote')`,
        [answerId, userId]
      );
      downvotesChange = 1;
      voteScoreChange = -1;
      newVoteType = 'downvote';
      notificationAction = 'create';
      
    } else if (existingVote[0].vote_type === 'downvote') {
      // Already downvoted - remove downvote
      await client.query(
        `DELETE FROM answer_votes WHERE answer_id = $1 AND user_id = $2`,
        [answerId, userId]
      );
      downvotesChange = -1;
      voteScoreChange = 1;
      newVoteType = null;
      notificationAction = 'delete';
      
    } else if (existingVote[0].vote_type === 'upvote') {
      // Was upvoted - change to downvote
      await client.query(
        `UPDATE answer_votes SET vote_type = 'downvote' WHERE answer_id = $1 AND user_id = $2`,
        [answerId, userId]
      );
      upvotesChange = -1;
      downvotesChange = 1;
      voteScoreChange = -2;
      newVoteType = 'downvote';
      notificationAction = 'update';
    }

    // Update answer vote counts
    await client.query(
      `UPDATE answers 
       SET upvotes = upvotes + $1,
           downvotes = downvotes + $2,
           vote_score = vote_score + $3
       WHERE id = $4`,
      [upvotesChange, downvotesChange, voteScoreChange, answerId]
    );

    // Get updated vote counts
    const updatedAnswerResult = await client.query(
      `SELECT upvotes, downvotes, vote_score FROM answers WHERE id = $1`,
      [answerId]
    );
    const updatedAnswer = updatedAnswerResult.rows[0];

    // ============================================
    // NOTIFICATION LOGIC FOR DOWNVOTES
    // ============================================
    
    // Note: For downvotes, you may or may not want to notify.
    // Option 1: Don't notify for downvotes (negative experience)
    // Option 2: Notify for downvotes (but content different)
    
    // OPTION 2: Notify for downvotes (uncomment if you want this)
    /*
    if (Number(answerOwnerId) !== Number(userId)) {
      
      const voteDataResult = await client.query(
        `SELECT downvotes FROM answers WHERE id = $1`,
        [answerId]
      );
      const voteData = voteDataResult.rows[0];
      const totalDownvotes = voteData.downvotes;
      
      let notificationContent = '';
      let notificationType = 'answer_downvote';
      
      if (notificationAction === 'create') {
        if (totalDownvotes === 1) {
          notificationContent = `${username} downvoted your answer`;
        } else {
          notificationContent = `${username} and ${totalDownvotes - 1} other${totalDownvotes - 1 > 1 ? 's' : ''} downvoted your answer`;
        }
        
        const existingNotificationResult = await client.query(
          `SELECT id FROM notifications WHERE aggregate_key = $1 AND type = 'answer_downvote' LIMIT 1`,
          [aggregateKey]
        );
        const existingNotification = existingNotificationResult.rows;
        
        if (existingNotification.length > 0) {
          await client.query(
            `UPDATE notifications 
             SET sender_id = $1,
                 content = $2,
                 is_viewed = 0,
                 created_at = NOW()
             WHERE aggregate_key = $3 AND type = 'answer_downvote'`,
            [userId, notificationContent, aggregateKey]
          );
        } else {
          await client.query(
            `INSERT INTO notifications (
              receiver_id, sender_id, type, content, answer_id, post_id, aggregate_key, is_viewed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
            [answerOwnerId, userId, notificationType, notificationContent, answerId, postId, aggregateKey]
          );
        }
        
      } else if (notificationAction === 'delete') {
        const existingDownvoteResult = await client.query(
          `SELECT id FROM answer_votes WHERE answer_id = $1 AND vote_type = 'downvote' LIMIT 1`,
          [answerId]
        );
        const existingDownvote = existingDownvoteResult.rows;
        
        if (!existingDownvote.length) {
          await client.query(
            `DELETE FROM notifications WHERE aggregate_key = $1 AND type = 'answer_downvote'`,
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

    await client.query("COMMIT");

    res.json({
      success: true,
      data: {
        upvotes: Number(updatedAnswer.upvotes),
        downvotes: Number(updatedAnswer.downvotes),
        vote_score: Number(updatedAnswer.vote_score),
        user_vote_type: newVoteType
      },
      message: existingVote.length === 0 ? "Answer downvoted" : 
               existingVote[0]?.vote_type === 'downvote' ? "Downvote removed" : 
               "Changed from upvote to downvote"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("downvoteAnswer error:", err);
    res.status(500).json({
      success: false,
      message: "Error downvoting answer"
    });
  } finally {
    client.release();
  }
};
const getAnswerById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answerId } = req.params;

    // Get user's vote
    const userVoteResult = await db.query(
      `SELECT vote_type FROM answer_votes WHERE answer_id = $1 AND user_id = $2`,
      [answerId, userId]
    );
    const userVote = userVoteResult.rows;

    const answerResult = await db.query(
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
      WHERE a.id = $1`,
      [answerId]
    );
    const answer = answerResult.rows;

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
  checkAlreadyAnswered,
  getAnswerById,
  getMostPopularAnswer,
};

const pool = require("../../config/db");

const createReport = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      post_id,
      report_type,
      reason
    } = req.body;

    if (!post_id || !report_type) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }

    // prevent duplicate spam reporting
    const existing = await pool.query(
      `SELECT id FROM reports 
       WHERE reporter_id = $1 AND post_id = $2`,
      [userId, post_id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "You already reported this post"
      });
    }

    // verify post exists
    const post = await pool.query(
      `SELECT id FROM posts WHERE id = $1`,
      [post_id]
    );

    if (post.rows.length === 0) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    await pool.query(
      `INSERT INTO reports
      (reporter_id, post_id, report_type, reason)
      VALUES ($1, $2, $3, $4)`,
      [
        userId,
        post_id,
        report_type,
        reason || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Report submitted"
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

const getSentimentFromScore = (score, type) => {
    if (type === 'nps') {
        if (score >= 9) return 'positive';
        if (score >= 7) return 'neutral';
        return 'negative';
    } else if (type === 'csat') {
        if (score >= 4) return 'positive';
        if (score === 3) return 'neutral';
        return 'negative';
    }
    return null;
};

// POST /api/feedback - Submit new feedback
const submitFeedback = async (req, res) => {
    try {
        const { feedback_type, score, category, message, page_url } = req.body;
        const user_id = req.user.userId || null; // If user is logged in

        // Validation
        if (!feedback_type || !['nps', 'csat', 'general'].includes(feedback_type)) {
            return res.status(400).json({ error: 'Invalid feedback type' });
        }
        
        if (feedback_type !== 'general' && (score === undefined || score === null)) {
            return res.status(400).json({ error: 'Score is required for this feedback type' });
        }

        // Calculate sentiment if score exists
        const sentiment = score !== undefined ? getSentimentFromScore(score, feedback_type) : null;

        const result = await pool.query(
            `INSERT INTO user_feedback (user_id, feedback_type, score, sentiment, category, message, page_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [user_id, feedback_type, score, sentiment, category || null, message?.trim() || null, page_url || null]
        );

        res.status(201).json({ 
            success: true, 
            id: result.rows[0].id, 
            message: 'Thank you for your feedback! Your insights help us build a better product.' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

const report = async (req, res) => {
    try {
        const userId = req.user.userId;
        const type = req.params.type;
        const id = req.params.id;
        const type_id = req.params.type_id;

        const {
            report_type,
            reason
        } = req.body;

        await pool.query(
            `INSERT INTO reports
            (
                to_id,
                reporter_id,
                type,
                type_id,
                report_type,
                reason
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [
                id,
                userId,
                type,
                type_id,
                report_type,
                reason || null
            ]
        );

        res.status(201).json({
            message: "Reported successfully"
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({
                message: "Already reported"
            });
        }

        console.error(err);

        res.status(500).json({
            message: "Server error"
        });
    }
};

const getAllReportByUserId = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT 
         r.id,
         r.reporter_id,
         r.to_id,
         r.type,
         r.report_type,
         r.reason,
         r.status,
         r.created_at,
         u.username AS reported_username,
         u.avatar_url AS reported_avatar_url
       FROM reports r
       LEFT JOIN users u ON u.id = r.to_id
       WHERE r.reporter_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('getAllReportByUserId error:', err);
    return res.status(500).json({ message: 'Failed to fetch reports' });
  }
};

module.exports = {createReport, submitFeedback, report,  getAllReportByUserId};
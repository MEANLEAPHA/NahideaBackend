
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
    const [existing] = await pool.query(
      `SELECT id FROM reports 
       WHERE reporter_id = ? AND post_id = ?`,
      [userId, post_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "You already reported this post"
      });
    }

    // verify post exists
    const [post] = await pool.query(
      `SELECT id FROM posts WHERE id = ?`,
      [post_id]
    );

    if (post.length === 0) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    await pool.query(
      `INSERT INTO reports
      (reporter_id, post_id, report_type, reason)
      VALUES (?, ?, ?, ?)`,
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

        const [result] = await pool.query(
            `INSERT INTO user_feedback (user_id, feedback_type, score, sentiment, category, message, page_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, feedback_type, score, sentiment, category || null, message?.trim() || null, page_url || null]
        );

        res.status(201).json({ 
            success: true, 
            id: result.insertId, 
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
                report_type,
                reason
            )
            VALUES (?, ?, ?, ?, ?)`,
            [
                id,
                userId,
                type,
                report_type,
                reason || null
            ]
        );

        res.status(201).json({
            message: "Reported successfully"
        });

    } catch (err) {

        if (err.code === 'ER_DUP_ENTRY') {
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


module.exports = {createReport, submitFeedback, report};
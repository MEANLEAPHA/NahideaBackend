
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

module.exports = {createReport};
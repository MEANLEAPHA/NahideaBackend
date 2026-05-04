const pool = require("../../config/db");
const { redisClient } = require("../../config/redisClient");

// Record a view
const recordViewPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const userKey = `view:${postId}:${userId}:${today}`;
    const postKey = `views:post:${postId}`;

    try {
      // Redis first
      const alreadyViewed = await redisClient.exists(userKey);
      if (!alreadyViewed) {
        // Mark user as viewed today (expires in 24h)
        await redisClient.set(userKey, 1, { EX: 60 * 60 * 24 });

        // Increment Redis total (always holds real total)
        let currentTotal = await redisClient.get(postKey);
        if (currentTotal === null) {
          // If Redis empty, fallback to DB to get baseline
          const [rows] = await pool.query(
            `SELECT views_count FROM posts WHERE id = ?`,
            [postId]
          );
          currentTotal = rows[0].views_count || 0;
        }
        await redisClient.set(postKey, parseInt(currentTotal, 10) + 1);
      }
      return res.status(200).json({ success: true });
    } catch (redisErr) {
      console.error("Redis error, fallback to DB:", redisErr);

      // Fallback to DB
      await pool.query(
        `INSERT INTO view_post (user_id, post_id, view_date, created_at)
         VALUES (?, ?, CURDATE(), NOW())
         ON DUPLICATE KEY UPDATE view_date = CURDATE()`,
        [userId, postId]
      );

      await pool.query(
        `UPDATE posts SET views_count = views_count + 1 WHERE id = ?`,
        [postId]
      );

      return res.status(200).json({ success: true, fallback: true });
    }
  } catch (error) {
    console.error("Error recording view post:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get total views
const getTotalViewsByPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const postKey = `views:post:${postId}`;

    try {
      // Redis first (always holds real total)
      const count = await redisClient.get(postKey);
      if (count !== null) {
        return res.status(200).json({ success: true, total_views: parseInt(count, 10) });
      }
    } catch (redisErr) {
      console.error("Redis error, fallback to DB:", redisErr);
    }

    // Fallback to DB
    const [rows] = await pool.query(
      `SELECT views_count AS total_views FROM posts WHERE id = ?`,
      [postId]
    );

    res.status(200).json({ success: true, total_views: rows[0].total_views, fallback: true });
  } catch (error) {
    console.error("Error fetching total views:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

module.exports = { recordViewPost, getTotalViewsByPost };

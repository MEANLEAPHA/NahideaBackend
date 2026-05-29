const pool = require("../../config/db");

const getMutuals= async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT u.id, u.username, u.avatar_url
      FROM users u
      WHERE u.id IN (
        SELECT f1.following_id
        FROM follows f1
        JOIN follows f2
          ON f1.following_id = f2.follower_id
        WHERE f1.follower_id = ?
          AND f2.following_id = ?
      )
      ORDER BY f1.created_at DESC
      LIMIT 4
      `,
      [userId, userId]
    );

    res.status(200).json({
      data: result,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};

module.exports = { getMutuals };

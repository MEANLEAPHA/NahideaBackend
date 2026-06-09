const pool = require("../../config/db");

const getMutuals= async (req, res) => {
  try {
    const userId = req.user.userId;

    const [result] = await pool.query(
  `
  SELECT u.id, u.username, u.avatar_url
  FROM users u
  JOIN follows f1 ON u.id = f1.following_id
  JOIN follows f2 ON f1.following_id = f2.follower_id
  WHERE f1.follower_id = ?
    AND f2.following_id = f1.follower_id
  ORDER BY f1.created_at DESC
  LIMIT 4
  `,
  [userId]
);



    res.status(200).json({
      data: result,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};

const getAllFriends = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [result] = await pool.query(
  `
  SELECT u.id, u.username, u.profession, u.avatar_url
  FROM users u
  JOIN follows f1 ON u.id = f1.following_id
  JOIN follows f2 ON f1.following_id = f2.follower_id
  WHERE f1.follower_id = ?
    AND f2.following_id = f1.follower_id
  ORDER BY f1.created_at DESC
  `,
  [userId]
);

    res.status(200).json({
      data: result,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};

module.exports = { getMutuals, getAllFriends };

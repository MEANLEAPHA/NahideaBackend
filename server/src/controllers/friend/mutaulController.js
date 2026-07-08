const pool = require("../../config/db"); // pg Pool instance

const getMutuals= async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
  `
  SELECT u.id, u.username, u.avatar_url
  FROM users u
  JOIN follows f1 ON u.id = f1.following_id
  JOIN follows f2 ON f1.following_id = f2.follower_id
  WHERE f1.follower_id = $1
    AND f2.following_id = f1.follower_id
  ORDER BY f1.created_at DESC
  LIMIT 4
  `,
  [userId]
);

    res.status(200).json({
      data: result.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};



const getAllFriends = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
  `
  SELECT u.id, u.username, u.profession, u.avatar_url
  FROM users u
  JOIN follows f1 ON u.id = f1.following_id
  JOIN follows f2 ON f1.following_id = f2.follower_id
  WHERE f1.follower_id = $1
    AND f2.following_id = f1.follower_id
  ORDER BY f1.created_at DESC
  `,
  [userId]
);

    res.status(200).json({
      data: result.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};


const getFriendsById = async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      `
      SELECT DISTINCT 
        u.id, 
        u.username, 
        u.avatar_url,
        CASE WHEN f1.created_at IS NOT NULL AND f2.created_at IS NOT NULL THEN 1 ELSE 0 END as is_mutual
      FROM users u
      INNER JOIN follows f1 ON u.id = f1.following_id AND f1.follower_id = $1
      INNER JOIN follows f2 ON u.id = f2.follower_id AND f2.following_id = $2
      ORDER BY f1.created_at DESC
      LIMIT 6
      `,
      [userId, userId]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("getFriendsById error:", err.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to get mutual friends" 
    });
  }
};

const getMutualFriendsById = async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(
      `
      SELECT u.id, u.username, u.profession, u.avatar_url
      FROM users u
      JOIN follows f1 ON u.id = f1.following_id
      JOIN follows f2 ON f1.following_id = f2.follower_id
      WHERE f1.follower_id = $1
        AND f2.following_id = f1.follower_id
      ORDER BY f1.created_at DESC
      `,
      [userId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error in getMutualFriendsById:', err.message);
    res.status(500).json({ error: "Failed to get mutual friends" });
  }
};

// Get followers (users who follow the given user)
const getFollowersById = async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(
      `
      SELECT u.id, u.username, u.profession, u.avatar_url, f.created_at
      FROM users u
      JOIN follows f ON u.id = f.follower_id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error in getFollowersById:', err.message);
    res.status(500).json({ error: "Failed to get followers" });
  }
};

// Get followings (users the given user follows)
const getFollowingsById = async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(
      `
      SELECT u.id, u.username, u.profession, u.avatar_url, f.created_at
      FROM users u
      JOIN follows f ON u.id = f.following_id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error in getFollowingsById:', err.message);
    res.status(500).json({ error: "Failed to get followings" });
  }
};

module.exports = {
  getMutualFriendsById,
  getFollowersById,
  getFollowingsById
};
module.exports = { getMutuals, getAllFriends, getFriendsById, getMutualFriendsById, getFollowersById, getFollowingsById };
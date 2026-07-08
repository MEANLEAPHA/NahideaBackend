const pool = require("../../config/db");

const MAX_QUERY_LENGTH = 50;

// Escape LIKE's special characters (% and _) so a search for a literal
// "100%" or "user_name" doesn't get treated as a wildcard pattern.
const escapeLikeValue = (value) => value.replace(/[%_\\]/g, (ch) => `\\${ch}`);

const searchUser = async (req, res) => {
  try {
    const rawQuery = req.query.q?.trim();

    if (!rawQuery) {
      return res.json([]);
    }

    const q = rawQuery.slice(0, MAX_QUERY_LENGTH);
    const likePattern = `%${escapeLikeValue(q)}%`;
    const currentUserId = req.user.userId;

    // Search by username OR nickname, excluding the requester themselves
    const result = await pool.query(
      `SELECT id, username, avatar_url, nickname
       FROM users
       WHERE (username LIKE $1 OR nickname LIKE $2)
       AND id != $3
       ORDER BY username ASC
       LIMIT 10`,
      [likePattern, likePattern, currentUserId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Search user error:", err.message);
    return res.status(500).json({
      message: "Fail to fetch search users!",
      success: false,
    });
  }
};

module.exports = { searchUser };
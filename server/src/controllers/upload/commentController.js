const pool = require("../../config/db");

const addComment = async (req, res) => {
  const { content, parent_id } = req.body;
  const { id } = req.params;

  await pool.query(
    "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
    [id, req.user.id, content, parent_id || null]
  );

  res.json({ message: "Comment added" });
};
 module.exports = {addComment}
const pool = require("../../config/db");

const vote = async (req, res) => {
  const { option_id, reason } = req.body;
  const { id } = req.params;

  await pool.query(
    "INSERT INTO votes (post_id, option_id, user_id, reason) VALUES (?, ?, ?, ?)",
    [id, option_id, req.user.id, reason]
  );

  res.json({ message: "Voted" });
};
 module.exports = { vote };
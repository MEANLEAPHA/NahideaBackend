const pool = require("../../../config/db");
require("dotenv").config();

const savePostHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // PostgreSQL uses ON CONFLICT instead of ON DUPLICATE KEY
    // Ensure post_history has a UNIQUE constraint on (user_id, post_id)
    await pool.query(
      `INSERT INTO post_history (user_id, post_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id, post_id) 
       DO UPDATE SET updated_at = NOW()`,
      [userId, postId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving post history:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const displayAllHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT ph.post_id, ph.created_at, ph.updated_at, p.username, p.post_type, p.data
       FROM post_history ph
       JOIN posts p ON ph.post_id = p.id
       WHERE ph.user_id = $1
       ORDER BY ph.updated_at DESC`,
      [userId]
    );

    res.status(200).json({ success: true, history: result.rows });
  } catch (error) {
    console.error("Error fetching post history:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const getHistoryPost = async (req,res) => {
    try{
        // TODO: Implement get specific history post
        res.status(200).json({ success: true, message: "Get history post endpoint" });
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get all post history" });
    };
}

const removeHistoryPost = async (req,res) => {
    try{
        // TODO: Implement remove specific history post
        res.status(200).json({ success: true, message: "Remove history post endpoint" });
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove post history" });
    };
}

const removeAllHistoryPost = async (req,res) => {
    try{
        // TODO: Implement remove all history posts
        res.status(200).json({ success: true, message: "Remove all history posts endpoint" });
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove all post history" });
    };
}

module.exports = {savePostHistory, displayAllHistory, getHistoryPost, removeHistoryPost, removeAllHistoryPost};
const pool = require("../../config/db");
require("dotenv").config();

// const savePostHistory = async (req,res) => {
//     try {
//         const userId = req.user.userId;
//         const {postId} = req.params;

//         const [rows] = await pool.query(
//             "INSERT INTO post_history (user_id, post_id) VALUES (?,?)",
//             [userId, postId]
//         );
//         res.status(200).json({success: true});
        
//     } catch (error) {
//         console.error("Error saving post history:", error);
//         throw error;
//     }
// };

const savePostHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // Ensure post_history has a UNIQUE KEY on (user_id, post_id)
    await pool.query(
      `INSERT INTO post_history (user_id, post_id, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
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

    const [rows] = await pool.query(
      `SELECT ph.post_id, ph.created_at, ph.updated_at, p.username, p.post_type, p.data
       FROM post_history ph
       JOIN posts p ON ph.post_id = p.id
       WHERE ph.user_id = ?
       ORDER BY ph.updated_at DESC`,
      [userId]
    );

    res.status(200).json({ success: true, history: rows });
  } catch (error) {
    console.error("Error fetching post history:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const getHistoryPost = async (req,res) => {
    try{

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get all post history" });
    };
}

const removeHistoryPost = async (req,res) => {
    try{

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove post history" });
    };
}

const removeAllHistoryPost = async (req,res) => {
    try{

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove all post history" });
    };
}

module.exports = {savePostHistory, getHistoryPost, removeHistoryPost, removeAllHistoryPost};
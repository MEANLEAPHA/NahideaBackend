const pool = require("../../config/db");
require("dotenv").config();

const savePostHistory = async (req,res) => {
    try {
        const userId = req.user.userId;
        const {postId} = req.params;

        const [rows] = await pool.query(
            "INSERT INTO post_history (user_id, post_id) VALUES (?,?)",
            [userId, postId]
        );
        res.status(200).json({success: true});
        
    } catch (error) {
        console.error("Error saving post history:", error);
        throw error;
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
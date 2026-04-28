const pool = require("../../config/db");

// Favorite
const getPostFavorite = async(req,res) => {
    try{
        const userId = req.user.userId;
        const [rows] = await pool.query(
            `SELECT * FROM fav_posts WHERE user_id = ?`,
            [userId]
        );
        res.status(200).json({data: rows});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Fetch favorite posts failed" });
    }
};
const addPostFavorite = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id, title, author, media_url, post_date} = req.body;

        await pool.query(
            "INSERT IGNORE INTO fav_posts (user_id, post_id, title, author, media_url, post_date) VALUES (?, ?, ?, ?, ?, ?)",
            [userId, post_id, title, author, media_url, post_date]
        );
        res.status(200).json({success: true});

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Add Posts to favorite failed" });
    }
};
const removePostFavorite = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id} = req.body;

        await pool.query(
            "DELETE FROM fav_posts WHERE user_id = ? AND post_id = ?",
            [userId, post_id]
        );
        res.status(200).json({success: true});

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Remove Posts from favorite failed" });
    }
};


// Like
const getLikePost = async(req,res) => {
    try{
        const userId = req.user.userId; 
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get liked post" });
    };
};
const addLikePost = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id} = req.body;

        await pool.query(
            "INSERT IGNORE INTO liked_posts (user_id, post_id) VALUES (?, ?)",
            [userId, post_id]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get liked post" });
    };
}
const removeLikePost = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id} = req.body;

        await pool.query(
            "DELETE FROM liked_posts WHERE user_id = ? AND post_id = ?",
            [userId, post_id]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get liked post" });
    };
}


// History
const getHistoryPost = async(req,res) => {
    try{
        const userId = req.user.userId;
        const [rows] = await pool.query(
            `SELECT * FROM history_posts WHERE user_id = ?`,
            [userId]
        );
        res.status(200).json({data: rows});

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get all post history" });
    }
}
const addHistoryPost = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id, title, author, media_url, post_date} = req.body;

        await pool.query("INSERT IGNORE INTO history_posts (user_id, post_id, title, author, media_url, post_date) VALUES (?, ?, ?, ?, ?, ?)",
              [userId, post_id, title, author, media_url, post_date]);
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to add post history" });
    }
}
const removeHistoryPost = async(req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id} = req.body;

        await pool.query(
            "DELETE FROM history_posts WHERE user_id = ? AND post_id = ?",
            [userId, post_id]
        );
        res.status(200).json({success: true});

    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove post history" });
    }
}
const removeAllHistoryPost = async(req,res) => {
    try{
        const userId = req.user.userId;
        await pool.query(
            "DELETE FROM history_posts WHERE user_id = ?",
            [userId]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove all post history" });
    }
    
}

// Report
const getReportPost = async (req,res) => {
    try{
        const userId = req.user.userId;
        const [rows] = await pool.query(
            "SELECT * FROM reports WHERE user_id = ?",
            [userId]
        )
        res.status(200).json({data: rows});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get reported post" });
    };
};
const addReportPost = async (req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id, report_type, reason} = req.body;

        await pool.query(
            "INSERT INTO reports (user_id, post_id, report_type, reason) VALUES (?, ?, ?, ?)",
            [userId, post_id, report_type, reason]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to add reported post" });
    };
};
const removeReportPost = async (req,res) => {
    try{
        const userId = req.user.userId;
        const {post_id} = req.body;

        await pool.query(
            "DELETE FROM reports WHERE user_id = ? AND post_id = ?",
            [userId, post_id]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove the reported post" });
    };
};
const removeAllReportPost = async (req,res) => {
    try{
        const userId = req.user.userId;
        await pool.query(
            "DELETE FROM reports WHERE user_id = ?",
            [userId]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove all the reported post" });
    };
};


// Feedback
const getFeedback = async (req,res) => {
    try{
        const userId = req.user.userId;
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to get reported post" });
    };
};
const addFeedback = async (req,res) => {
    try{
        const userId = req.user.userId;
        const {reason, feedback_url, feedback_type} = req.body;

        await pool.query(
            "INSERT INTO feedbacks (user_id, reason, feedback_url, feedback_type) VALUES (?, ?, ?, ?)",
            [userId, reason, feedback_url, feedback_type]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to add reported post" });
    };
};
const removeFeedback = async (req,res) => {
    try{
        const userId = req.user.userId;
        const {feedback_id} = req.body;

        await pool.query(
            "DELETE FROM feedbacks WHERE user_id = ? AND feedback_id = ?",
            [userId, feedback_id]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove the reported post" });
    };
};
const removeAllFeedback = async (req,res) => {
    try{
        const userId = req.user.userId;
        await pool.query(
            "DELETE FROM feedbacks WHERE user_id = ?",
            [userId]
        );
        res.status(200).json({success: true});
    }
    catch(err){
        console.log(err.message);
        res.status(500).json({ error: "Failed to remove all the reported post" });
    };
};


module.exports = {
    getPostFavorite, addPostFavorite, removePostFavorite,
    getLikePost, addLikePost, removeLikePost,
    getHistoryPost, addHistoryPost, removeHistoryPost, removeAllHistoryPost,
    getReportPost, addReportPost, removeReportPost, removeAllReportPost,
    getFeedback, addFeedback, removeFeedback, removeAllFeedback
}
const pool = require("../../config/db");

const getNotifications = async (req, res) => {
    try{
        const userId = req.user.userId;
        const [rows] = await pool.query(
            "SELECT * FROM notifications WHERE receiver_id = ? AND is_viewed = 0 ORDER BY created_at DESC",
            [userId]
        );
        res.status(200).json(
            {notifications: rows}
        );
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to get notifications"});
    }
}
const markNotificationRead = async (req, res) => {
    try{
        const userId = req.user.userId;
        const notificationId = req.params;
        await pool.query(
            "UPDATE notifications SET is_viewed = 1 WHERE id = ? AND is_viewed = 0 AND receiver_id = ?",
            [notificationId, userId]
        );
        res.status(200).json({message: "Notification marked as read"});
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to mark notification as read"});
    }
}

const markAllNotification = async (req, res) => {
    try{
        const userId = req.user.userId;
        await pool.query(
            "UPDATE notifications SET is_viewed = 1 WHERE user_id = ? AND is_viewed = 0 AND receiver_id = ?",
            [userId, userId]
        );
        res.status(200).json({message: "All notifications marked as read"});
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to mark all notifications as read"});
    }
}

const deleteNotification = async (req, res) => {
    try{
        const userId = req.user.userId;
        const notificationId = req.params;
        await pool.query(
            "DELETE FROM notifications WHERE id = ? AND receiver_id = ?",
            [notificationId, userId]
        );
        res.status(200).json({message: "Notification deleted"});
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to delete notification"});
    }
}

const deleteAllNotification = async (req, res) => {
    try{
        const userId = req.user.userId;
        await pool.query(
            "DELETE FROM notifications WHERE receiver_id = ? ",
            [userId]
        );
        res.status(200).json({message: "All notifications deleted"});
    }
    catch(error){
        console.error(error);
        res.status(500).json({error: "Failed to delete all notifications"});
    }
}


module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotification,
    deleteNotification,
    deleteAllNotification
}
// const pool = require("../../config/db");

// const getNotifications = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         const [rows] = await pool.query(
//             "SELECT * FROM notifications WHERE receiver_id = ? AND is_viewed = 0 ORDER BY created_at DESC",
//             [userId]
//         );
//         res.status(200).json(
//             {notifications: rows}
//         );
//     }
//     catch(error){
//         console.error(error);
//         res.status(500).json({error: "Failed to get notifications"});
//     }
// }
// const markNotificationRead = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         const notificationId = req.params;
//         await pool.query(
//             "UPDATE notifications SET is_viewed = 1 WHERE id = ? AND is_viewed = 0 AND receiver_id = ?",
//             [notificationId, userId]
//         );
//         res.status(200).json({message: "Notification marked as read"});
//     }
//     catch(error){
//         console.error(error);
//         res.status(500).json({error: "Failed to mark notification as read"});
//     }
// }

// const markAllNotification = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         await pool.query(
//             "UPDATE notifications SET is_viewed = 1 WHERE user_id = ? AND is_viewed = 0 AND receiver_id = ?",
//             [userId, userId]
//         );
//         res.status(200).json({message: "All notifications marked as read"});
//     }
//     catch(error){
//         console.error(error);
//         res.status(500).json({error: "Failed to mark all notifications as read"});
//     }
// }

// const deleteNotification = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         const notificationId = req.params;
//         await pool.query(
//             "DELETE FROM notifications WHERE id = ? AND receiver_id = ?",
//             [notificationId, userId]
//         );
//         res.status(200).json({message: "Notification deleted"});
//     }
//     catch(error){
//         console.error(error);
//         res.status(500).json({error: "Failed to delete notification"});
//     }
// }

// const deleteAllNotification = async (req, res) => {
//     try{
//         const userId = req.user.userId;
//         await pool.query(
//             "DELETE FROM notifications WHERE receiver_id = ? ",
//             [userId]
//         );
//         res.status(200).json({message: "All notifications deleted"});
//     }
//     catch(error){
//         console.error(error);
//         res.status(500).json({error: "Failed to delete all notifications"});
//     }
// }

// const createNotification = async ({
//     receiverId,
//     senderId,
//     type,
//     content
// }) => {
//     try {

//         await pool.query(
//             `
//             INSERT INTO notifications (
//                 receiver_id,
//                 sender_id,
//                 type,
//                 content
//             )
//             VALUES (?, ?, ?, ?)
//             `,
//             [
//                 receiverId,
//                 senderId,
//                 type,
//                 content
//             ]
//         );

//     } catch (err) {

//         console.log(err);

//     }
// }


// module.exports = {
//     getNotifications,
//     markNotificationRead,
//     markAllNotification,
//     deleteNotification,
//     deleteAllNotification,
//     createNotification
// }
const pool = require("../../config/db");

const getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Get notifications with unread count
        const [rows] = await pool.query(
            `SELECT n.*, 
                    u.username as sender_username,
                    u.avatar_url as sender_avatar
             FROM notifications n
             LEFT JOIN users u ON n.sender_id = u.id
             WHERE n.receiver_id = ? 
             ORDER BY n.created_at DESC`,
            [userId]
        );
        
        // Get unread count
        const [unreadCount] = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = ? AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({
            notifications: rows,
            unreadCount: unreadCount[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get notifications" });
    }
}

const markNotificationRead = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { notificationId } = req.params;
        
        await pool.query(
            "UPDATE notifications SET is_viewed = 1 WHERE id = ? AND receiver_id = ?",
            [notificationId, userId]
        );
        
        // Get updated unread count
        const [unreadCount] = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = ? AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            message: "Notification marked as read",
            unreadCount: unreadCount[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to mark notification as read" });
    }
}

const markAllNotification = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        await pool.query(
            "UPDATE notifications SET is_viewed = 1 WHERE receiver_id = ? AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            message: "All notifications marked as read",
            unreadCount: 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
}

const deleteNotification = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { notificationId } = req.params;
        
        await pool.query(
            "DELETE FROM notifications WHERE id = ? AND receiver_id = ?",
            [notificationId, userId]
        );
        
        // Get updated unread count
        const [unreadCount] = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = ? AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            message: "Notification deleted",
            unreadCount: unreadCount[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete notification" });
    }
}

const deleteAllNotification = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        await pool.query(
            "DELETE FROM notifications WHERE receiver_id = ?",
            [userId]
        );
        
        res.status(200).json({ 
            message: "All notifications deleted",
            unreadCount: 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete all notifications" });
    }
}

const createNotification = async ({
    receiverId,
    senderId,
    type,
    content,
    postId = null,
    commentId = null,
    aggregateKey = null
}) => {
    try {
        // Check if we should aggregate similar notifications
        if (aggregateKey) {
            const [existing] = await pool.query(
                `SELECT id, created_at 
                 FROM notifications 
                 WHERE receiver_id = ? 
                 AND aggregate_key = ? 
                 AND is_viewed = 0
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [receiverId, aggregateKey]
            );
            
            if (existing.length > 0) {
                // Update existing notification instead of creating new one
                await pool.query(
                    `UPDATE notifications 
                     SET created_at = CURRENT_TIMESTAMP,
                         content = ?
                     WHERE id = ?`,
                    [content, existing[0].id]
                );
                return;
            }
        }
        
        await pool.query(
            `INSERT INTO notifications (
                receiver_id,
                sender_id,
                type,
                content,
                post_id,
                comment_id,
                aggregate_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                receiverId,
                senderId,
                type,
                content,
                postId,
                commentId,
                aggregateKey
            ]
        );
    } catch (err) {
        console.error("Error creating notification:", err);
    }
}

module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotification,
    deleteNotification,
    deleteAllNotification,
    createNotification
};
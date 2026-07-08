const pool = require("../../config/db");

const getNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Get notifications with unread count
        const rows = await pool.query(
            `SELECT n.*, 
                    u.username as sender_username,
                    u.avatar_url as sender_avatar
             FROM notifications n
             LEFT JOIN users u ON n.sender_id = u.id
             WHERE n.receiver_id = $1 
             ORDER BY n.created_at DESC`,
            [userId]
        );
        
        // Get unread count
        const unreadCount = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = $1 AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({
            notifications: rows.rows,
            unreadCount: unreadCount.rows[0].count
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
            "UPDATE notifications SET is_viewed = 1 WHERE id = $1 AND receiver_id = $2",
            [notificationId, userId]
        );
        
        // Get updated unread count
        const unreadCount = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = $1 AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            message: "Notification marked as read",
            unreadCount: unreadCount.rows[0].count
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
            "UPDATE notifications SET is_viewed = 1 WHERE receiver_id = $1 AND is_viewed = 0",
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
            "DELETE FROM notifications WHERE id = $1 AND receiver_id = $2",
            [notificationId, userId]
        );
        
        // Get updated unread count
        const unreadCount = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = $1 AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            message: "Notification deleted",
            unreadCount: unreadCount.rows[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete notification" });
    }
}

const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;

        console.log("JWT userId:", userId);

        const result = await pool.query(
            "DELETE FROM notifications WHERE receiver_id = $1",
            [userId]
        );

        console.log("affectedRows:", result.rowCount);

        const rows = await pool.query(
            "SELECT * FROM notifications WHERE receiver_id = $1",
            [userId]
        );

        console.log("Remaining rows:", rows.rowCount);

        res.status(200).json({
            success: true,
            affectedRows: result.rowCount
        });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
};

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
            const existing = await pool.query(
                `SELECT id, created_at 
                 FROM notifications 
                 WHERE receiver_id = $1 
                 AND aggregate_key = $2 
                 AND is_viewed = 0
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [receiverId, aggregateKey]
            );
            
            if (existing.rows.length > 0) {
                // Update existing notification instead of creating new one
                await pool.query(
                    `UPDATE notifications 
                     SET created_at = CURRENT_TIMESTAMP,
                         content = $1
                     WHERE id = $2`,
                    [content, existing.rows[0].id]
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
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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

const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await pool.query(
            "SELECT COUNT(*) as count FROM notifications WHERE receiver_id = $1 AND is_viewed = 0",
            [userId]
        );
        
        res.status(200).json({ 
            unreadCount: result.rows[0].count 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get unread count" });
    }
}

module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotification,
    deleteNotification,
    deleteAllNotifications,
    createNotification,
    getUnreadCount
};
const db = require("../../config/db");

// const getChatUser = async (req, res) => {
//     const userId = req.user.userId;
//     try {
//         const [rows] = await db.execute(`
//             SELECT u.id, u.username, u.avatar_url,
//                    (SELECT content FROM messages m 
//                     WHERE m.conversation_id = c.id 
//                     ORDER BY m.created_at DESC LIMIT 1) AS last_message,
//                    (SELECT COUNT(*) FROM messages m 
//                     WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.status != 'seen') AS unread_count
//             FROM users u
//             JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = ?
//             JOIN follows f2 ON f2.following_id = ? AND f2.follower_id = u.id
//             LEFT JOIN conversations c ON (c.user1_id = ? AND c.user2_id = u.id) OR (c.user1_id = u.id AND c.user2_id = ?)
//             WHERE u.id != ?
//         `, [userId, userId, userId, userId, userId, userId]);
//         res.json(rows);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// }
const getChatUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.username, u.avatar_url,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message,
             (SELECT COUNT(*)
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND m.sender_id != ? 
                AND m.status != 'seen'
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
             ) AS unread_count
      FROM users u
      JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = ?
      JOIN follows f2 ON f2.following_id = ? AND f2.follower_id = u.id
      LEFT JOIN conversations c 
        ON (c.user1_id = ? AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = ?)
      WHERE u.id != ?
        AND (
          c.id IS NULL
          OR (c.user1_id = ? AND c.user1_deleted_at IS NULL)
          OR (c.user2_id = ? AND c.user2_deleted_at IS NULL)
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const getChatSpamUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.username, u.avatar_url,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message,
             (SELECT COUNT(*)
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND m.sender_id != ? 
                AND m.status != 'seen'
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
             ) AS unread_count
      FROM users u
      LEFT JOIN conversations c 
        ON (c.user1_id = ? AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = ?)
      WHERE u.id != ?
        AND (
          c.id IS NOT NULL
          AND (
            (c.user1_id = ? AND c.user1_deleted_at IS NULL)
            OR (c.user2_id = ? AND c.user2_deleted_at IS NULL)
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM follows f1
          JOIN follows f2 ON f1.following_id = f2.follower_id
          WHERE f1.follower_id = ? AND f1.following_id = u.id
            AND f2.follower_id = u.id AND f2.following_id = ?
        )
    `, [
      userId, userId, userId, userId, // subqueries
      userId, userId,                 // conversation join
      userId,                         // exclude self
      userId, userId,                 // deletion check
      userId, userId                  // mutual follow exclusion
    ]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChatArchivedUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.username, u.avatar_url,
             c.id AS conversation_id,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message
      FROM users u
      JOIN conversations c 
        ON (c.user1_id = ? AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = ?)
      WHERE (
        (c.user1_id = ? AND c.user1_deleted_at IS NOT NULL AND c.user2_deleted_at IS NULL)
        OR (c.user2_id = ? AND c.user2_deleted_at IS NOT NULL AND c.user1_deleted_at IS NULL)
      )
    `, [userId, userId, userId, userId, userId, userId]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const openConversation = async (req, res) => {
  const currentUserId = req.user.userId;
  const otherUserId = req.params;
  try {
    const [convRows] = await db.execute(
      `SELECT id, user1_id, user2_id, user1_deleted_at, user2_deleted_at 
       FROM conversations 
       WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );

    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const conv = convRows[0];
    if (conv.user1_id === currentUserId) {
      await db.execute('UPDATE conversations SET user1_deleted_at = NULL WHERE id = ?', [conv.id]);
    } else {
      await db.execute('UPDATE conversations SET user2_deleted_at = NULL WHERE id = ?', [conv.id]);
    }

    res.json({ success: true, message: 'Conversation restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// const getChatUser = async (req, res) => {
//     const userId = req.user.userId;
//     try {
//         const [rows] = await db.execute(`
//             SELECT u.id, u.username, u.avatar_url,
//                    (SELECT m.content 
//                     FROM messages m
//                     WHERE m.conversation_id = c.id 
//                       AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
//                       AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
//                     ORDER BY m.created_at DESC 
//                     LIMIT 1) AS last_message,
//                    (SELECT COUNT(*)
//                     FROM messages m
//                     WHERE m.conversation_id = c.id 
//                       AND m.sender_id != ? 
//                       AND m.status != 'seen'
//                       AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
//                    ) AS unread_count
//             FROM users u
//             JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = ?
//             JOIN follows f2 ON f2.following_id = ? AND f2.follower_id = u.id
//             LEFT JOIN conversations c ON (c.user1_id = ? AND c.user2_id = u.id) 
//                                       OR (c.user1_id = u.id AND c.user2_id = ?)
//             WHERE u.id != ?
//         `, [userId, userId, userId, userId, userId, userId, userId, userId, userId]);
        
//         res.json(rows);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };


// const getMessage = async (req, res) => {
//     const currentUserId = req.user.userId;
//     const otherUserId = req.params.userId;
//     try {
//         let [convRows] = await db.execute(
//             `SELECT id FROM conversations 
//              WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
//             [currentUserId, otherUserId, otherUserId, currentUserId]
//         );
//         let conversationId;
//         if (convRows.length === 0) {
//             const [result] = await db.execute(
//                 'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
//                 [currentUserId, otherUserId]
//             );
//             conversationId = result.insertId;
//         } else {
//             conversationId = convRows[0].id;
//         }
//         const [messages] = await db.execute(`
//             SELECT m.*, u.username, u.avatar_url 
//             FROM messages m
//             JOIN users u ON m.sender_id = u.id
//             WHERE m.conversation_id = ? 
//               AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
//               AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
//             ORDER BY m.created_at ASC
//         `, [conversationId, currentUserId, currentUserId]);
//         await db.execute(
//             `UPDATE messages SET status = 'seen' 
//              WHERE conversation_id = ? AND sender_id != ? AND status != 'seen'`,
//             [conversationId, currentUserId]
//         );
//         res.json({ conversationId, messages });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// }

const getMessage = async (req, res) => {
  const currentUserId = req.user.userId;
  const otherUserId = req.params.userId;
  const limit = parseInt(req.query.limit) || 30;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;

  try {
    let [convRows] = await db.execute(
      `SELECT id FROM conversations 
       WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );
    let conversationId;
    if (convRows.length === 0) {
      const [result] = await db.execute(
        'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
        [currentUserId, otherUserId]
      );
      conversationId = result.insertId;
    } else {
      conversationId = convRows[0].id;
    }

    // Base query with pagination (older messages before the given message ID)
   let query = `
        SELECT
            m.*,
            u.username,
            u.avatar_url,

            (
            SELECT CASE
                WHEN r.deleted_by_sender = 1
                THEN 'Original message deleted'
                WHEN r.content IS NOT NULL
                THEN r.content
                WHEN r.gif_url IS NOT NULL
                THEN '[GIF]'
                ELSE NULL
            END
            FROM messages r
            WHERE r.id = m.reply_to_id
            ) AS reply_preview,

            (
            SELECT CASE
                WHEN r.deleted_by_sender = 1
                THEN NULL
                ELSE r.gif_url
            END
            FROM messages r
            WHERE r.id = m.reply_to_id
            ) AS reply_gif_preview

        FROM messages m
        JOIN users u ON u.id = m.sender_id

        WHERE m.conversation_id = ?
        AND NOT (m.deleted_by_sender = 1 AND m.sender_id = ?)
        AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != ?)
        `;
    const params = [conversationId, currentUserId, currentUserId];

    if (beforeId) {
      query += ` AND m.id < ?`;
      params.push(beforeId);
    }

    query += ` ORDER BY m.created_at DESC LIMIT ?`;
    params.push(limit);

    const [messages] = await db.execute(query, params);
    // Reverse to chronological order for frontend
    const orderedMessages = messages.reverse();

    // Mark messages as seen (only when fetching latest, not when scrolling older)
    // For pagination, we should mark seen only on initial load – but let's keep as is
    await db.execute(
      `UPDATE messages SET status = 'seen' 
       WHERE conversation_id = ? AND sender_id != ? AND status != 'seen'`,
      [conversationId, currentUserId]
    );

    res.json({ 
      conversationId, 
      messages: orderedMessages,
      hasMore: messages.length === limit // if we got exactly limit, there might be more
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteConversation = async (req,res) => {
    const currentUserId = req.user.userId;
    const otherUserId = req.params.userId;
    try {
        const [convRows] = await db.execute(
            `SELECT id, user1_id, user2_id, user1_deleted_at, user2_deleted_at FROM conversations 
             WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
            [currentUserId, otherUserId, otherUserId, currentUserId]
        );
        if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
        const conv = convRows[0];
        if (conv.user1_id === currentUserId) {
            await db.execute('UPDATE conversations SET user1_deleted_at = NOW() WHERE id = ?', [conv.id]);
        } else {
            await db.execute('UPDATE conversations SET user2_deleted_at = NOW() WHERE id = ?', [conv.id]);
        }
        const [updated] = await db.execute('SELECT * FROM conversations WHERE id = ?', [conv.id]);
        const u = updated[0];
        if (u.user1_deleted_at && u.user2_deleted_at) {
            await db.execute('DELETE FROM messages WHERE conversation_id = ?', [conv.id]);
            // await db.execute('DELETE FROM conversations WHERE id = ?', [conv.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}


const deleteMessage = async (req, res) => {
    const userId = req.user.userId;
    const messageId = req.params.messageId;
    try {
        const [rows] = await db.execute('SELECT * FROM messages WHERE id = ?', [messageId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
        const msg = rows[0];
        if (msg.sender_id === userId) {
            await db.execute('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?', [messageId]);
        } else {
            await db.execute('UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?', [messageId]);
        }
        const [updated] = await db.execute('SELECT * FROM messages WHERE id = ?', [messageId]);
        const m = updated[0];
        if (m.deleted_by_sender && m.deleted_by_recipient) {
            await db.execute('DELETE FROM messages WHERE id = ?', [messageId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

const reportConversation = async (req, res) => {
    const  conversationId = req.params;
    const userId = req.user.userId;
     const {reason, details } = req.body;

  if (!conversationId || !reason) {
    return res.status(400).json({ error: 'conversation_id and reason are required' });
  }

  try {
    await db.query(
      'INSERT INTO conversation_reports (reporter_id, conversation_id, reason, details) VALUES (?, ?, ?)',
      [userId, conversationId, reason, details || null]
    );
    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (err) {
    console.error('Error saving report:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const reportMessage = async (req,res)=>{
     const { messageId, reason } = req.body;
    const reporterId = req.user.userId;
    try {
        await db.execute(
            'INSERT INTO message_reports (message_id, reporter_id, reason) VALUES (?, ?, ?)',
            [messageId, reporterId, reason || 'No reason']
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}


const searchGif = async (req, res) => {
  const { q } = req.query;
  try {
    let query = 'SELECT * FROM gifs';
    let params = [];
    if (q) {
      query += ' WHERE gif_label LIKE ? OR gif_name LIKE ?';
      params = [`%${q}%`, `%${q}%`];
    }
    query += ' ORDER BY id DESC LIMIT 50';   // Add limit and order
    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getChatUser, getMessage, deleteConversation, deleteMessage, reportMessage, searchGif, reportConversation, getChatSpamUser, getChatArchivedUser, openConversation };
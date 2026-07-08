const db = require("../../config/db"); // pg Pool instance

const getChatUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.avatar_url,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = $1)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $2)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message,
             (SELECT COUNT(*)
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND m.sender_id != $3 
                AND m.status != 'seen'
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $4)
             ) AS unread_count
      FROM users u
      JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = $5
      JOIN follows f2 ON f2.following_id = $6 AND f2.follower_id = u.id
      LEFT JOIN conversations c 
        ON (c.user1_id = $7 AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = $8)
      WHERE u.id != $9
        AND (
          c.id IS NULL
          OR (c.user1_id = $10 AND c.user1_deleted_at IS NULL)
          OR (c.user2_id = $11 AND c.user2_deleted_at IS NULL)
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const getChatSpamUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.avatar_url,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = $1)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $2)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message,
             (SELECT COUNT(*)
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND m.sender_id != $3 
                AND m.status != 'seen'
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $4)
             ) AS unread_count
      FROM users u
      LEFT JOIN conversations c 
        ON (c.user1_id = $5 AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = $6)
      WHERE u.id != $7
        AND (
          c.id IS NOT NULL
          AND (
            (c.user1_id = $8 AND c.user1_deleted_at IS NULL)
            OR (c.user2_id = $9 AND c.user2_deleted_at IS NULL)
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM follows f1
          JOIN follows f2 ON f1.following_id = f2.follower_id
          WHERE f1.follower_id = $10 AND f1.following_id = u.id
            AND f2.follower_id = u.id AND f2.following_id = $11
        )
    `, [
      userId, userId, userId, userId, // subqueries
      userId, userId,                 // conversation join
      userId,                         // exclude self
      userId, userId,                 // deletion check
      userId, userId                  // mutual follow exclusion
    ]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChatArchivedUser = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.avatar_url,
             c.id AS conversation_id,
             (SELECT m.content 
              FROM messages m
              WHERE m.conversation_id = c.id 
                AND NOT (m.deleted_by_sender = 1 AND m.sender_id = $1)
                AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $2)
              ORDER BY m.created_at DESC 
              LIMIT 1) AS last_message
      FROM users u
      JOIN conversations c 
        ON (c.user1_id = $3 AND c.user2_id = u.id) 
        OR (c.user1_id = u.id AND c.user2_id = $4)
      WHERE (
        (c.user1_id = $5 AND c.user1_deleted_at IS NOT NULL AND c.user2_deleted_at IS NULL)
        OR (c.user2_id = $6 AND c.user2_deleted_at IS NOT NULL AND c.user1_deleted_at IS NULL)
      )
    `, [userId, userId, userId, userId, userId, userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const openConversation = async (req, res) => {
  const currentUserId = req.user.userId;
  const otherUserId = req.params.otherUserId; 
  try { 
    const convResult = await db.query(
      `SELECT id, user1_id, user2_id, user1_deleted_at, user2_deleted_at 
       FROM conversations 
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $3 AND user2_id = $4)`,
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );
    const convRows = convResult.rows;

    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const conv = convRows[0];
    if (conv.user1_id === currentUserId) {
      await db.query('UPDATE conversations SET user1_deleted_at = NULL WHERE id = $1', [conv.id]);
    } else {
      await db.query('UPDATE conversations SET user2_deleted_at = NULL WHERE id = $1', [conv.id]);
    }

    res.json({ success: true, message: 'Conversation restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMessage = async (req, res) => {
  const currentUserId = req.user.userId;
  const otherUserId = req.params.userId;
  const limit = parseInt(req.query.limit) || 30;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;

  try {
    const convResult = await db.query(
      `SELECT id FROM conversations 
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $3 AND user2_id = $4)`,
      [currentUserId, otherUserId, otherUserId, currentUserId]
    );
    let convRows = convResult.rows;
    let conversationId;
    if (convRows.length === 0) {
      const result = await db.query(
        'INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING id',
        [currentUserId, otherUserId]
      );
      conversationId = result.rows[0].id;
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

        WHERE m.conversation_id = $1
        AND NOT (m.deleted_by_sender = 1 AND m.sender_id = $2)
        AND NOT (m.deleted_by_recipient = 1 AND m.sender_id != $3)
        `;
    const params = [conversationId, currentUserId, currentUserId];
    let paramIndex = 4;

    if (beforeId) {
      query += ` AND m.id < $${paramIndex}`;
      params.push(beforeId);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const messagesResult = await db.query(query, params);
    const messages = messagesResult.rows;
    // Reverse to chronological order for frontend
    const orderedMessages = messages.reverse();

    // Mark messages as seen (only when fetching latest, not when scrolling older)
    // For pagination, we should mark seen only on initial load – but let's keep as is
    await db.query(
      `UPDATE messages SET status = 'seen' 
       WHERE conversation_id = $1 AND sender_id != $2 AND status != 'seen'`,
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
        const convResult = await db.query(
            `SELECT id, user1_id, user2_id, user1_deleted_at, user2_deleted_at FROM conversations 
             WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $3 AND user2_id = $4)`,
            [currentUserId, otherUserId, otherUserId, currentUserId]
        );
        const convRows = convResult.rows;
        if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
        const conv = convRows[0];
        if (conv.user1_id === currentUserId) {
            await db.query('UPDATE conversations SET user1_deleted_at = NOW() WHERE id = $1', [conv.id]);
        } else {
            await db.query('UPDATE conversations SET user2_deleted_at = NOW() WHERE id = $1', [conv.id]);
        }
        const updatedResult = await db.query('SELECT * FROM conversations WHERE id = $1', [conv.id]);
        const u = updatedResult.rows[0];
        if (u.user1_deleted_at && u.user2_deleted_at) {
            await db.query('DELETE FROM messages WHERE conversation_id = $1', [conv.id]);
            // await db.query('DELETE FROM conversations WHERE id = $1', [conv.id]);
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
        const result = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        const rows = result.rows;
        if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
        const msg = rows[0];
        if (msg.sender_id === userId) {
            await db.query('UPDATE messages SET deleted_by_sender = 1 WHERE id = $1', [messageId]);
        } else {
            await db.query('UPDATE messages SET deleted_by_recipient = 1 WHERE id = $1', [messageId]);
        }
        const updatedResult = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        const m = updatedResult.rows[0];
        if (m.deleted_by_sender && m.deleted_by_recipient) {
            await db.query('DELETE FROM messages WHERE id = $1', [messageId]);
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
      'INSERT INTO conversation_reports (reporter_id, conversation_id, reason) VALUES ($1, $2, $3)',
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
        await db.query(
            'INSERT INTO message_reports (message_id, reporter_id, reason) VALUES ($1, $2, $3)',
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
      query += ' WHERE gif_label LIKE $1 OR gif_name LIKE $2';
      params = [`%${q}%`, `%${q}%`];
    }
    query += ' ORDER BY id DESC LIMIT 50';   // Add limit and order
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const searchGifFav = async (req, res) => {
  const userId = req.user.userId;
  const { q } = req.query;

  try {
    let query = `
      SELECT gifs.*
      FROM gifs
      INNER JOIN fav_gifs ON gifs.id = fav_gifs.gif_id
      WHERE fav_gifs.user_id = $1
    `;
    let params = [userId];

    if (q) {
      query += ` AND (gifs.gif_label LIKE $2 OR gifs.gif_name LIKE $3)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    query += ` ORDER BY gifs.id DESC LIMIT 50`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getUnreadChatCount = async (req, res) => {
  const currentUserId = req.user.userId;

  try {
    const result = await db.query(
      `
      SELECT COUNT(*) AS unreadCount
      FROM messages m
      JOIN conversations c
        ON c.id = m.conversation_id
      WHERE
        m.sender_id != $1
        AND m.status != 'seen'

        AND (
          (c.user1_id = $2 AND c.user1_deleted_at IS NULL)
          OR
          (c.user2_id = $3 AND c.user2_deleted_at IS NULL)
        )
      `,
      [currentUserId, currentUserId, currentUserId]
    );

    res.json({
      unreadCounts: result.rows[0].unreadcount || 0,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};

const checkConversation = async (req, res) => {
  const { otherUserId } = req.body;
  const currentUserId = req.user.userId;
  
  // Check if conversation exists
  const convResult = await db.query(
    `SELECT * FROM conversations 
     WHERE (user1_id = $1 AND user2_id = $2) 
        OR (user1_id = $3 AND user2_id = $4)`,
    [currentUserId, otherUserId, otherUserId, currentUserId]
  );
  let conversation = convResult.rows;
  
  if (conversation.length === 0) {
    // Create new conversation
    const result = await db.query(
      `INSERT INTO conversations (user1_id, user2_id, created_at) 
       VALUES ($1, $2, NOW()) RETURNING id`,
      [currentUserId, otherUserId]
    );
    conversation = [{ id: result.rows[0].id, user1_id: currentUserId, user2_id: otherUserId }];
  }
  
  res.json({ 
    id: conversation[0].id,
    user_id: otherUserId 
  });
};
module.exports = { getChatUser, getMessage, deleteConversation, deleteMessage, reportMessage,checkConversation,
   searchGif, reportConversation, getChatSpamUser, getChatArchivedUser, openConversation, getUnreadChatCount, searchGifFav };
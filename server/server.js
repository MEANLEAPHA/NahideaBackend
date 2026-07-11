// env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const pool = require("./src/config/db");

const { Server } = require("socket.io");
const {sameId} = require("./src/util/sameId");

const app = express();
app.set("trust proxy", 1);

const { connectRedis } = require("./src/config/redisClient");
// const {globalLimiter} = require("./src/middleware/rateLimiter");

// worker
require("./src/workers/rankStoreToDB");
require("./src/workers/hydrateViewsToDB");

// cor
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE","OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

app.use(express.json());

const server = http.createServer(app);

// socket io
const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  },
});

// online users
const onlineUsers = new Map();


io.on("connection", (socket) => {

  const { userId, username, avatar_url } = socket.handshake.query;

  // Ignore invalid connection
  if (!userId) {
    return;
  }

  console.log("User Connected:", userId);

  /*
  First connection for user
  */

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }

  /*
  Add socket id
  */

  onlineUsers
    .get(userId)
    .add(socket.id);

  /*
  Broadcast online users
  */

  io.emit(
    "online-users",
    Array.from(onlineUsers.keys())
  );

  socket.join(`user_${userId}`);
  console.log(`User ${userId} joined room user_${userId}`);

  // Also need to join conversation rooms when user opens chat to receive edits/deletes
  socket.on('join_conversation', ({ conversationId }) => {
    socket.join(`conv_${conversationId}`);
    console.log(`User ${userId} joined room conv_${conversationId}`);
  });

  socket.on('send_message', async (data) => {
    const { toUserId, content, gifId, gifUrl, replyToId } = data;
    const senderId = parseInt(userId);
    const receiverId = parseInt(toUserId);
    try {
      // Get or create conversation
      const convResult = await pool.query(
        `SELECT id FROM conversations 
         WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $3 AND user2_id = $4)`,
        [senderId, receiverId, receiverId, senderId]
      );
      let conversationId;
      if (convResult.rows.length === 0) {
        const result = await pool.query(
          'INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING id',
          [senderId, receiverId]
        );
        conversationId = result.rows[0].id;
      } else {
        conversationId = convResult.rows[0].id;
      }

      // Insert message
      const result = await pool.query(
        `INSERT INTO messages (conversation_id, sender_id, content, gif_id, gif_url, reply_to_id, status, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, 'sent', NOW()) RETURNING id`,
        [conversationId, senderId, content || null, gifId || null, gifUrl || null, Number(replyToId) || null]
      );
      const messageId = result.rows[0].id;

      // Fetch reply preview if replying to another message
      let replyPreview = null;
      let replyGifPreview = null;
      if (replyToId) {
        const replyResult = await pool.query(
          'SELECT content, gif_url FROM messages WHERE id = $1',
          [Number(replyToId)]
        );
        if (replyResult.rows.length) {
          replyPreview = replyResult.rows[0].content || (replyResult.rows[0].gif_url ? '[GIF]' : null);
          replyGifPreview = replyResult.rows[0].gif_url || null;
        }
      }

      // Build message object
      const newMessage = {
        id: messageId,
        conversation_id: conversationId,
        sender_id: senderId,
        content: content || null,
        gif_id: gifId || null,
        gif_url: gifUrl || null,
        status: 'sent',
        created_at: 'Just now',
        username: username || 'Guest',
        avatar_url: avatar_url || 'https://via.placeholder.com/40',
        deleted_by_sender: 0,
        deleted_by_recipient: 0,
        is_edited: 0,
        reply_to_id: Number(replyToId) || null,
        reply_preview: replyPreview,
        reply_gif_preview: replyGifPreview,
      };

      socket.join(`conv_${conversationId}`);
      io.to(`user_${receiverId}`).emit('new_message', newMessage);
      socket.emit('message_sent', newMessage);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Edit message (with reply preview updates)
  socket.on('edit_message', async ({ messageId, newContent, newGifId, newGifUrl }) => {
    try {
      const rows = await pool.query('SELECT sender_id, conversation_id FROM messages WHERE id = $1', [messageId]);
      if (rows.rows.length === 0) return socket.emit('error', 'Message not found');
      if (!sameId(rows.rows[0].sender_id, userId)) return socket.emit('error', 'Not your message');
      
      await pool.query(
        `
        UPDATE messages
        SET
        content = $1,
        gif_id = $2,
        gif_url = $3,
        is_edited = 1
        WHERE id = $4
        `,
        [
          newContent || null,
          newGifId || null,
          newGifUrl || null,
          messageId
        ]
      );
      // Fetch updated message
      const updated = await pool.query(`
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

        WHERE m.id = $1
        `, [messageId]);
      const updatedMsg = updated.rows[0];
      io.to(`conv_${rows.rows[0].conversation_id}`).emit('message_edited', updatedMsg);

      // Update reply previews for messages that reply to this one
      const replyRows = await pool.query(
        'SELECT id FROM messages WHERE reply_to_id = $1',
        [messageId]
      );
      const replyPreviewText = newContent || (newGifUrl ? '[GIF]' : null);
      const replyGifPreview = newGifUrl || null;
      for (const row of replyRows.rows) {
        io.to(`conv_${rows.rows[0].conversation_id}`).emit('reply_preview_update', {
          replyMessageId: row.id,
          newReplyPreview: replyPreviewText,
          newReplyGifPreview: replyGifPreview,
          deleted: false,
        });
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Delete message (with reply preview updates)
  socket.on('delete_message', async ({ messageId }) => {
    try {
      const rows = await pool.query('SELECT sender_id, conversation_id, deleted_by_sender, deleted_by_recipient FROM messages WHERE id = $1', [messageId]);
      if (rows.rows.length === 0) return;
      const msg = rows.rows[0];
      const isSender = sameId(msg.sender_id, userId);
      if (isSender) {
        await pool.query('UPDATE messages SET deleted_by_sender = 1 WHERE id = $1', [messageId]);
        const replyRows = await pool.query(
          'SELECT id FROM messages WHERE reply_to_id = $1',
          [messageId]
        );

        for (const row of replyRows.rows) {
          io.to(`conv_${msg.conversation_id}`).emit(
            'reply_preview_update',
            {
              replyMessageId: row.id,
              newReplyPreview: 'Original message deleted',
              newReplyGifPreview: null,
              deleted: true,
            }
          );
        }
      } else {
        await pool.query('UPDATE messages SET deleted_by_recipient = 1 WHERE id = $1', [messageId]);
      }
      // Check if both deleted
      const updated = await pool.query('SELECT deleted_by_sender, deleted_by_recipient FROM messages WHERE id = $1', [messageId]);
      const m = updated.rows[0];
      if (m.deleted_by_sender && m.deleted_by_recipient) {
        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
        io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, permanentlyDeleted: true });
        // Also notify replies that original is gone
        const replyRows = await pool.query('SELECT id FROM messages WHERE reply_to_id = $1', [messageId]);
        for (const row of replyRows.rows) {
          io.to(`conv_${msg.conversation_id}`).emit('reply_preview_update', {
            replyMessageId: row.id,
            deleted: true,
          });
        }
      } else {
        const msgRows = await pool.query(`
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

          WHERE m.id = $1
          `, [messageId]);
        io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, updatedMessage: msgRows.rows[0], permanentlyDeleted: false });
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Mark message as seen (triggered when user opens chat)
  socket.on('mark_seen', async ({ conversationId, messageIds }) => {
    try {
      await pool.query(
        `UPDATE messages SET status = 'seen' 
         WHERE conversation_id = $1 AND sender_id != $2 AND status != 'seen'`,
        [conversationId, userId]
      );
      // Notify sender that messages were seen
      const senders = await pool.query(
        `SELECT DISTINCT sender_id FROM messages WHERE conversation_id = $1 AND sender_id != $2`,
        [conversationId, userId]
      );
      for (const row of senders.rows) {
        io.to(`user_${row.sender_id}`).emit('messages_seen', { conversationId, seenBy: userId });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Mark message as delivered
  socket.on('message_delivered', async ({ messageId }) => {
    try {
      await pool.query(`UPDATE messages SET status = 'delivered' WHERE id = $1 AND status = 'sent'`, [messageId]);
      const rows = await pool.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
      if (rows.rows.length) {
        io.to(`user_${rows.rows[0].sender_id}`).emit('message_status_updated', { messageId, status: 'delivered' });
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('typing', ({ toUserId, isTyping }) => {
    socket.to(`user_${toUserId}`).emit('user_typing', { userId, isTyping });
  });

  /*Disconnect*/
  socket.on("disconnect", () => {

    const userSockets = onlineUsers.get(userId);

    if (userSockets) {

      userSockets.delete(socket.id);

      /* Remove user fully*/
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }

    }

    /*Re-broadcast updated list*/
    io.emit(
      "online-users",
      Array.from(onlineUsers.keys())
    );

  });

});
// io.on("connection", (socket) => {

//   const { userId, username, avatar_url } = socket.handshake.query;

//   // Ignore invalid connection
 
//   if (!userId) {
//     return;
//   }

//   console.log("User Connected:", userId);

//   /*
//   First connection for user
//   */

//   if (!onlineUsers.has(userId)) {
//     onlineUsers.set(userId, new Set());
//   }

//   /*
//   Add socket id
//   */

//   onlineUsers
//     .get(userId)
//     .add(socket.id);

//   /*
//   Broadcast online users
//   */

//   io.emit(
//     "online-users",
//     Array.from(onlineUsers.keys())
//   );

//   socket.join(`user_${userId}`);
//   console.log(`User ${userId} joined room user_${userId}`);

//   // Also need to join conversation rooms when user opens chat to receive edits/deletes
//   socket.on('join_conversation', ({ conversationId }) => {
//     socket.join(`conv_${conversationId}`);
//     console.log(`User ${userId} joined room conv_${conversationId}`);
//   });

// socket.on('send_message', async (data) => {
//   const { toUserId, content, gifId, gifUrl, replyToId } = data;
//   const senderId = parseInt(userId);
//   const receiverId = parseInt(toUserId);
//   try {
//     // Get or create conversation
//     let [convRows] = await db.execute(
//       `SELECT id FROM conversations 
//        WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
//       [senderId, receiverId, receiverId, senderId]
//     );
//     let conversationId;
//     if (convRows.length === 0) {
//       const [result] = await db.execute(
//         'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
//         [senderId, receiverId]
//       );
//       conversationId = result.insertId;
//     } else {
//       conversationId = convRows[0].id;
//     }

//     // Insert message
//     const [result] = await db.execute(
//       `INSERT INTO messages (conversation_id, sender_id, content, gif_id, gif_url, reply_to_id, status, created_at) 
//        VALUES (?, ?, ?, ?, ?, ?, 'sent', NOW())`,
//       [conversationId, senderId, content || null, gifId || null, gifUrl || null, replyToId || null]
//     );
//     const messageId = result.insertId;

//     // Fetch reply preview if replying to another message
//     let replyPreview = null;
//     let replyGifPreview = null;
//     if (replyToId) {
//       const [replyRows] = await db.execute(
//         'SELECT content, gif_url FROM messages WHERE id = ?',
//         [replyToId]
//       );
//       if (replyRows.length) {
//         replyPreview = replyRows[0].content || (replyRows[0].gif_url ? '[GIF]' : null);
//         replyGifPreview = replyRows[0].gif_url || null;
//       }
//     }

//     // Build message object
//     const newMessage = {
//       id: messageId,
//       conversation_id: conversationId,
//       sender_id: senderId,
//       content: content || null,
//       gif_id: gifId || null,
//       gif_url: gifUrl || null,
//       status: 'sent',
//       created_at: 'Just now',
//       username: username || 'Guest',
//       avatar_url: avatar_url || 'https://via.placeholder.com/40',
//       deleted_by_sender: 0,
//       deleted_by_recipient: 0,
//       is_edited: 0,
//       reply_to_id: replyToId || null,
//       reply_preview: replyPreview,      // <-- now set
//       reply_gif_preview: replyGifPreview, // <-- now set
//     };

//     socket.join(`conv_${conversationId}`);
//     io.to(`user_${receiverId}`).emit('new_message', newMessage);
//     socket.emit('message_sent', newMessage);
//   } catch (err) {
//     socket.emit('error', err.message);
//   }
// });

// // Edit message (with reply preview updates)
// socket.on('edit_message', async ({ messageId, newContent, newGifId, newGifUrl }) => {
//   try {
//     const [rows] = await db.execute('SELECT sender_id, conversation_id FROM messages WHERE id = ?', [messageId]);
//     if (rows.length === 0) return socket.emit('error', 'Message not found');
//     if (rows[0].sender_id !== parseInt(userId)) return socket.emit('error', 'Not your message');
    
//     await db.execute(
//       `
//       UPDATE messages
//       SET
//       content = ?,
//       gif_id = ?,
//       gif_url = ?,
//       is_edited = 1
//       WHERE id = ?
//       `,
//       [
//         newContent || null,
//         newGifId || null,
//         newGifUrl || null,
//         messageId
//       ]
//       );
//     // Fetch updated message
//    const [updated] = await db.execute(`
//     SELECT
//         m.*,
//         u.username,
//         u.avatar_url,

//         (
//           SELECT CASE
//             WHEN r.deleted_by_sender = 1
//             THEN 'Original message deleted'
//             WHEN r.content IS NOT NULL
//             THEN r.content
//             WHEN r.gif_url IS NOT NULL
//             THEN '[GIF]'
//             ELSE NULL
//           END
//           FROM messages r
//           WHERE r.id = m.reply_to_id
//         ) AS reply_preview,

//         (
//           SELECT CASE
//             WHEN r.deleted_by_sender = 1
//             THEN NULL
//             ELSE r.gif_url
//           END
//           FROM messages r
//           WHERE r.id = m.reply_to_id
//         ) AS reply_gif_preview

//     FROM messages m
//     JOIN users u ON u.id = m.sender_id

//     WHERE m.id = ?
//     `, [messageId]);
//     const updatedMsg = updated[0];
//     io.to(`conv_${rows[0].conversation_id}`).emit('message_edited', updatedMsg);

//     // Update reply previews for messages that reply to this one
//     const [replyRows] = await db.execute(
//       'SELECT id FROM messages WHERE reply_to_id = ?',
//       [messageId]
//     );
//     const replyPreviewText = newContent || (newGifUrl ? '[GIF]' : null);
//     const replyGifPreview = newGifUrl || null;
//     for (const row of replyRows) {
//       io.to(`conv_${rows[0].conversation_id}`).emit('reply_preview_update', {
//         replyMessageId: row.id,
//         newReplyPreview: replyPreviewText,
//         newReplyGifPreview: replyGifPreview,
//         deleted: false,
//       });
//     }
//   } catch (err) {
//     socket.emit('error', err.message);
//   }
// });

// // Delete message (with reply preview updates)
// socket.on('delete_message', async ({ messageId }) => {
//   try {
//     const [rows] = await db.execute('SELECT sender_id, conversation_id, deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?', [messageId]);
//     if (rows.length === 0) return;
//     const msg = rows[0];
//     const isSender = msg.sender_id === parseInt(userId);
//     if (isSender) {
//       await db.execute('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?', [messageId]);
//       const [replyRows] = await db.execute(
//         'SELECT id FROM messages WHERE reply_to_id = ?',
//         [messageId]
//       );

//       for (const row of replyRows) {
//         io.to(`conv_${msg.conversation_id}`).emit(
//           'reply_preview_update',
//           {
//             replyMessageId: row.id,
//             newReplyPreview: 'Original message deleted',
//             newReplyGifPreview: null,
//             deleted: true,
//           }
//         );
//       }
//     } else {
//       await db.execute('UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?', [messageId]);
//     }
//     // Check if both deleted
//     const [updated] = await db.execute('SELECT deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?', [messageId]);
//     const m = updated[0];
//     if (m.deleted_by_sender && m.deleted_by_recipient) {
//       await db.execute('DELETE FROM messages WHERE id = ?', [messageId]);
//       io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, permanentlyDeleted: true });
//       // Also notify replies that original is gone
//       const [replyRows] = await db.execute('SELECT id FROM messages WHERE reply_to_id = ?', [messageId]);
//       for (const row of replyRows) {
//         io.to(`conv_${msg.conversation_id}`).emit('reply_preview_update', {
//           replyMessageId: row.id,
//           deleted: true,
//         });
//       }
//     } else {
//       const [msgRows] = await db.execute(`
//         SELECT
//             m.*,
//             u.username,
//             u.avatar_url,

//             (
//               SELECT CASE
//                 WHEN r.deleted_by_sender = 1
//                 THEN 'Original message deleted'
//                 WHEN r.content IS NOT NULL
//                 THEN r.content
//                 WHEN r.gif_url IS NOT NULL
//                 THEN '[GIF]'
//                 ELSE NULL
//               END
//               FROM messages r
//               WHERE r.id = m.reply_to_id
//             ) AS reply_preview,

//             (
//               SELECT CASE
//                 WHEN r.deleted_by_sender = 1
//                 THEN NULL
//                 ELSE r.gif_url
//               END
//               FROM messages r
//               WHERE r.id = m.reply_to_id
//             ) AS reply_gif_preview

//         FROM messages m
//         JOIN users u ON u.id = m.sender_id

//         WHERE m.id = ?
//         `, [messageId]);
//       io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, updatedMessage: msgRows[0], permanentlyDeleted: false });
//     }
//   } catch (err) {
//     socket.emit('error', err.message);
//   }
// });

//   // Mark message as seen (triggered when user opens chat)
//   socket.on('mark_seen', async ({ conversationId, messageIds }) => {
//       console.log('mark_seen received for conversation', conversationId);
//     try {
//       await db.execute(
//           `UPDATE messages SET status = 'seen' 
//             WHERE conversation_id = ? AND sender_id != ? AND status != 'seen'`,
//           [conversationId, userId]
//       );
//       // Notify sender that messages were seen
//       const [senders] = await db.execute(
//           `SELECT DISTINCT sender_id FROM messages WHERE conversation_id = ? AND sender_id != ?`,
//           [conversationId, userId]
//       );
//     for (const row of senders) {
//         io.to(`user_${row.sender_id}`).emit('messages_seen', { conversationId, seenBy: userId });
//     }
//     } catch (err) {
//         console.error(err);
//     }
//   });

//   // Mark message as delivered
//   socket.on('message_delivered', async ({ messageId }) => {
//       console.log('message_delivered received for', messageId);
//     try {
//       await db.execute('UPDATE messages SET status = "delivered" WHERE id = ? AND status = "sent"', [messageId]);
//       const [rows] = await db.execute('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
//       if (rows.length) {
//         io.to(`user_${rows[0].sender_id}`).emit('message_status_updated', { messageId, status: 'delivered' });
//       }
//     } catch (err) {
//       console.error(err);
//     }
//   });

// socket.on('typing', ({ toUserId, isTyping }) => {
//   console.log(`🔵 Received typing: from ${userId} to ${toUserId}, isTyping=${isTyping}`);
//   socket.to(`user_${toUserId}`).emit('user_typing', { userId, isTyping });
//   console.log(`🟢 Emitted user_typing to user_${toUserId}`);
// });


//   /*Disconnect*/
//   socket.on("disconnect", () => {

//     const userSockets = onlineUsers.get(userId);

//     if (userSockets) {

//       userSockets.delete(socket.id);

//       /* Remove user fully*/
//       if (userSockets.size === 0) {
//         onlineUsers.delete(userId);
//       }

//     }

//     /*Re-broadcast updated list*/
//     io.emit(
//       "online-users",
//       Array.from(onlineUsers.keys())
//     );

//   });



// });


// rate limit

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

// chat 
try {
  const userChatRoute = require("./src/routes/chat/getChatUserRoute");
  app.use('/api', userChatRoute);
  console.log("✅ userChatRoute mounted successfully");
} catch (err) {
  console.error("❌ Error loading userChatRoute:", err.message);
  console.error(err.stack);
}

// user authentication
try {
  const authRoutes = require("./src/routes/authentication/authRoutes");
  app.use("/api", authRoutes);
  console.log("✅ authRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading authRoutes:", err.message);
  console.error(err.stack);
}

// mutual logic
try {
  const followRoutes = require("./src/routes/mutuals/followRoute");
  app.use("/api", followRoutes);
  console.log("✅ followRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading followRoutes:", err.message);
  console.error(err.stack);
}

// post
try {
  const postRoutes = require("./src/routes/upload/postRoutes");
  app.use("/api", postRoutes);
  console.log("✅ postRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading postRoutes:", err.message);
  console.error(err.stack);
}

// view recorder post
try {
  const viewPostRoutes = require("./src/routes/view/viewPostRoute");
  app.use("/api", viewPostRoutes);
  console.log("✅ viewPostRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading viewPostRoutes:", err.message);
  console.error(err.stack);
}

// answer question
try {
  const answerQARoutes = require("./src/routes/upload/answerQAroute");
  app.use("/api", answerQARoutes);
  console.log("✅ answerQARoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading answerQARoutes:", err.message);
  console.error(err.stack);
}

// spammy
try {
  const spammyRoutes = require("./src/routes/spammy/spammyRoute");
  app.use("/api", spammyRoutes);
  console.log("✅ spammyRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading spammyRoutes:", err.message);
  console.error(err.stack);
}

// comment and reply
try {
  const commentsRoutes = require("./src/routes/upload/commentRoute");
  app.use("/api", commentsRoutes);
  console.log("✅ commentsRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading commentsRoutes:", err.message);
  console.error(err.stack);
}

// gif
try {
  const gifRoutes = require("./src/routes/upload/gifRoute");
  app.use("/api/gifs", gifRoutes);
  console.log("✅ gifRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading gifRoutes:", err.message);
  console.error(err.stack);
}

// notification
try {
  const notificationRoutes = require("./src/routes/notification/notificationRoute");
  app.use("/api", notificationRoutes);
  console.log("✅ notificationRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading notificationRoutes:", err.message);
  console.error(err.stack);
}

// ranking
try {
  const rankRoutes = require("./src/routes/rank/rankRoute");
  app.use("/api", rankRoutes);
  console.log("✅ rankRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading rankRoutes:", err.message);
  console.error(err.stack);
}

// reports
try {
  const reportRoutes = require("./src/routes/report/reportPostRoute");
  app.use("/api", reportRoutes);
  console.log("✅ reportRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading reportRoutes:", err.message);
  console.error(err.stack);
}


// ban
try {
  const banRoutes = require("./src/routes/report/banRoute");
  app.use("/api", banRoutes);
  console.log("✅ banRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading banRoutes:", err.message);
  console.error(err.stack);
}

// history recorder post
try {
  const postHistoryRoutes = require("./src/routes/history/postHistoryRoute");
  app.use("/api", postHistoryRoutes);
  console.log("✅ postHistoryRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading postHistoryRoutes:", err.message);
  console.error(err.stack);
}

// mutual
try {
  const mutualRoutes = require("./src/routes/friend/mutualRoute");
  app.use("/api", mutualRoutes);
  console.log("✅ mutualRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading mutualRoutes:", err.message);
  console.error(err.stack);
}

// poke
try {
  const pokeRoutes = require("./src/routes/poke/pokeRoute");
  app.use("/api", pokeRoutes);
  console.log("✅ pokeRoutes mounted successfully");
} catch (err) {
  console.error("❌ Error loading pokeRoutes:", err.message);
  console.error(err.stack);
}

      // search logic // 
      
// search All
try{
  const searchAllRoute = require("./src/routes/search/searchAllRoute");
  app.use("/api", searchAllRoute);
  console.log("✅ searchAll Routes mounted successfully")
}
catch(err){
  console.error("❌ Error loading searchAllRoutes:", err.message);
  console.error(err.stack);
} 


// searchUser
try{
  const searchUserRoute = require("./src/routes/search/searchUserRoute");
  app.use("/api", searchUserRoute);
  console.log("✅ searchUser Routes mounted successfully")
}
catch(err){
  console.error("❌ Error loading searchUserRoutes:", err.message);
  console.error(err.stack);
} 



app.get("/", (req, res) => {
  res.send("API Server Running");
});












/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: err.message
  });
});

async function startServer() {

  try {
    await connectRedis();
    server.listen(process.env.PORT, () => {
      console.log(
        "Server is running on port:" +
        process.env.PORT
      );
    });

  } catch (err) {

    console.error(
      "Failed to connect to Redis:",
      err
    );

    process.exit(1);
  }
}

startServer();


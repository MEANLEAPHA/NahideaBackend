// env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const db = require("./src/config/db");

const { Server } = require("socket.io");

const app = express();
app.set("trust proxy", 1);

const { connectRedis } = require("./src/config/redisClient");
const {globalLimiter} = require("./src/middleware/rateLimiter");

// worker
require("./src/workers/rankStoreToDB");
require("./src/workers/hydrateViewsToDB");

// cor
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
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

// socket connection
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

  // Send message
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

//     // Insert message – only DB write, no SELECT
//     const [result] = await db.execute(
//       `INSERT INTO messages (conversation_id, sender_id, content, gif_id, gif_url, reply_to_id, status, created_at) 
//        VALUES (?, ?, ?, ?, ?, ?, 'sent', NOW())`,
//       [conversationId, senderId, content || null, gifId || null, gifUrl || null, replyToId || null]
//     );
//     const messageId = result.insertId;

//     // Build message object from known data (no DB fetch)
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
//       reply_preview: null, 
//       reply_gif_preview: null,
//     };

//     // Join sender to conversation room for future edits/deletes
//     socket.join(`conv_${conversationId}`);

//     // Emit to receiver (user room) and to conversation room
//     io.to(`user_${receiverId}`).emit('new_message', newMessage);
//     socket.emit('message_sent', newMessage);
//   } catch (err) {
//     socket.emit('error', err.message);
//   }
// });
socket.on('send_message', async (data) => {
  const { toUserId, content, gifId, gifUrl, replyToId } = data;
  const senderId = parseInt(userId);
  const receiverId = parseInt(toUserId);
  try {
    // Get or create conversation
    let [convRows] = await db.execute(
      `SELECT id FROM conversations 
       WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
      [senderId, receiverId, receiverId, senderId]
    );
    let conversationId;
    if (convRows.length === 0) {
      const [result] = await db.execute(
        'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
        [senderId, receiverId]
      );
      conversationId = result.insertId;
    } else {
      conversationId = convRows[0].id;
    }

    // Insert message
    const [result] = await db.execute(
      `INSERT INTO messages (conversation_id, sender_id, content, gif_id, gif_url, reply_to_id, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'sent', NOW())`,
      [conversationId, senderId, content || null, gifId || null, gifUrl || null, replyToId || null]
    );
    const messageId = result.insertId;

    // Fetch reply preview if replying to another message
    let replyPreview = null;
    let replyGifPreview = null;
    if (replyToId) {
      const [replyRows] = await db.execute(
        'SELECT content, gif_url FROM messages WHERE id = ?',
        [replyToId]
      );
      if (replyRows.length) {
        replyPreview = replyRows[0].content || (replyRows[0].gif_url ? '[GIF]' : null);
        replyGifPreview = replyRows[0].gif_url || null;
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
      reply_to_id: replyToId || null,
      reply_preview: replyPreview,      // <-- now set
      reply_gif_preview: replyGifPreview, // <-- now set
    };

    socket.join(`conv_${conversationId}`);
    io.to(`user_${receiverId}`).emit('new_message', newMessage);
    socket.emit('message_sent', newMessage);
  } catch (err) {
    socket.emit('error', err.message);
  }
});

  // Edit message
  socket.on('edit_message', async ({ messageId, newContent, newGifId, newGifUrl }) => {
    try {
      const [rows] = await db.execute('SELECT sender_id, conversation_id FROM messages WHERE id = ?', [messageId]);
      if (rows.length === 0) return socket.emit('error', 'Message not found');
      if (rows[0].sender_id !== parseInt(userId)) return socket.emit('error', 'Not your message');
      
      await db.execute(
        `UPDATE messages SET content = ?, gif_id = ?, gif_url = ?, is_edited = 1 WHERE id = ?`,
        [newContent || null, newGifId || null, newGifUrl || null, messageId]
      );
      // Fetch updated message
      const [updated] = await db.execute(`
        SELECT m.*, u.username, u.avatar_url
        FROM messages m JOIN users u ON m.sender_id = u.id 
        WHERE m.id = ?
      `, [messageId]);
      io.to(`conv_${rows[0].conversation_id}`).emit('message_edited', updated[0]);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Delete message (soft delete for sender, hard if both deleted)
  socket.on('delete_message', async ({ messageId }) => {
    try {
      const [rows] = await db.execute('SELECT sender_id, conversation_id, deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?', [messageId]);
      if (rows.length === 0) return;
      const msg = rows[0];
      const isSender = msg.sender_id === parseInt(userId);
      if (isSender) {
        await db.execute('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?', [messageId]);
      } else {
        await db.execute('UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?', [messageId]);
      }
      // Check if both deleted
      const [updated] = await db.execute('SELECT deleted_by_sender, deleted_by_recipient FROM messages WHERE id = ?', [messageId]);
      const m = updated[0];
      if (m.deleted_by_sender && m.deleted_by_recipient) {
        await db.execute('DELETE FROM messages WHERE id = ?', [messageId]);
        io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, permanentlyDeleted: true });
      } else {
        const [msgRows] = await db.execute(`SELECT m.*, u.username, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`, [messageId]);
        io.to(`conv_${msg.conversation_id}`).emit('message_deleted', { messageId, updatedMessage: msgRows[0], permanentlyDeleted: false });
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Mark message as seen (triggered when user opens chat)
  socket.on('mark_seen', async ({ conversationId, messageIds }) => {
      console.log('mark_seen received for conversation', conversationId);
    try {
      await db.execute(
          `UPDATE messages SET status = 'seen' 
            WHERE conversation_id = ? AND sender_id != ? AND status != 'seen'`,
          [conversationId, userId]
      );
      // Notify sender that messages were seen
      const [senders] = await db.execute(
          `SELECT DISTINCT sender_id FROM messages WHERE conversation_id = ? AND sender_id != ?`,
          [conversationId, userId]
      );
    for (const row of senders) {
        io.to(`user_${row.sender_id}`).emit('messages_seen', { conversationId, seenBy: userId });
    }
    } catch (err) {
        console.error(err);
    }
  });

  // Mark message as delivered
  socket.on('message_delivered', async ({ messageId }) => {
      console.log('message_delivered received for', messageId);
    try {
      await db.execute('UPDATE messages SET status = "delivered" WHERE id = ? AND status = "sent"', [messageId]);
      const [rows] = await db.execute('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
      if (rows.length) {
        io.to(`user_${rows[0].sender_id}`).emit('message_status_updated', { messageId, status: 'delivered' });
      }
    } catch (err) {
      console.error(err);
    }
  });

socket.on('typing', ({ toUserId, isTyping }) => {
  console.log(`🔵 Received typing: from ${userId} to ${toUserId}, isTyping=${isTyping}`);
  socket.to(`user_${toUserId}`).emit('user_typing', { userId, isTyping });
  console.log(`🟢 Emitted user_typing to user_${toUserId}`);
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


// rate limit

app.use(globalLimiter); // global rate limit



/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

// chat 
const userChatRoute = require("./src/routes/chat/getChatUserRoute");
app.use('/api', userChatRoute);

// user authentication
const authRoutes = require("./src/routes/authentication/authRoutes");
app.use("/api", authRoutes);

// mutual logic
const followRoutes = require("./src/routes/mutuals/followRoute");
app.use("/api", followRoutes);

// post
const postRoutes = require("./src/routes/upload/postRoutes");
app.use("/api", postRoutes);

// view recorder post
const viewPostRoutes = require("./src/routes/view/viewPostRoute");
app.use("/api", viewPostRoutes);

// answer question
const answerQARoutes = require("./src/routes/upload/answerQAroute");
app.use("/api", answerQARoutes);

// comment and reply
const commentsRoutes = require("./src/routes/upload/commentRoute");
app.use("/api", commentsRoutes);

// gif
const gifRoutes = require("./src/routes/upload/gifRoute");
app.use("/api/gifs", gifRoutes);

// notification
const notificationRoutes = require("./src/routes/notification/notificationRoute");
app.use("/api", notificationRoutes);

// ranking
const rankRoutes = require("./src/routes/rank/rankRoute");
app.use("/api", rankRoutes);

// reports
const reportRoutes = require("./src/routes/report/reportPostRoute");
app.use("/api", reportRoutes);

// history recorder post
const postHistoryRoutes = require("./src/routes/history/postHistoryRoute");
app.use("/api", postHistoryRoutes);

// mutual
const mutualRoutes = require("./src/routes/friend/mutualRoute");
app.use("/api", mutualRoutes);


// const postArchiveRoutes = require("./src/routes/upload/postArchiveRoute");
// app.use("/api", postArchiveRoutes);


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


// add some comment

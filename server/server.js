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

  socket.on('send_message', async (data) => {
    const { toUserId, content, gifId, gifUrl } = data;
    try {
        // Get or create conversation
        let [convRows] = await db.execute(
            `SELECT id FROM conversations 
              WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
            [userId, toUserId, toUserId, userId]
        );
        let conversationId;
        if (convRows.length === 0) {
            const [result] = await db.execute(
                'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
                [userId, toUserId]
            );
            conversationId = result.insertId;
        } else {
            conversationId = convRows[0].id;
        }
        // Insert message – get insertId and use server timestamp
        const [result] = await db.execute(
            `INSERT INTO messages (conversation_id, sender_id, content, gif_id, gif_url, status, created_at) 
              VALUES (?, ?, ?, ?, ?, 'sent', NOW())`,
            [conversationId, userId, content || null, gifId || null, gifUrl || null]
        );
        const messageId = result.insertId;
        // Build message object WITHOUT extra SELECT
        const newMessage = {
            id: messageId,
            conversation_id: conversationId,
            sender_id: userId,
            content: content || null,
            gif_id: gifId || null,
            gif_url: gifUrl || null,
            status: 'sent',
            created_at: 'Just now', // new Date().toISOString().slice(0, 19).replace('T', ' ')
            username: username || 'Guest',
            avatar: avatar_url || 'https://via.placeholder.com/40',
            deleted_by_sender: 0,
            deleted_by_recipient: 0
        };
        // Emit to receiver and sender
        io.to(`user_${toUserId}`).emit('new_message', newMessage);
        socket.emit('message_sent', newMessage);
    } catch (err) {
        socket.emit('error', err.message);
    }
  });

  // Mark message as seen (triggered when user opens chat)
  socket.on('mark_seen', async ({ conversationId, messageIds }) => {
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

  // realtime typing
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

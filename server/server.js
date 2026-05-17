// // env
// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");
// const http = require("http");

// const { Server } = require("socket.io");

// const app = express();

// const { connectRedis } = require("./src/config/redisClient");
// const {globalLimiter} = require("./src/middleware/rateLimiter");

// // worker
// require("./src/workers/rankStoreToDB");
// // require("./src/workers/hydrateViewsToDB");

// // cor
// app.use(cors({
//   origin: process.env.ORIGIN_URL,
//   methods: ["GET","POST","PUT","DELETE","OPTIONS"],
//   allowedHeaders: ["Content-Type","Authorization"],
// }));

// app.use(express.json());

// const server = http.createServer(app);

// // socket io
// const io = new Server(server, {
//   cors: {
//     origin: process.env.ORIGIN_URL,
//     methods: ["GET", "POST"],
//   },
// });

// // online users
// const onlineUsers = new Map();

// // socket connection
// io.on("connection", (socket) => {

//   const userId = socket.handshake.query.userId;

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

//   /*
//   Disconnect
//   */

//   socket.on("disconnect", () => {

//     console.log("User Disconnected:", userId);

//     const userSockets =
//       onlineUsers.get(userId);

//     if (userSockets) {

//       userSockets.delete(socket.id);

//       /*
//       Remove user fully
//       */

//       if (userSockets.size === 0) {
//         onlineUsers.delete(userId);
//       }
//     }

//     /*
//     Re-broadcast updated list
//     */

//     io.emit(
//       "online-users",
//       Array.from(onlineUsers.keys())
//     );
//   });
// });


// // rate limit

// app.use(globalLimiter); // global rate limit



// /*
// |--------------------------------------------------------------------------
// | ROUTES
// |--------------------------------------------------------------------------
// */

// // user authentication
// const authRoutes = require("./src/routes/authentication/authRoutes");
// app.use("/api", authRoutes);

// // mutual logic
// const followRoutes = require("./src/routes/mutuals/followRoute");
// app.use("/api", followRoutes);

// // post
// const postRoutes = require("./src/routes/upload/postRoutes");
// app.use("/api", postRoutes);

// // answer question
// const answerQARoutes = require("./src/routes/upload/answerQAroute");
// app.use("/api", answerQARoutes);

// // comment and reply
// const commentsRoutes = require("./src/routes/upload/commentRoute");
// app.use("/api", commentsRoutes);

// // gif
// const gifRoutes = require("./src/routes/upload/gifRoute");
// app.use("/api/gifs", gifRoutes);

// // notification
// const notificationRoutes = require("./src/routes/notification/notificationRoute");
// app.use("/api", notificationRoutes);


// // ranking
// const rankRoutes = require("./src/routes/rank/rankRoute");
// app.use("/api", rankRoutes);


// // reports
// const reportRoutes = require("./src/routes/report/reportPostRoute");
// app.use("/api", reportRoutes);

// // history recorder post
// // const postHistoryRoutes = require("./src/routes/history/postHistoryRoute");
// // app.use("/api", postHistoryRoutes);

// // view recorder post
// // const viewPostRoutes = require("./src/routes/view/viewPostRoute");
// // app.use("/api", viewPostRoutes);

// // const postArchiveRoutes = require("./src/routes/upload/postArchiveRoute");
// // app.use("/api", postArchiveRoutes);





// app.get("/", (req, res) => {
//   res.send("API Server Running");
// });

// /*
// |--------------------------------------------------------------------------
// | START SERVER
// |--------------------------------------------------------------------------
// */
// app.use((err, req, res, next) => {
//   console.error(err);
//   res.status(500).json({
//     message: err.message
//   });
// });

// async function startServer() {

//   try {

//     await connectRedis();

//     server.listen(process.env.PORT, () => {

//       console.log(
//         "Server is running on port:" +
//         process.env.PORT
//       );

//     });

//   } catch (err) {

//     console.error(
//       "Failed to connect to Redis:",
//       err
//     );

//     process.exit(1);
//   }
// }

// startServer();


// // add some comment
// env
require("dotenv").config();

console.log("1. ENV LOADED");

const express = require("express");
console.log("2. EXPRESS LOADED");

const cors = require("cors");
console.log("3. CORS LOADED");

const http = require("http");
console.log("4. HTTP LOADED");

const { Server } = require("socket.io");
console.log("5. SOCKET IO LOADED");

const app = express();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:");
  console.error(err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION:");
  console.error(reason);
});

const { connectRedis } = require("./src/config/redisClient");
console.log("6. REDIS CLIENT LOADED");

const { globalLimiter } = require("./src/middleware/rateLimiter");
console.log("7. RATE LIMITER LOADED");


// worker
console.log("8. LOADING WORKERS");

// require("./src/workers/hydrateViewsToDB");

require("./src/workers/rankStoreToDB");

console.log("9. WORKERS LOADED");


// cors
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

console.log("10. CORS REGISTERED");

app.use(express.json());

const server = http.createServer(app);


// socket io
const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN_URL,
    methods: ["GET", "POST"],
  },
});

console.log("11. SOCKET INITIALIZED");


// online users
const onlineUsers = new Map();


// socket connection
io.on("connection", (socket) => {

  try {

    const userId = socket.handshake.query.userId;

    if (!userId) {
      console.log("Socket rejected: missing userId");
      socket.disconnect();
      return;
    }

    console.log("User Connected:", userId);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers
      .get(userId)
      .add(socket.id);

    io.emit(
      "online-users",
      Array.from(onlineUsers.keys())
    );

    socket.on("disconnect", () => {

      console.log("User Disconnected:", userId);

      const userSockets =
        onlineUsers.get(userId);

      if (userSockets) {

        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }
      }

      io.emit(
        "online-users",
        Array.from(onlineUsers.keys())
      );
    });

  } catch (err) {

    console.error("SOCKET ERROR:");
    console.error(err);
  }
});

console.log("12. SOCKET EVENTS REGISTERED");


// rate limit
app.use(globalLimiter);

console.log("13. RATE LIMITER REGISTERED");


/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

console.log("14. LOADING ROUTES");

// user authentication
const authRoutes = require("./src/routes/authentication/authRoutes");
app.use("/api", authRoutes);

// mutual logic
const followRoutes = require("./src/routes/mutuals/followRoute");
app.use("/api", followRoutes);

// post
const postRoutes = require("./src/routes/upload/postRoutes");
app.use("/api", postRoutes);

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

console.log("15. ROUTES REGISTERED");


// history recorder post
// const postHistoryRoutes = require("./src/routes/history/postHistoryRoute");
// app.use("/api", postHistoryRoutes);

// view recorder post
// const viewPostRoutes = require("./src/routes/view/viewPostRoute");
// app.use("/api", viewPostRoutes);

// const postArchiveRoutes = require("./src/routes/upload/postArchiveRoute");
// app.use("/api", postArchiveRoutes);


app.get("/", (req, res) => {
  res.send("API Server Running");
});


app.use((err, req, res, next) => {

  console.error("EXPRESS ERROR:");
  console.error(err);

  res.status(500).json({
    message: err.message || "Server Error"
  });
});


async function startServer() {

  try {

    console.log("16. CONNECTING REDIS");

    await connectRedis();

    console.log("17. REDIS CONNECTED");

    server.listen(process.env.PORT, () => {

      console.log(
        `18. SERVER RUNNING ON PORT ${process.env.PORT}`
      );

    });

  } catch (err) {

    console.error(
      "START SERVER FAILED:"
    );

    console.error(err);

    process.exit(1);
  }
}

startServer();
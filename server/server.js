// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");

// const app = express();

// const { connectRedis } = require("./src/config/redisClient");

// // require("./src/workers/hydrateViewsToDB");

// // app.use(cor());
// app.use(cors({
//   origin: process.env.ORIGIN_URL,
//   methods: ["GET","POST","PUT","DELETE","OPTIONS"],
//   allowedHeaders: ["Content-Type","Authorization"],
// }));
// app.use(express.json());
// // app.use(cors({
// //   origin: process.env.ORIGIN_URL,
// //   methods: ["GET","POST","PUT","DELETE"],
// //   allowedHeaders: ["Content-Type","Authorization"]
// // })); 
// // app.use(express.json());


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


// // Redis cache

// async function startServer() {
//   try {
//     await connectRedis();   // safe inside async
//     app.listen(process.env.PORT, () => {
//       console.log("Server is running on port:" + process.env.PORT);
//     });
//   } catch (err) {
//     console.error("Failed to connect to Redis:", err);
//     process.exit(1);
//   }
// }

// startServer();

// // app.listen(process.env.PORT, ()=>{
// //     console.log("Sever is running on port:" + process.env.PORT);
// // });

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");

const { Server } = require("socket.io");

const app = express();

const { connectRedis } = require("./src/config/redisClient");

// require("./src/workers/hydrateViewsToDB");

require("./src/workers/rankStoreToDB");

// app.use(cor());
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

app.use(express.json());

// app.use(cors({
//   origin: process.env.ORIGIN_URL,
//   methods: ["GET","POST","PUT","DELETE"],
//   allowedHeaders: ["Content-Type","Authorization"]
// }));

// app.use(express.json());

/*
|--------------------------------------------------------------------------
| CREATE HTTP SERVER
|--------------------------------------------------------------------------
*/

const server = http.createServer(app);

/*
|--------------------------------------------------------------------------
| SOCKET IO
|--------------------------------------------------------------------------
*/

const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN_URL,
    methods: ["GET", "POST"],
  },
});

/*
|--------------------------------------------------------------------------
| ONLINE USERS
|--------------------------------------------------------------------------
|
| Map Structure:
|
| Map<
|   userId,
|   Set(socketIds)
| >
|
*/

const onlineUsers = new Map();

/*
|--------------------------------------------------------------------------
| SOCKET CONNECTION
|--------------------------------------------------------------------------
*/

io.on("connection", (socket) => {

  const userId = socket.handshake.query.userId;

  /*
  Ignore invalid connection
  */

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

  /*
  Disconnect
  */

  socket.on("disconnect", () => {

    console.log("User Disconnected:", userId);

    const userSockets =
      onlineUsers.get(userId);

    if (userSockets) {

      userSockets.delete(socket.id);

      /*
      Remove user fully
      */

      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }

    /*
    Re-broadcast updated list
    */

    io.emit(
      "online-users",
      Array.from(onlineUsers.keys())
    );
  });
});

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

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

// app.listen(process.env.PORT, ()=>{
//     console.log("Sever is running on port:" + process.env.PORT);
// });
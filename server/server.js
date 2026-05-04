require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

const { connectRedis } = require("./src/config/redisClient");

// require("./src/workers/hydrateViewsToDB");

// app.use(cor());
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"]
})); 
app.use(express.json());


// user authentication
const authRoutes = require("./src/routes/authentication/authRoutes");
app.use("/api", authRoutes);

// post
const postRoutes = require("./src/routes/upload/postRoutes");
app.use("/api", postRoutes);

// answer question 
// const answerQARoutes = require("./src/routes/upload/answerQAroute");
// app.use("/api", answerQARoutes);

// gif
const gifRoutes = require("./src/routes/upload/gifRoute");
app.use("/api/gifs", gifRoutes); 


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


// Redis cache

async function startServer() {
  try {
    await connectRedis();   // safe inside async
    app.listen(process.env.PORT, () => {
      console.log("Server is running on port:" + process.env.PORT);
    });
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
    process.exit(1);
  }
}

startServer();

// app.listen(process.env.PORT, ()=>{
//     console.log("Sever is running on port:" + process.env.PORT);
// });
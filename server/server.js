require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

const { connectRedis } = require("./src/config/redisClient");


// app.use(cor());
app.use(cors({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"]
})); 
app.use(express.json());


const authRoutes = require("./src/routes/authentication/authRoutes");
const postRoutes = require("./src/routes/upload/postRoutes");


app.use("/api", authRoutes);
app.use("/api", postRoutes);

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
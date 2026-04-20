require("dotenv").config();
const express = require("express");
const cor = require("cors");

const app = express();

const { connectRedis } = require("./src/config/redisClient");


// app.use(cor());
app.use(cor({
  origin: process.env.ORIGIN_URL,
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"]
})); 
app.use(express.json());
await connectRedis();

const authRoutes = require("./src/routes/authentication/authRoutes");
const postRoutes = require("./src/routes/upload/postRoutes");


app.use("/api", authRoutes);
app.use("/api", postRoutes);

app.get("/", (req, res) => {
  res.send("API Server Running");
});


// Redis cache



app.listen(process.env.PORT, ()=>{
    console.log("Sever is running on port:" + process.env.PORT);
});
require("dotenv").config();
const express = require("express");
const cor = require("cors");

const app = express();
// app.use(cor());
app.use(cor({
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


app.listen(process.env.PORT, ()=>{
    console.log("Sever is running on port:" + process.env.PORT);
});
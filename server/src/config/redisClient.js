require('dotenv').config();
const {createClient} = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL, // Upstash or Redis cloud URL
});

redisClient.on("error", (err) => console.error("Redis Error:", err));

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("Redis connected");
  }
};

module.exports = { connectRedis, redisClient };
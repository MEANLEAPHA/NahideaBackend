require('dotenv').config();
const {createClient} = require("redis");

const cachePost = createClient({
  url: process.env.REDIS_NAHIDEA_CACHE, 
});

cachePost.on("error", (err) => console.error("Redis Error:", err));

const ranking = createClient({
  url: process.env.REDIS_NAHIDEA_RANKING,
});
ranking.on("error", (err) => console.error("Nahidea Redis Rankinf Error:", err))

const connectRedis = async () => {

  if (!cachePost.isOpen) {
    await cachePost.connect();
    console.log("Redis Cache-Post connected");
  }

  if (!ranking.isOpen) {
    await ranking.connect();
    console.log("Redis ranking connected");
  }
};


module.exports = { connectRedis, cachePost, ranking };
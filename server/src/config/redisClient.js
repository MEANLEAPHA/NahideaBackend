require('dotenv').config();
const {createClient} = require("redis");

const cachePost = createClient({
  url: process.env.REDIS_NAHIDEA_CACHE, 
});

cachePost.on("error", (err) => console.error("Redis Error:", err));

const Ranking = createClient({
  url: process.env.REDIS_NAHIDEA_RANKING
});
Ranking.on("error", (err) => console.error("Nahidea Redis Rankinf Error:", err))



const connectRedis = async () => {

  if (!cachePost.isOpen) {
    await cachePost.connect();
    console.log("Redis Cache-Post connected");
  }

  if (!Ranking.isOpen) {
    await Ranking.connect();
    console.log("Redis Ranking connected");
  }

};

module.exports = { connectRedis, cachePost, Ranking };
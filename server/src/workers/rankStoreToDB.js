const cron = require("node-cron");
const { ranking } = require("../config/redisClient");
const pool = require("../config/db");

// Run at midnight on the 1st of each month
cron.schedule("0 0 1 * *", async () => {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthKey = `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    const redisKey = `hof:month:${monthKey}`;

    // Get top 5 users
    const topUsers = await ranking.zRevRangeWithScores(redisKey, 0, 4);

    if (topUsers.length > 0) {
      for (let i = 0; i < topUsers.length; i++) {
        const userId = parseInt(topUsers[i].value, 10);
        const score = topUsers[i].score;
        const rank = i + 1;

        await pool.query(
          `INSERT INTO hall_of_fame_history (month, user_id, score, rank)
           VALUES (?, ?, ?, ?)`,
          [monthKey, userId, score, rank]
        );
      }
      console.log(`Hall of Fame for ${monthKey} saved to DB.`);
    }

    // Clear Redis key
    await ranking.del(redisKey);
    console.log(`Redis key ${redisKey} cleared.`);
  } catch (err) {
    console.error("Hall of Fame worker failed:", err.message);
  }
});

// Run at midnight on each new day
cron.schedule("0 0 * * *", async () => {
  try {
    const newDate = new Date();
    const yesterday = new Date(newDate.getTime() - 24 * 60 * 60 * 1000);

    // Format YYYY-MM-DD
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getDate()).padStart(2, "0");
    const yesterdayKey = `${yyyy}-${mm}-${dd}`;

    const redisKey = `trendingPost:day:${yesterdayKey}`;

    // Get top 10 posts
    const topPosts = await ranking.zRevRangeWithScores(redisKey, 0, 9);

    if (topPosts.length > 0) {
      for (let i = 0; i < topPosts.length; i++) {
        const postId = parseInt(topPosts[i].value, 10);
        const score = topPosts[i].score;
        const rank = i + 1;

        await pool.query(
          `INSERT INTO trending_post_history (date, post_id, score, rank)
           VALUES (?, ?, ?, ?)`,
          [yesterdayKey, postId, score, rank]
        );
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log(`Trending Post for ${yesterdayKey} saved to DB.`);
    }

    // Clear Redis key
    await ranking.del(redisKey);
    console.log(`Redis key ${redisKey} cleared.`);
  } catch (err) {
    console.error("Trending Post Worker failed:", err.message);
  }
});

// cron.schedule("0 0 * * *", async () => {
//   try{
//     const newDate = new Date();
//     const yesterday = new Date(newDate.getTime() - 24 * 60 * 60 * 1000);
//     const yesterdayKey = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
//     const redisKey = `trendingPost:day:${yesterdayKey}`;

//     // Get top 10 posts
//     const topPosts = await ranking.zRevRangeWithScores(redisKey, 0, 9);

//     if (topPosts.length > 0) {
    
//       for (let i = 0; i < topPosts.length; i++) {
//         const postId = parseInt(topPosts[i].value, 10);
//         const score = topPosts[i].score;
//         const rank = i + 1;

//         await pool.query(
//           `INSERT INTO trending_post_history (date, post_id, score, rank)
//            VALUES (?, ?, ?, ?)`,
//           [yesterdayKey, postId, score, rank]
//         );
//       }
//       await new Promise(resolve => setTimeout(resolve, 200));
//       console.log(`Trending Post for ${yesterdayKey} saved to DB.`);
 
//     }

//     // Clear Redis key
//     await ranking.del(redisKey);
//     console.log(`Redis key ${redisKey} cleared.`);

//   }
//   catch(err){
//     console.error("Trending Post Worker failed:", err.message)
//   }
// })
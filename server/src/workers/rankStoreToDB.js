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

const cron = require("node-cron");
const pool = require("../config/db");
const { redisClient } = require("../config/redisClient");

const hydrateViewsToDB = async () => {
  try {
    // Scan Redis per-user/day keys
    const keys = await redisClient.keys("view:*");

    for (const key of keys) {
      // key format: view:{postId}:{userId}:{date}
      const [, postId, userId, viewDate] = key.split(":");

      // Insert row if not exists
      await pool.query(
        `INSERT INTO view_post (user_id, post_id, view_date, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE view_date = VALUES(view_date)`,
        [userId, postId, viewDate]
      );

      // Delete per-user/day key after flush
      await redisClient.del(key);

      // Pause between inserts to avoid DB overload
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Now sync aggregate counters
    const postKeys = await redisClient.keys("views:post:*");
    for (const postKey of postKeys) {
      const postId = postKey.split(":")[2];
      const redisCount = await redisClient.get(postKey);

      if (redisCount) {
        // Update DB aggregate
        await pool.query(
          `UPDATE posts SET views_count = ? WHERE id = ?`,
          [parseInt(redisCount, 10), postId]
        );

        // Reset Redis counter to DB total (so Redis always shows real total)
        const [rows] = await pool.query(
          `SELECT views_count FROM posts WHERE id = ?`,
          [postId]
        );
        const dbTotal = rows[0].views_count;
        await redisClient.set(postKey, dbTotal);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (err) {
    console.error("Error hydrating views:", err);
  }
};

// Schedule every 15 minutes
cron.schedule("*/15 * * * *", async () => {
  console.log("Hydrating Redis views into DB...");
  await hydrateViewsToDB();
});

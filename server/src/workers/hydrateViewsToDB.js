
// const cron = require("node-cron");
// const pool = require("../config/db");
// const { cachePost } = require("../config/redisClient");

// const hydrateViewsToDB = async () => {
//       const keys = await cachePost.keys("view:*");

//       if(!keys.length || keys.length === 0 || !keys) return;
//    try {
//     for (const key of keys) {
//       const [, postId, userId, viewDate] = key.split(":");

//       await pool.query(
//         `INSERT INTO view_post (user_id, post_id, view_date, created_at)
//          VALUES (?, ?, ?, NOW())
//          ON DUPLICATE KEY UPDATE view_date = VALUES(view_date)`,
//         [userId, postId, viewDate]
//       );

//       // Pause between inserts to avoid DB overload
//       await new Promise(resolve => setTimeout(resolve, 200));
//     }

//     // 🔄 Sync aggregate counters
//     const postKeys = await cachePost.keys("views:post:*");

//     for (const postKey of postKeys) {
//       const postId = postKey.split(":")[2];
//       const redisCount = await cachePost.get(postKey);

//       if (redisCount) {
//         // update new value to DB
//         await pool.query(
//           `UPDATE posts SET views_count = ? WHERE id = ?`,
//           [parseInt(redisCount, 10), postId]
//         );

//         // reset Redis counter to DB value with TTL 3 minutes
//         await cachePost.set(postKey, parseInt(redisCount, 10), { EX: 60 * 3 });
//       }

//       // Pause between updates to avoid DB overload
//       await new Promise(resolve => setTimeout(resolve, 200));
//     }
//   } catch (err) {
//     console.error("Error hydrating views:", err);
//   }
// };

// // Schedule every 5 minutes
// cron.schedule("*/5 * * * *", async () => {
//   console.log("Hydrating Redis views into DB...");
//   await hydrateViewsToDB();
// });

const cron = require("node-cron");
const pool = require("../config/db");
const { cachePost } = require("../config/redisClient");

let isRunning = false;

// Helper: SCAN instead of KEYS so we don't block Redis
const scanKeys = async (pattern) => {
  let cursor = "0";
  const found = [];
  do {
    const reply = await cachePost.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = reply.cursor;
    found.push(...reply.keys);
  } while (cursor !== "0");
  return found;
};

const hydrateViewsToDB = async () => {
  try {
    // ---- 1. Sync individual view records ----
    const keys = await scanKeys("view:*");

    for (const key of keys) {
      try {
        const [, postId, userId, viewDate] = key.split(":");

        await pool.query(
          `INSERT INTO view_post (user_id, post_id, view_date, created_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE view_date = VALUES(view_date)`,
          [userId, postId, viewDate]
        );

        // Only remove from Redis once safely persisted
        await cachePost.del(key);
      } catch (err) {
        console.error(`Failed to hydrate view key ${key}, will retry next run:`, err);
        // don't delete — leave it for the next cycle
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // ---- 2. Sync aggregate counters ----
    const postKeys = await scanKeys("views:post:*");

    for (const postKey of postKeys) {
      try {
        const postId = postKey.split(":")[2];
        const redisCount = await cachePost.get(postKey);
        const count = parseInt(redisCount, 10);

        if (!Number.isNaN(count)) {
          await pool.query(`UPDATE posts SET views_count = ? WHERE id = ?`, [
            count,
            postId,
          ]);

          // Just refresh the TTL — don't overwrite the value.
          // INCR keeps this key's value accurate; resetting it here
          // would clobber increments that land between our GET and this call.
          await cachePost.expire(postKey, 60 * 10); // 10 min, > cron interval
        }
      } catch (err) {
        console.error(`Failed to sync counter ${postKey}, will retry next run:`, err);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (err) {
    console.error("Error hydrating views:", err);
  }
};

// Schedule every 5 minutes, with overlap protection
cron.schedule("*/5 * * * *", async () => {
  if (isRunning) {
    console.log("Previous hydration run still in progress, skipping this tick.");
    return;
  }
  isRunning = true;
  console.log("Hydrating Redis views into DB...");
  try {
    await hydrateViewsToDB();
  } finally {
    isRunning = false;
  }
});

module.exports = { hydrateViewsToDB };

const pool = require("../../config/db");
const { cachePost, ranking } = require("../../config/redisClient");
// // Get total views
const getTotalViewsByPost = async (req, res) => {

  try {
    const { postId } = req.params;
    const postKey = `views:post:${postId}`;

    try {
      // Redis first (always holds real total)
      const count = await cachePost.get(postKey);
      if (count !== null) {
        return res.status(200).json({ success: true, total_views: parseInt(count, 10) });
      }
    } catch (redisErr) {
      console.error("Redis error, fallback to DB:", redisErr);
    }

    // Fallback to DB
    const [rows] = await pool.query(
      `SELECT views_count AS total_views FROM posts WHERE id = ?`,
      [postId]
    );

    res.status(200).json({ success: true, total_views: rows[0].total_views, fallback: true });
  } catch (error) {
    console.error("Error fetching total views:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};



const recordViewPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;
    const today = new Date().toISOString().split("T")[0]; // "2026-05-20"
    const currentDate = today;
    const userKey = `view:${postId}:${userId}:${today}`;
    const postKey = `views:post:${postId}`;

    try {
      // Atomic check-and-set: SET NX returns null if key already existed
      const isNewView = await cachePost.set(userKey, 1, {
        EX: 60 * 60 * 24, // 24h
        NX: true,
      });

      if (isNewView) {
        // Make sure postKey exists, seeded from DB if this is a cold start.
        // NX here prevents a race where two requests both hit the "seed from DB" path.
        const exists = await cachePost.exists(postKey);
        if (!exists) {
          const [rows] = await pool.query(
            `SELECT views_count FROM posts WHERE id = ?`,
            [postId]
          );
          const baseline = rows[0]?.views_count || 0;
          await cachePost.set(postKey, baseline, {
            EX: 60 * 10, // 10 min — must be longer than the hydration cron interval (5 min)
            NX: true,
          });
        }

        // Atomic increment, no read-then-write race
        await cachePost.incr(postKey);

        // Trending (only once per day per user)
        await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 1, postId.toString());
      }

      return res.status(200).json({ success: true });
    } catch (redisErr) {
      console.error("Redis error, fallback to DB:", redisErr);

      // Fallback to DB — dedup first so retries/outages don't double-count
      const [existing] = await pool.query(
        `SELECT 1 FROM view_post WHERE user_id = ? AND post_id = ? AND view_date = CURDATE()`,
        [userId, postId]
      );

      if (!existing.length) {
        await pool.query(
          `INSERT INTO view_post (user_id, post_id, view_date, created_at)
           VALUES (?, ?, CURDATE(), NOW())
           ON DUPLICATE KEY UPDATE view_date = CURDATE()`,
          [userId, postId]
        );

        await pool.query(
          `UPDATE posts SET views_count = views_count + 1 WHERE id = ?`,
          [postId]
        );

        await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 1, postId.toString());
      }

      return res.status(200).json({ success: true, fallback: true });
    }
  } catch (error) {
    console.error("Error recording view post:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// const recordViewPost = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { postId } = req.params;
//     const today = new Date().toISOString().split("T")[0]; // "2026-05-20"
//     const currentDate = today; // keep full YYYY-MM-DD
//     const userKey = `view:${postId}:${userId}:${today}`;
//     const postKey = `views:post:${postId}`;

//     try {
//       // Redis first
//       const alreadyViewed = await cachePost.exists(userKey);
//       if (!alreadyViewed) {
//         // Mark user as viewed today (expires in 24h)
//         await cachePost.set(userKey, 1, { EX: 60 * 60 * 24 });

//         // Increment Redis total (always holds real total)
//         let currentTotal = await cachePost.get(postKey);
//         if (currentTotal === null) {
//           // If Redis empty, fallback to DB to get baseline
//           const [rows] = await pool.query(
//             `SELECT views_count FROM posts WHERE id = ?`,
//             [postId]
//           );
//           currentTotal = rows[0].views_count || 0;
//         }

//         // Set new total with TTL 3 minutes
//         await cachePost.set(postKey, parseInt(currentTotal, 10) + 1, { EX: 60 * 3 });

//         // 🔥 Trending Post logic (only once per day per user)
//         await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 1, postId.toString());
//       }
//       return res.status(200).json({ success: true });
//     } catch (redisErr) {
//       console.error("Redis error, fallback to DB:", redisErr);

//       // Fallback to DB
//       await pool.query(
//         `INSERT INTO view_post (user_id, post_id, view_date, created_at)
//          VALUES (?, ?, CURDATE(), NOW())
//          ON DUPLICATE KEY UPDATE view_date = CURDATE()`,
//         [userId, postId]
//       );

//       await pool.query(
//         `UPDATE posts SET views_count = views_count + 1 WHERE id = ?`,
//         [postId]
//       );

//       await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 1, postId.toString());

//       return res.status(200).json({ success: true, fallback: true });
//     }
//   } catch (error) {
//     console.error("Error recording view post:", error);
//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };


module.exports = { recordViewPost, getTotalViewsByPost };
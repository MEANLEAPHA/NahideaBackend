const db = require("../../config/db");
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
    const result = await db.query(
      `SELECT views_count AS total_views FROM posts WHERE id = $1`,
      [postId]
    );
    const rows = result.rows;

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
          const result = await db.query(
            `SELECT views_count FROM posts WHERE id = $1`,
            [postId]
          );
          const rows = result.rows;
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
      const existingResult = await db.query(
        `SELECT 1 FROM view_post WHERE user_id = $1 AND post_id = $2 AND view_date = CURRENT_DATE`,
        [userId, postId]
      );
      const existing = existingResult.rows;

      if (!existing.length) {
        await db.query(
          `INSERT INTO view_post (user_id, post_id, view_date, created_at)
           VALUES ($1, $2, CURRENT_DATE, NOW())
           ON CONFLICT (user_id, post_id, view_date) DO UPDATE SET view_date = EXCLUDED.view_date`,
          [userId, postId]
        );

        await db.query(
          `UPDATE posts SET views_count = views_count + 1 WHERE id = $1`,
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

module.exports = { recordViewPost, getTotalViewsByPost };
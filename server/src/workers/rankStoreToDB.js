const cron = require("node-cron");
const { ranking } = require("../config/redisClient");
const pool = require("../config/db");

// ---------- Core logic (shared by real cron + test cron) ----------

const hydrateHallOfFame = async (monthKey) => {
  const redisKey = `hof:month:${monthKey}`;
  const topUsers = await ranking.zRangeWithScores(redisKey, 0, 4, { REV: true });

  if (!topUsers.length) {
    console.log(`No Hall of Fame data for ${monthKey}, skipping.`);
    return;
  }

  let allOk = true;
  for (let i = 0; i < topUsers.length; i++) {
    const userId = parseInt(topUsers[i].value, 10);
    const score = topUsers[i].score;
    const rankPosition = i + 1;

    try {
      await pool.query(
        `INSERT INTO hall_of_fame_history (month, user_id, score, ranking)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), ranking = VALUES(ranking)`,
        [monthKey, userId, score, rankPosition]
      );
    } catch (err) {
      allOk = false;
      console.error(`Failed to insert HoF row (user ${userId}, month ${monthKey}):`, err.message);
    }
  }

  console.log(`Hall of Fame for ${monthKey} processed (allOk=${allOk}).`);

  if (allOk) {
    await ranking.del(redisKey);
    console.log(`Redis key ${redisKey} cleared.`);
  } else {
    console.log(`Redis key ${redisKey} kept (some rows failed) — will retry next run.`);
  }
};

const hydrateTrendingPost = async (dateKey) => {
  const redisKey = `trendingPost:day:${dateKey}`;
  const topPosts = await ranking.zRangeWithScores(redisKey, 0, 9, { REV: true });


  if (!topPosts.length) {
    console.log(`No trending post data for ${dateKey}, skipping.`);
    return;
  }

  let allOk = true;
  for (let i = 0; i < topPosts.length; i++) {
    const postId = parseInt(topPosts[i].value, 10);
    const score = topPosts[i].score;
    const rankPosition = i + 1;

    try {
      await pool.query(
        `INSERT INTO trending_post_history (date, post_id, score, ranking)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score = VALUES(score), ranking = VALUES(ranking)`,
        [dateKey, postId, score, rankPosition]
      );
    } catch (err) {
      allOk = false;
      console.error(`Failed to insert trending row (post ${postId}, date ${dateKey}):`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`Trending Post for ${dateKey} processed (allOk=${allOk}).`);

  if (allOk) {
    await ranking.del(redisKey);
    console.log(`Redis key ${redisKey} cleared.`);
  } else {
    console.log(`Redis key ${redisKey} kept (some rows failed) — will retry next run.`);
  }
};

// ---------- Key helpers ----------

const getLastMonthKey = () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
};

const getYesterdayKey = () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
  const dd = String(yesterday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// ---------- REAL schedules (commented out — restore once verified) ----------

// cron.schedule("0 0 1 * *", async () => {
//   try {
//     await hydrateHallOfFame(getLastMonthKey());
//   } catch (err) {
//     console.error("Hall of Fame worker failed:", err.message);
//   }
// });

// cron.schedule("0 0 * * *", async () => {
//   try {
//     await hydrateTrendingPost(getYesterdayKey());
//   } catch (err) {
//     console.error("Trending Post worker failed:", err.message);
//   }
// });

// ---------- TEST schedule: runs every 1 minute against your stuck keys ----------
// Remove this whole block once confirmed working, then uncomment the real crons above.

cron.schedule("* * * * *", async () => {
  console.log("[TEST] Running hydration check...");

  try {
    for (const monthKey of ["202605", "202606", "202607"]) {
      await hydrateHallOfFame(monthKey);
    }
  } catch (err) {
    console.error("[TEST] Hall of Fame worker failed:", err.message);
  }

  try {
    const staleDates = [
      "2026-05-20", "2026-05-21", "2026-05-23", "2026-05-28", "2026-05-29",
      "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07",
      "2026-06-08", "2026-06-09", "2026-07-06",
    ];
    for (const dateKey of staleDates) {
      await hydrateTrendingPost(dateKey);
    }
  } catch (err) {
    console.error("[TEST] Trending Post worker failed:", err.message);
  }
});

module.exports = { hydrateHallOfFame, hydrateTrendingPost };

// const cron = require("node-cron");
// const { ranking } = require("../config/redisClient");
// const pool = require("../config/db");

// // Run at midnight on the 1st of each month
// cron.schedule("0 0 1 * *", async () => {
//   try {
//     const now = new Date();
//     const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//     const monthKey = `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
//     const redisKey = `hof:month:${monthKey}`;

//     // Get top 5 users
//     const topUsers = await ranking.zRevRangeWithScores(redisKey, 0, 4);

//     if (topUsers.length > 0) {
//       for (let i = 0; i < topUsers.length; i++) {
//         const userId = parseInt(topUsers[i].value, 10);
//         const score = topUsers[i].score;
//         const rank = i + 1;

//         await pool.query(
//           `INSERT INTO hall_of_fame_history (month, user_id, score, rank)
//            VALUES (?, ?, ?, ?)`,
//           [monthKey, userId, score, rank]
//         );
//       }
//       console.log(`Hall of Fame for ${monthKey} saved to DB.`);
//     }

//     // Clear Redis key
//     await ranking.del(redisKey);
//     console.log(`Redis key ${redisKey} cleared.`);
//   } catch (err) {
//     console.error("Hall of Fame worker failed:", err.message);
//   }
// });

// // Run at midnight on each new day
// cron.schedule("0 0 * * *", async () => {
//   try {
//     const newDate = new Date();
//     const yesterday = new Date(newDate.getTime() - 24 * 60 * 60 * 1000);

//     // Format YYYY-MM-DD
//     const yyyy = yesterday.getFullYear();
//     const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
//     const dd = String(yesterday.getDate()).padStart(2, "0");
//     const yesterdayKey = `${yyyy}-${mm}-${dd}`;

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
//   } catch (err) {
//     console.error("Trending Post Worker failed:", err.message);
//   }
// });

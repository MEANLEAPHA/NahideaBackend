// const cron = require("node-cron");
// const { ranking } = require("../config/redisClient");
// const pool = require("../config/db");

// // ---------- Core logic (shared by real cron + test cron) ----------

// const hydrateHallOfFame = async (monthKey) => {
//   const redisKey = `hof:month:${monthKey}`;
//   const topUsers = await ranking.zRangeWithScores(redisKey, 0, 4, { REV: true });

//   if (!topUsers.length) {
//     console.log(`No Hall of Fame data for ${monthKey}, skipping.`);
//     return;
//   }

//   let allOk = true;
//   for (let i = 0; i < topUsers.length; i++) {
//     const userId = parseInt(topUsers[i].value, 10);
//     const score = topUsers[i].score;
//     const rankPosition = i + 1;

//     try {
//       await pool.query(
//         `INSERT INTO hall_of_fame_history (month, user_id, score, ranking)
//          VALUES ($1, $2, $3, $4)
//          ON CONFLICT (month, user_id) 
//          DO UPDATE SET score = EXCLUDED.score, ranking = EXCLUDED.ranking`,
//         [monthKey, userId, score, rankPosition]
//       );
//     } catch (err) {
//       allOk = false;
//       console.error(`Failed to insert HoF row (user ${userId}, month ${monthKey}):`, err.message);
//     }
//   }

//   console.log(`Hall of Fame for ${monthKey} processed (allOk=${allOk}).`);

//   if (allOk) {
//     await ranking.del(redisKey);
//     console.log(`Redis key ${redisKey} cleared.`);
//   } else {
//     console.log(`Redis key ${redisKey} kept (some rows failed) — will retry next run.`);
//   }
// };

// const hydrateTrendingPost = async (dateKey) => {
//   const redisKey = `trendingPost:day:${dateKey}`;
//   const topPosts = await ranking.zRangeWithScores(redisKey, 0, 9, { REV: true });

//   if (!topPosts.length) {
//     console.log(`No trending post data for ${dateKey}, skipping.`);
//     return;
//   }

//   let allOk = true;
//   for (let i = 0; i < topPosts.length; i++) {
//     const postId = parseInt(topPosts[i].value, 10);
//     const score = topPosts[i].score;
//     const rankPosition = i + 1;

//     try {
//       await pool.query(
//         `INSERT INTO trending_post_history (date, post_id, score, ranking)
//          VALUES ($1, $2, $3, $4)
//          ON CONFLICT (date, post_id) 
//          DO UPDATE SET score = EXCLUDED.score, ranking = EXCLUDED.ranking`,
//         [dateKey, postId, score, rankPosition]
//       );
//     } catch (err) {
//       allOk = false;
//       console.error(`Failed to insert trending row (post ${postId}, date ${dateKey}):`, err.message);
//     }
//     await new Promise((resolve) => setTimeout(resolve, 200));
//   }

//   console.log(`Trending Post for ${dateKey} processed (allOk=${allOk}).`);

//   if (allOk) {
//     await ranking.del(redisKey);
//     console.log(`Redis key ${redisKey} cleared.`);
//   } else {
//     console.log(`Redis key ${redisKey} kept (some rows failed) — will retry next run.`);
//   }
// };

// // ---------- Key helpers ----------

// const getLastMonthKey = () => {
//   const now = new Date();
//   const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//   return `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
// };

// const getYesterdayKey = () => {
//   const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
//   const yyyy = yesterday.getFullYear();
//   const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
//   const dd = String(yesterday.getDate()).padStart(2, "0");
//   return `${yyyy}-${mm}-${dd}`;
// };

// // ---------- REAL schedules (commented out — restore once verified) ----------

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

// module.exports = { hydrateHallOfFame, hydrateTrendingPost };

// ---------- TEMPORARY TEST BLOCK — remove after confirming ----------
// Run once manually (e.g. via a quick script, or trigger through a temp route)
// to force-hydrate the stuck keys and see exactly what error comes back.

const cron = require("node-cron");
const { ranking } = require("../config/redisClient");
const pool = require("../config/db");

// ---------- Core logic ----------

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
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (month, user_id) 
         DO UPDATE SET score = EXCLUDED.score, ranking = EXCLUDED.ranking`,
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
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (date, post_id) 
         DO UPDATE SET score = EXCLUDED.score, ranking = EXCLUDED.ranking`,
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

// ---------- REAL schedules ----------

cron.schedule("0 0 1 * *", async () => {
  try {
    await hydrateHallOfFame(getLastMonthKey());
  } catch (err) {
    console.error("Hall of Fame worker failed:", err.message);
  }
});

cron.schedule("0 0 * * *", async () => {
  try {
    await hydrateTrendingPost(getYesterdayKey());
  } catch (err) {
    console.error("Trending Post worker failed:", err.message);
  }
});

module.exports = { hydrateHallOfFame, hydrateTrendingPost };
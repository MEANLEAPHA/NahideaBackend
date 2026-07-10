const { ranking } = require("../../config/redisClient");
const pool = require("../../config/db");

// track login and add score
const recordLogin = async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM
    const redisLoginKey = `login:day:${userId}:${today}`;

    // Check if already logged today
    const alreadyLogged = await ranking.exists(redisLoginKey);
    if (!alreadyLogged) {
      // Mark login for today (value must be string)
      await ranking.set(redisLoginKey, "1", { EX: 86400 });

      // Increment Hall of Fame score
      await ranking.zIncrBy(`hof:month:${currentMonth}`, 2, userId.toString());

      // Persist to DB with its own try/catch
      try {
        await pool.query(
          `INSERT INTO user_logins (user_id, login_date)
           VALUES ($1, $2)
           ON CONFLICT (user_id, login_date) 
           DO UPDATE SET login_date = EXCLUDED.login_date`,
          [userId, today]
        );
        console.log(`DB insert success for user ${userId} on ${today}`);
      } catch (dbErr) {
        console.error("DB insert failed:", dbErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error recording login:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getHallOfFame = async (req, res) => {
  try {
    // Pagination parameters (default page=1, limit=20)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const today = new Date().toISOString().split("T")[0];
    const currentMonth = today.slice(0, 7).replace("-", "");
    const redisKey = `hof:month:${currentMonth}`;

    // Get total count of users in the sorted set
    const total = await ranking.zCard(redisKey);
    if (total === 0) {
      return res.json({ items: [], total: 0, page, limit, totalPages: 0 });
    }

    // Get a slice of top users (descending order) with pagination
    // zRangeWithScores: start = offset, stop = offset + limit - 1
    const topUsers = await ranking.zRangeWithScores(redisKey, offset, offset + limit - 1, { REV: true });

    if (topUsers.length === 0) {
      return res.json({ items: [], total, page, limit, totalPages: Math.ceil(total / limit) });
    }

    // Collect userIds
    const userIds = topUsers.map(u => parseInt(u.value, 10));

    // Fetch user info from DB - PostgreSQL with ANY array
    const result = await pool.query(
      `SELECT id, username, avatar_url, profession
       FROM users
       WHERE id = ANY($1::int[])`,
      [userIds]
    );

    const rows = result.rows;

    // Map results back to Redis order (preserve ranking)
    const items = topUsers.map((u, idx) => {
      const user = rows.find(r => Number(r.id) === parseInt(u.value, 10));
      return {
        userId: parseInt(u.value, 10),
        username: user?.username || "Unknown",
        avatar_url: user?.avatar_url || null,
        profession: user?.profession || "N/A",
        score: u.score,
        rank: offset + idx + 1,   // absolute rank
      };
    });

    const totalPages = Math.ceil(total / limit);
    res.json({ items, total, page, limit, totalPages });
  } catch (err) {
    console.error("Error fetching Hall of Fame:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

const getTrendingPost = async (req, res) => {
   try{
    
   }
   catch(err){
    console.error("Error fetching Hall of Fame:", err.message);
    res.status(500).json({ error: "Server error" });
   }
}



const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getMyRanking = async (req, res) => {
  try {
    const userId = req.user.userId;
    const redisKey = `hof:month:${getCurrentMonthKey()}`;

    const zeroBasedRank = await ranking.zRank(redisKey, userId.toString(), { REV: true });
    const score = await ranking.zScore(redisKey, userId.toString());

    if (zeroBasedRank === null || score === null) {
      return res.status(200).json({
        success: true,
        rank: null,
        score: 0,
        badgeTier: null,
      });
    }

    const rank = zeroBasedRank + 1;

    return res.status(200).json({
      success: true,
      rank,
      score: Number(score),
      badgeTier: rank <= 10 ? rank : null,
    });
  } catch (err) {
    console.error("Error fetching user ranking:", err.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};


const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50); // cap at 50
    const redisKey = `hof:month:${getCurrentMonthKey()}`;

    const topUsers = await ranking.zRangeWithScores(redisKey, 0, limit - 1, { REV: true });

    if (!topUsers.length) {
      return res.status(200).json({ success: true, leaderboard: [] });
    }

    const userIds = topUsers.map((u) => parseInt(u.value, 10));

    const result = await pool.query(
      `SELECT id, username, avatar_url
       FROM users
       WHERE id = ANY($1::int[])`,
      [userIds]
    );
    const rows = result.rows;

    const leaderboard = topUsers.map((entry, i) => {
      const userId = parseInt(entry.value, 10);
      const user = rows.find((r) => Number(r.id) === userId);

      return {
        rank: i + 1,
        userId,
        username: user?.username || "Unknown",
        avatarUrl: user?.avatar_url || null,
        score: Number(entry.score),
        badgeTier: i + 1 <= 10 ? i + 1 : null,
      };
    });

    return res.status(200).json({ success: true, leaderboard });
  } catch (err) {
    console.error("Error fetching leaderboard:", err.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};


module.exports = { recordLogin, getHallOfFame, getMyRanking, getLeaderboard };
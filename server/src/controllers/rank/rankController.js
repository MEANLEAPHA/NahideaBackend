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
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE login_date = VALUES(login_date)`,
          [userId, today]
        );
        console.log(`DB insert success for user ${userId} on ${today}`);
      } catch (dbErr) {
        console.error("DB insert failed:", dbErr.sqlMessage || dbErr.message);
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
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = today.slice(0, 7).replace("-", "");
    const redisKey = `hof:month:${currentMonth}`;

    // Get top 10 users from Redis
    const topUsers = await ranking.zRevRangeWithScores(redisKey, 0, 9);

    if (topUsers.length === 0) {
      return res.json({ items: [] });
    }

    // Collect userIds
    const userIds = topUsers.map(u => parseInt(u.value, 10));

    // Fetch user info from DB
    const [rows] = await pool.query(
      `SELECT id, username, avatar_url, profession
       FROM users
       WHERE id IN (?)`,
      [userIds]
    );

    // Map results back to Redis order
    const items = topUsers.map((u, index) => {
      const user = rows.find(r => r.id === parseInt(u.value, 10));
      return {
        userId: parseInt(u.value, 10),
        username: user?.username || "Unknown",
        avatar_url: user?.avatar_url || null,
        profession: user?.profession || "N/A",
        score: u.score,
        rank: index + 1,
      };
    });

    res.json({ items });
  } catch (err) {
    console.error("Error fetching Hall of Fame:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// const recordLogin = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
//     const currentMonth = today.slice(0, 7).replace("-", ""); // YYYYMM
//     const redisLoginKey = `login:day:${userId}:${today}`;

//     // Check if already logged today
//     const alreadyLogged = await ranking.exists(redisLoginKey);
//     if (!alreadyLogged) {
//       // Mark login for today (value must be string)
//       await ranking.set(redisLoginKey, "1", { EX: 86400 });

//       // Increment Hall of Fame score
//       await ranking.zIncrBy(`hof:month:${currentMonth}`, 2, userId.toString());

//       // Persist to DB
//       await pool.query(
//         `INSERT INTO user_logins (user_id, login_date)
//          VALUES (?, ?)
//          ON DUPLICATE KEY UPDATE login_date = VALUES(login_date)`,
//         [userId, today]
//       );
//     }

//     res.json({ success: true });
//   } catch (err) {
//     console.error("Error recording login:", err);
//     res.status(500).json({ success: false });
//   }
// };


module.exports = { recordLogin, getHallOfFame };
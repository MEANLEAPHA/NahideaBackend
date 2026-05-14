const { ranking } = require("../../config/redisClient");


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
      // Mark login for today
      await ranking.set(redisLoginKey, 1, { EX: 86400 });

      // Increment Hall of Fame score
      await ranking.zIncrBy(`hof:month:${currentMonth}`, 2, userId);

      // Persist to DB
      await pool.query(
        `INSERT INTO user_logins (user_id, login_date)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE login_date = VALUES(login_date)`,
        [userId, today]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error recording login:", err);
    res.status(500).json({ success: false });
  }
};


module.exports = { recordLogin };
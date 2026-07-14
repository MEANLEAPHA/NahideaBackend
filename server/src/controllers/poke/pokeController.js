const db = require("../../config/db");

async function hasSentToday(senderId, receiverId, signalType) {
  const result = await db.query(
    `SELECT id FROM user_poke 
     WHERE sender_id = $1 AND receiver_id = $2 AND signal_type = $3 
       AND DATE(created_at) = CURRENT_DATE`,
    [senderId, receiverId, signalType]
  );
  return result.rows.length > 0;
}

const sendPoke = async (req, res) => {
  const senderId = req.user.userId;
  const { receiverId, signalType } = req.body;
  try {
    // Check daily limit
    const alreadySent = await hasSentToday(senderId, receiverId, signalType);
    if (alreadySent) {
      return res.status(400).json({ error: "You already sent this signal today. Try again tomorrow." });
    }

    // Insert new signal
    await db.query(
      `INSERT INTO user_poke (sender_id, receiver_id, signal_type) VALUES ($1, $2, $3)`,
      [senderId, receiverId, signalType]
    );

    res.json({ success: true, message: `Signal '${signalType}' sent successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getPoke = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query(
      `SELECT * FROM user_poke WHERE receiver_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { sendPoke, getPoke };
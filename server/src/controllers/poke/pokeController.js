const db = require("../../config/db");


// Check if user already sent signal today
async function hasSentToday(senderId, receiverId, signalType) {
  const [rows] = await db.execute(
    `SELECT id FROM user_poke 
     WHERE sender_id = ? AND receiver_id = ? AND signal_type = ? 
       AND DATE(created_at) = CURDATE()`,
    [senderId, receiverId, signalType]
  );
  return rows.length > 0;
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
    await db.execute(
      `INSERT INTO user_poke (sender_id, receiver_id, signal_type) VALUES (?, ?, ?)`,
      [senderId, receiverId, signalType]
    );

    res.json({ success: true, message: `Signal '${signalType}' sent successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getPoke = async (req, res) => {
  try {
    const { userId } = req.user.userId;
    const [rows] = await db.execute(
      `SELECT * FROM user_poke WHERE receiver_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


module.exports = { sendPoke, getPoke };
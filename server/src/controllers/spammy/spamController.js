const pool = require("../../config/db");
const sendSpam = async (req, res) => {
  try {
    const senderId = req.user.userId;

    const {
      receiver_id,
      spam_type
    } = req.body;

    const [countResult] = await pool.query(
      `
      SELECT COUNT(*) total
      FROM user_spams
      WHERE sender_id = ?
      AND DATE(created_at) = CURDATE()
      `,
      [senderId]
    );

    const sentToday = countResult[0].total;

    if (sentToday >= 5) {
      return res.status(400).json({
        message: "Daily spam limit reached"
      });
    }

    await pool.query(
      `
      INSERT INTO user_spams
      (
        sender_id,
        receiver_id,
        spam_type
      )
      VALUES (?, ?, ?)
      `,
      [
        senderId,
        receiver_id,
        spam_type
      ]
    );

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server Error"
    });
  }
};
const getInboxSpam = async (req, res) => {
  try {

    const userId = req.user.userId;

    const [rows] = await pool.query(
      `
      SELECT *
      FROM user_spams
      WHERE receiver_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(rows);

  } catch (err) {
    res.status(500).json({
      message: "Server Error"
    });
  }
};
const getUnreadSpam = async (req, res) => {
  try {

    const userId = req.user.userId;

    const [rows] = await pool.query(
      `
      SELECT COUNT(*) total
      FROM user_spams
      WHERE receiver_id = ?
      AND is_viewed = 0
      `,
      [userId]
    );

    res.json({
      unread: rows[0].total
    });

  } catch (err) {
    res.status(500).json({
      message: "Server Error"
    });
  }
};
const markSpamViewed = async (req, res) => {
  try {

    const userId = req.user.userId;
    const spamId = req.params.spamId;

    await pool.query(
      `
      UPDATE user_spams
      SET
      is_viewed = 1,
      viewed_at = NOW()
      WHERE spam_id = ?
      AND receiver_id = ?
      `,
      [
        spamId,
        userId
      ]
    );

    res.json({
      success: true
    });

  } catch (err) {
    res.status(500).json({
      message: "Server Error"
    });
  }
};
const getSentSpam = async (req, res) => {
  try {

    const userId = req.user.userId;

    const [rows] = await pool.query(
      `
      SELECT
      spam_id,
      receiver_id,
      spam_type,
      is_viewed,
      viewed_at,
      created_at
      FROM user_spams
      WHERE sender_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server Error"
    });
  }
};


module.exports = {
  sendSpam,
  getInboxSpam,
  getUnreadSpam,
  markSpamViewed,
  getSentSpam
};
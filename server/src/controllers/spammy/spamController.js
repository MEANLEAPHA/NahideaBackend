const pool = require("../../config/db");

const DAILY_SPAM_LIMIT = 25;

const sendSpam = async (req, res) => {
  const client = await pool.connect();

  try {
    const senderId = req.user.userId;
    const { receiver_id, spam_type } = req.body;

    // --- Validation ---
    const receiverId = Number(receiver_id);

    if (!receiver_id || !Number.isInteger(receiverId) || receiverId <= 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: "A valid receiver_id is required",
      });
    }

    if (receiverId === senderId) {
      client.release();
      return res.status(400).json({
        success: false,
        message: "You can't send spam to yourself",
      });
    }

    const receiverResult = await client.query(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `
      INSERT INTO user_spams (sender_id, receiver_id, spam_type)
      SELECT $1, $2, $3
      WHERE (
        SELECT COUNT(*) FROM user_spams
        WHERE sender_id = $4
        AND DATE(created_at) = CURRENT_DATE
      ) < $5
      `,
      [senderId, receiverId, spam_type, senderId, DAILY_SPAM_LIMIT]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(429).json({
        success: false,
        message: "Daily spam limit reached",
      });
    }

    await client.query('COMMIT');
    client.release();

    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getInboxSpam = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `
      SELECT
        s.spam_id,
        s.sender_id,
        s.receiver_id,
        s.spam_type,
        s.is_viewed,
        s.viewed_at,
        s.created_at,
        u.username AS sender_username,
        u.avatar_url AS sender_avatar_url
      FROM user_spams s
      LEFT JOIN users u ON u.id = s.sender_id
      WHERE s.receiver_id = $1
      AND s.receiver_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getUnreadSpam = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT COUNT(*) as total
      FROM user_spams
      WHERE receiver_id = $1
      AND is_viewed = 0
      AND receiver_deleted = 0
      `,
      [userId]
    );

    res.json({ unread: parseInt(result.rows[0].total, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const markSpamViewed = async (req, res) => {
  try {
    const userId = req.user.userId;
    const spamId = Number(req.params.spamId);

    if (!Number.isInteger(spamId) || spamId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid spam id" });
    }

    const result = await pool.query(
      `
      UPDATE user_spams
      SET is_viewed = 1, viewed_at = NOW()
      WHERE spam_id = $1
      AND receiver_id = $2
      AND receiver_deleted = 0
      `,
      [spamId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Spam not found or you don't have access to it",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Mark every unread, non-deleted inbox item as viewed in one shot ("View All")
const markAllViewed = async (req, res) => {
  try {
    const userId = req.user.userId;

    await pool.query(
      `
      UPDATE user_spams
      SET is_viewed = 1, viewed_at = NOW()
      WHERE receiver_id = $1
      AND is_viewed = 0
      AND receiver_deleted = 0
      `,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getSentSpam = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `
      SELECT
        s.spam_id,
        s.receiver_id,
        s.spam_type,
        s.is_viewed,
        s.viewed_at,
        s.created_at,
        u.username AS receiver_username,
        u.avatar_url AS receiver_avatar_url
      FROM user_spams s
      LEFT JOIN users u ON u.id = s.receiver_id
      WHERE s.sender_id = $1
      AND s.sender_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const deleteOneSpam = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const spamId = Number(req.params.spamId);

    if (!Number.isInteger(spamId) || spamId <= 0) {
      client.release();
      return res.status(400).json({ success: false, message: "Invalid spam id" });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `
      SELECT spam_id, sender_id, receiver_id, sender_deleted, receiver_deleted
      FROM user_spams
      WHERE spam_id = $1
      FOR UPDATE
      `,
      [spamId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: "Spam not found" });
    }

    const spam = result.rows[0];
    let senderDeleted = spam.sender_deleted;
    let receiverDeleted = spam.receiver_deleted;

    if (Number(spam.sender_id) === Number(userId)) {
      senderDeleted = 1;
    } else if (Number(spam.receiver_id) === Number(userId)) {
      receiverDeleted = 1;
    } else {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({
        success: false,
        message: "You don't have access to this spam",
      });
    }

    if (senderDeleted && receiverDeleted) {
      await client.query(`DELETE FROM user_spams WHERE spam_id = $1`, [spamId]);
    } else {
      await client.query(
        `UPDATE user_spams SET sender_deleted = $1, receiver_deleted = $2 WHERE spam_id = $3`,
        [senderDeleted, receiverDeleted, spamId]
      );
    }

    await client.query('COMMIT');
    client.release();
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const deleteAllSpam = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const type = req.query.type === "sent" ? "sent" : "inbox";

    await client.query('BEGIN');

    if (type === "inbox") {
      await client.query(
        `UPDATE user_spams SET receiver_deleted = 1 WHERE receiver_id = $1 AND receiver_deleted = 0`,
        [userId]
      );
    } else {
      await client.query(
        `UPDATE user_spams SET sender_deleted = 1 WHERE sender_id = $1 AND sender_deleted = 0`,
        [userId]
      );
    }

    await client.query(
      `DELETE FROM user_spams WHERE sender_deleted = 1 AND receiver_deleted = 1`
    );

    await client.query('COMMIT');
    client.release();
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = {
  sendSpam,
  getInboxSpam,
  getUnreadSpam,
  markSpamViewed,
  markAllViewed,
  getSentSpam,
  deleteOneSpam,
  deleteAllSpam,
};
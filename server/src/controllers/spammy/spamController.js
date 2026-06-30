
// const pool = require("../../config/db");

// // Keep this list in sync with the `spammy_options` values used on the frontend.
// const ALLOWED_SPAM_TYPES = ["poke", "goodnight", "sendlove"];

// const DAILY_SPAM_LIMIT = 5;

// const sendSpam = async (req, res) => {
//   const connection = await pool.getConnection();

//   try {
//     const senderId = req.user.userId;
//     const { receiver_id, spam_type } = req.body;

//     // --- Validation ---
//     const receiverId = Number(receiver_id);

//     if (!receiver_id || !Number.isInteger(receiverId) || receiverId <= 0) {
//       connection.release();
//       return res.status(400).json({
//         success: false,
//         message: "A valid receiver_id is required",
//       });
//     }

//     if (!ALLOWED_SPAM_TYPES.includes(spam_type)) {
//       connection.release();
//       return res.status(400).json({
//         success: false,
//         message: "Invalid spam_type",
//       });
//     }

//     if (receiverId === senderId) {
//       connection.release();
//       return res.status(400).json({
//         success: false,
//         message: "You can't send spam to yourself",
//       });
//     }

//     // Make sure the receiver actually exists, so we don't silently store
//     // spam pointed at a non-existent user.
//     const [receiverRows] = await connection.query(
//       `SELECT id FROM users WHERE id = ? LIMIT 1`,
//       [receiverId]
//     );

//     if (receiverRows.length === 0) {
//       connection.release();
//       return res.status(404).json({
//         success: false,
//         message: "Receiver not found",
//       });
//     }

//     // --- Atomic daily-limit check + insert ---
//     // Doing the COUNT and INSERT as two separate queries (as in the original
//     // code) creates a race condition: two concurrent requests can both pass
//     // the count check before either insert lands, letting a user exceed the
//     // daily limit. Folding the check into the INSERT...SELECT as a single
//     // statement closes that window.
//     await connection.beginTransaction();

//     const [result] = await connection.query(
//       `
//       INSERT INTO user_spams (sender_id, receiver_id, spam_type)
//       SELECT ?, ?, ?
//       FROM DUAL
//       WHERE (
//         SELECT COUNT(*) FROM user_spams
//         WHERE sender_id = ?
//         AND DATE(created_at) = CURDATE()
//       ) < ?
//       `,
//       [senderId, receiverId, spam_type, senderId, DAILY_SPAM_LIMIT]
//     );

//     if (result.affectedRows === 0) {
//       await connection.rollback();
//       connection.release();
//       return res.status(429).json({
//         success: false,
//         message: "Daily spam limit reached",
//       });
//     }

//     await connection.commit();
//     connection.release();

//     return res.json({ success: true });
//   } catch (err) {
//     await connection.rollback().catch(() => {});
//     connection.release();
//     console.error(err);
//     return res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// const getInboxSpam = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//     const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
//     const offset = (page - 1) * limit;

//     const [rows] = await pool.query(
//       `
//       SELECT
//         s.spam_id,
//         s.sender_id,
//         s.receiver_id,
//         s.spam_type,
//         s.is_viewed,
//         s.viewed_at,
//         s.created_at,
//         u.username AS sender_username,
//         u.avatar_url AS sender_avatar_url
//       FROM user_spams s
//       LEFT JOIN users u ON u.id = s.sender_id
//       WHERE s.receiver_id = ?
//       ORDER BY s.created_at DESC
//       LIMIT ? OFFSET ?
//       `,
//       [userId, limit, offset]
//     );

//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// const getUnreadSpam = async (req, res) => {
//   try {
//     const userId = req.user.userId;

//     const [rows] = await pool.query(
//       `
//       SELECT COUNT(*) total
//       FROM user_spams
//       WHERE receiver_id = ?
//       AND is_viewed = 0
//       `,
//       [userId]
//     );

//     res.json({ unread: rows[0].total });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// const markSpamViewed = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const spamId = Number(req.params.spamId);

//     if (!Number.isInteger(spamId) || spamId <= 0) {
//       return res.status(400).json({ success: false, message: "Invalid spam id" });
//     }

//     const [result] = await pool.query(
//       `
//       UPDATE user_spams
//       SET is_viewed = 1, viewed_at = NOW()
//       WHERE spam_id = ?
//       AND receiver_id = ?
//       `,
//       [spamId, userId]
//     );

//     // Without this check, hitting this endpoint with someone else's spam_id
//     // (or a non-existent one) silently returned success:true.
//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Spam not found or you don't have access to it",
//       });
//     }

//     res.json({ success: true });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// const getSentSpam = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
//     const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
//     const offset = (page - 1) * limit;

//     const [rows] = await pool.query(
//       `
//       SELECT
//         s.spam_id,
//         s.receiver_id,
//         s.spam_type,
//         s.is_viewed,
//         s.viewed_at,
//         s.created_at,
//         u.username AS receiver_username,
//         u.avatar_url AS receiver_avatar_url
//       FROM user_spams s
//       LEFT JOIN users u ON u.id = s.receiver_id
//       WHERE s.sender_id = ?
//       ORDER BY s.created_at DESC
//       LIMIT ? OFFSET ?
//       `,
//       [userId, limit, offset]
//     );

//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server Error" });
//   }
// };

// module.exports = {
//   sendSpam,
//   getInboxSpam,
//   getUnreadSpam,
//   markSpamViewed,
//   getSentSpam,
// };

const pool = require("../../config/db");

// Keep this list in sync with the `spammy_options` values used on the frontend.
const ALLOWED_SPAM_TYPES = ["poke", "goodnight", "sendlove"];

const DAILY_SPAM_LIMIT = 5;

const sendSpam = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const senderId = req.user.userId;
    const { receiver_id, spam_type } = req.body;

    // --- Validation ---
    const receiverId = Number(receiver_id);

    if (!receiver_id || !Number.isInteger(receiverId) || receiverId <= 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: "A valid receiver_id is required",
      });
    }

    if (!ALLOWED_SPAM_TYPES.includes(spam_type)) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Invalid spam_type",
      });
    }

    if (receiverId === senderId) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: "You can't send spam to yourself",
      });
    }

    const [receiverRows] = await connection.query(
      `SELECT id FROM users WHERE id = ? LIMIT 1`,
      [receiverId]
    );

    if (receiverRows.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      `
      INSERT INTO user_spams (sender_id, receiver_id, spam_type)
      SELECT ?, ?, ?
      FROM DUAL
      WHERE (
        SELECT COUNT(*) FROM user_spams
        WHERE sender_id = ?
        AND DATE(created_at) = CURDATE()
      ) < ?
      `,
      [senderId, receiverId, spam_type, senderId, DAILY_SPAM_LIMIT]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return res.status(429).json({
        success: false,
        message: "Daily spam limit reached",
      });
    }

    await connection.commit();
    connection.release();

    return res.json({ success: true });
  } catch (err) {
    await connection.rollback().catch(() => {});
    connection.release();
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

    const [rows] = await pool.query(
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
      WHERE s.receiver_id = ?
      AND s.receiver_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
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
      AND receiver_deleted = 0
      `,
      [userId]
    );

    res.json({ unread: rows[0].total });
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

    const [result] = await pool.query(
      `
      UPDATE user_spams
      SET is_viewed = 1, viewed_at = NOW()
      WHERE spam_id = ?
      AND receiver_id = ?
      AND receiver_deleted = 0
      `,
      [spamId, userId]
    );

    if (result.affectedRows === 0) {
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
      WHERE receiver_id = ?
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

    const [rows] = await pool.query(
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
      WHERE s.sender_id = ?
      AND s.sender_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [userId, limit, offset]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Soft-delete a single spam for whichever side (sender or receiver) is
// making the request. The caller's role is detected from the row itself —
// not trusted from the client — so it can't be spoofed. Once both sides
// have deleted their copy, the row is hard-deleted for good.
const deleteOneSpam = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = req.user.userId;
    const spamId = Number(req.params.spamId);

    if (!Number.isInteger(spamId) || spamId <= 0) {
      connection.release();
      return res.status(400).json({ success: false, message: "Invalid spam id" });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT spam_id, sender_id, receiver_id, sender_deleted, receiver_deleted
      FROM user_spams
      WHERE spam_id = ?
      FOR UPDATE
      `,
      [spamId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: "Spam not found" });
    }

    const spam = rows[0];
    let senderDeleted = spam.sender_deleted;
    let receiverDeleted = spam.receiver_deleted;

    if (Number(spam.sender_id) === Number(userId)) {
      senderDeleted = 1;
    } else if (Number(spam.receiver_id) === Number(userId)) {
      receiverDeleted = 1;
    } else {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        success: false,
        message: "You don't have access to this spam",
      });
    }

    if (senderDeleted && receiverDeleted) {
      await connection.query(`DELETE FROM user_spams WHERE spam_id = ?`, [spamId]);
    } else {
      await connection.query(
        `UPDATE user_spams SET sender_deleted = ?, receiver_deleted = ? WHERE spam_id = ?`,
        [senderDeleted, receiverDeleted, spamId]
      );
    }

    await connection.commit();
    connection.release();
    return res.json({ success: true });
  } catch (err) {
    await connection.rollback().catch(() => {});
    connection.release();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Bulk soft-delete. `?type=inbox` (default) clears everything the user has
// received; `?type=sent` clears everything they've sent. Rows that end up
// deleted on both sides get swept away permanently.
const deleteAllSpam = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const userId = req.user.userId;
    const type = req.query.type === "sent" ? "sent" : "inbox";

    await connection.beginTransaction();

    if (type === "inbox") {
      await connection.query(
        `UPDATE user_spams SET receiver_deleted = 1 WHERE receiver_id = ? AND receiver_deleted = 0`,
        [userId]
      );
    } else {
      await connection.query(
        `UPDATE user_spams SET sender_deleted = 1 WHERE sender_id = ? AND sender_deleted = 0`,
        [userId]
      );
    }

    await connection.query(
      `DELETE FROM user_spams WHERE sender_deleted = 1 AND receiver_deleted = 1`
    );

    await connection.commit();
    connection.release();
    return res.json({ success: true });
  } catch (err) {
    await connection.rollback().catch(() => {});
    connection.release();
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
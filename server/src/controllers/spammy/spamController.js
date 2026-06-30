// const pool = require("../../config/db");
// const sendSpam = async (req, res) => {
//   try {
//     const senderId = req.user.userId;

//     const {
//       receiver_id,
//       spam_type
//     } = req.body;

//     const [countResult] = await pool.query(
//       `
//       SELECT COUNT(*) total
//       FROM user_spams
//       WHERE sender_id = ?
//       AND DATE(created_at) = CURDATE()
//       `,
//       [senderId]
//     );

//     const sentToday = countResult[0].total;

//     if (sentToday >= 5) {
//       return res.status(400).json({
//         message: "Daily spam limit reached"
//       });
//     }

//     await pool.query(
//       `
//       INSERT INTO user_spams
//       (
//         sender_id,
//         receiver_id,
//         spam_type
//       )
//       VALUES (?, ?, ?)
//       `,
//       [
//         senderId,
//         receiver_id,
//         spam_type
//       ]
//     );

//     res.json({
//       success: true
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       message: "Server Error"
//     });
//   }
// };
// const getInboxSpam = async (req, res) => {
//   try {

//     const userId = req.user.userId;

//     const [rows] = await pool.query(
//       `
//       SELECT *
//       FROM user_spams
//       WHERE receiver_id = ?
//       ORDER BY created_at DESC
//       `,
//       [userId]
//     );

//     res.json(rows);

//   } catch (err) {
//     res.status(500).json({
//       message: "Server Error"
//     });
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

//     res.json({
//       unread: rows[0].total
//     });

//   } catch (err) {
//     res.status(500).json({
//       message: "Server Error"
//     });
//   }
// };
// const markSpamViewed = async (req, res) => {
//   try {

//     const userId = req.user.userId;
//     const spamId = req.params.spamId;

//     await pool.query(
//       `
//       UPDATE user_spams
//       SET
//       is_viewed = 1,
//       viewed_at = NOW()
//       WHERE spam_id = ?
//       AND receiver_id = ?
//       `,
//       [
//         spamId,
//         userId
//       ]
//     );

//     res.json({
//       success: true
//     });

//   } catch (err) {
//     res.status(500).json({
//       message: "Server Error"
//     });
//   }
// };
// const getSentSpam = async (req, res) => {
//   try {

//     const userId = req.user.userId;

//     const [rows] = await pool.query(
//       `
//       SELECT
//       spam_id,
//       receiver_id,
//       spam_type,
//       is_viewed,
//       viewed_at,
//       created_at
//       FROM user_spams
//       WHERE sender_id = ?
//       ORDER BY created_at DESC
//       `,
//       [userId]
//     );

//     res.json(rows);

//   } catch (err) {
//     console.error(err);

//     res.status(500).json({
//       message: "Server Error"
//     });
//   }
// };


// module.exports = {
//   sendSpam,
//   getInboxSpam,
//   getUnreadSpam,
//   markSpamViewed,
//   getSentSpam
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

    // Make sure the receiver actually exists, so we don't silently store
    // spam pointed at a non-existent user.
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

    // --- Atomic daily-limit check + insert ---
    // Doing the COUNT and INSERT as two separate queries (as in the original
    // code) creates a race condition: two concurrent requests can both pass
    // the count check before either insert lands, letting a user exceed the
    // daily limit. Folding the check into the INSERT...SELECT as a single
    // statement closes that window.
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
      `,
      [spamId, userId]
    );

    // Without this check, hitting this endpoint with someone else's spam_id
    // (or a non-existent one) silently returned success:true.
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

module.exports = {
  sendSpam,
  getInboxSpam,
  getUnreadSpam,
  markSpamViewed,
  getSentSpam,
};
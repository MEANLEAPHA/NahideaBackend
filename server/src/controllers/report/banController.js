// controllers/adminBanController.js
const pool = require('../../config/db');

// const banUser = async (req, res) => {
//   try {
//     const adminId = req.user.userId;
//     const { user_id, reason } = req.body;

//     if (!user_id || !reason) {
//       return res.status(400).json({ message: 'user_id and reason are required' });
//     }

//     const result = await pool.query(
//       `INSERT INTO user_bans (user_id, banned_by, reason, status, banned_at)
//        VALUES ($1, $2, $3, 'pending', NOW())
//        RETURNING id`,
//       [user_id, adminId, reason]
//     );

//     return res.status(201).json({ id: result.rows[0].id, message: 'User banned' });
//   } catch (err) {
//     console.error('banUser error:', err);
//     return res.status(500).json({ message: 'Failed to ban user' });
//   }
// };

// const allowUser = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const rows = await pool.query(
//       `SELECT id FROM user_bans WHERE user_id = $1 ORDER BY banned_at DESC LIMIT 1`,
//       [userId]
//     );

//     if (rows.rows.length === 0) {
//       return res.status(404).json({ message: 'No ban record found for this user' });
//     }

//     await pool.query(
//       `UPDATE user_bans SET status = 'allow', reviewed_at = NOW() WHERE id = $1`,
//       [rows.rows[0].id]
//     );

//     return res.status(200).json({ message: 'User allowed' });
//   } catch (err) {
//     console.error('allowUser error:', err);
//     return res.status(500).json({ message: 'Failed to allow user' });
//   }
// };


// const getAllBans = async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT b.id, b.user_id, b.reason, b.status, b.banned_at, b.reviewed_at,
//               u.username, u.avatar_url
//        FROM user_bans b
//        LEFT JOIN users u ON u.id = b.user_id
//        ORDER BY b.banned_at DESC`
//     );
//     return res.status(200).json(result.rows);
//   } catch (err) {
//     console.error('getAllBans error:', err);
//     return res.status(500).json({ message: 'Failed to fetch bans' });
//   }
// };

// GET /api/ban-status
// used by the LOGGED-IN USER's own frontend gate — returns their latest ban row (if any)
const getMyBanStatus = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT status, reason, banned_at
       FROM user_bans
       WHERE user_id = $1
       ORDER BY banned_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ banned: false });
    }

    const latest = result.rows[0];
    return res.status(200).json({
      banned: latest.status === 'pending',
      status: latest.status,
      reason: latest.reason,
      banned_at: latest.banned_at,
    });
  } catch (err) {
    console.error('getMyBanStatus error:', err);
    return res.status(500).json({ message: 'Failed to check ban status' });
  }
};

module.exports = { 
  // banUser, 
  // allowUser, 
  // getAllBans, 
  getMyBanStatus 
};
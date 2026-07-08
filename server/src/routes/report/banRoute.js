// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const {
//   banUser,
//   allowUser,
//   getAllBans,
  getMyBanStatus,
} = require('../../controllers/report/banController');

const {protect} = require('../../middleware/authMiddleware');
// const adminMiddleware = require('../middleware/adminMiddleware'); 

// admin-only
// router.post('/admin/ban-user', authMiddleware, adminMiddleware, banUser);
// router.put('/admin/allow-user/:userId', authMiddleware, adminMiddleware, allowUser);
// router.get('/admin/bans', authMiddleware, adminMiddleware, getAllBans);

// any logged-in user checking their own status
router.get('/ban-status', protect, getMyBanStatus);

module.exports = router;
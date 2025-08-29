const express = require('express');
const router = express.Router();
const { searchUsers, getUserActivity } = require('../controllers/userController');
const { verifyToken } = require('../middleware/verifyToken');

// All routes require authentication
router.use(verifyToken);

// Search users
router.get('/search', searchUsers);

// Get user activity
router.get('/activity', getUserActivity);

module.exports = router;
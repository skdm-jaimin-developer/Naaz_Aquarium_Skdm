const express = require('express');
const router = express.Router();
const usersController = require('../controllers/userController');

// Import middleware for authentication and role-based access control
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Protect all routes in this router with authentication middleware
router.use(authMiddleware);

router.get('/', adminMiddleware, usersController.getAllUsers);
router.get('/stats', adminMiddleware, usersController.getTableCounts);
router.get('/:id', usersController.getUserById);

module.exports = router;

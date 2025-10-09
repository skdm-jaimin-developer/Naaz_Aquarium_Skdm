const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
// POST: Create or Update User Activity
router.post('/',authMiddleware, activityController.createOrUpdateActivity);

// GET: Fetch All Activities with Pagination and Details
router.get('/',authMiddleware,adminMiddleware, activityController.fetchAllActivities);

module.exports = router;
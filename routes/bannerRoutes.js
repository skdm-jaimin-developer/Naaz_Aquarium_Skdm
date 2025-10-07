const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');

// Import middleware for authentication and role-based access control
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// Protect all routes in this router with authentication middleware
router.use(authMiddleware);

router.get('/',adminMiddleware, bannerController.getBanners);
router.post('/',adminMiddleware, uploadMiddleware, bannerController.createBanner);
router.put('/:bannerId',adminMiddleware, uploadMiddleware, bannerController.updateBanner);
router.delete('/:bannerId', bannerController.deleteBanner);

module.exports = router;

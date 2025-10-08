const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const multer = require('multer');
// All routes are prefixed with /coupons (e.g., in your main app.js)
const upload = multer().none();

router.get('/', couponController.getAllCoupons);
router.get('/:id', couponController.getCouponById);
router.get('/code/:code', couponController.getCouponByCode);

router.post('/', upload,couponController.createCoupon);
router.put('/:id',upload, couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);

module.exports = router;

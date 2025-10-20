const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware'); 
// Public routes for authentication
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/google-login', authController.googleLogin);
router.put('/update', authMiddleware,authController.updateProfile);
router.post('/forgot', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset', authController.resetPassword);
module.exports = router;

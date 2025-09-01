const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// These routes are protected by authentication middleware
router.get('/', categoryController.getAllCategories);
router.use(authMiddleware);
router.post('/', adminMiddleware, categoryController.createCategory);
router.get('/:id', categoryController.getCategoryById);
router.put('/:id', adminMiddleware, categoryController.updateCategory);
router.delete('/:id', adminMiddleware, categoryController.deleteCategory);

module.exports = router;

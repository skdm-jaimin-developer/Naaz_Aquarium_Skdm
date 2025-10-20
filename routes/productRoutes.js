const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const imageController = require('../controllers/imageController');
const reviewController = require('../controllers/reviewController');
const sizeController = require('../controllers/sizeController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// General Product Routes (Auth protected)

// Products CRUD
router.get('/', productController.getAllProducts);
router.get('/get/:slug', productController.getProductBySlug);
router.get('/search', productController.getSearch);
router.get('/admin', productController.getAllProductsadmin);


router.use(authMiddleware);
router.post('/:productId/reviews',uploadMiddleware, reviewController.addReview);
router.get('/:productId/reviews', reviewController.getReviewsByProductId);

// Admin-only Product Routes
router.use(adminMiddleware);
router.post('/', uploadMiddleware, productController.createProduct);
router.put('/update/:id', uploadMiddleware, productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

// Images CRUD
router.post('/:productId/images', uploadMiddleware, imageController.addImage);
router.delete('/images/:imageId', imageController.deleteImage);

// Sizes CRUD
router.post('/:productId/sizes', sizeController.addSize);
router.put('/sizes/:sizeId', sizeController.updateSize);
router.delete('/sizes/:sizeId', sizeController.deleteSize);
router.get('/:productId/sizes', sizeController.getSizesByProductId);

// Reviews CRUD

router.delete('/reviews/:reviewId', reviewController.deleteReview);

module.exports = router;

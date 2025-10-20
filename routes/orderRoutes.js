const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware'); 
const adminMiddleware = require('../middleware/adminMiddleware'); 

router.get('/status/:orderId',  orderController.status);

// Apply authMiddleware to ALL routes below this line
router.use(authMiddleware);

// Create an order (now requires authentication)
router.post('/', orderController.createOrder);
router.post('/createShipment', orderController.createShipment);

// Fetch an order by its ID (now requires authentication)
router.get('/:id', orderController.getOrderById);

// Fetch orders by user ID (now requires authentication)
router.get('/user/:userId', orderController.getOrdersByUserId);

// You can still apply adminMiddleware on top of authMiddleware for specific routes
router.put('/:id', adminMiddleware, orderController.updateOrder);

// The `getAllOrders` route should be admin-only
router.get('/', adminMiddleware, orderController.getAllOrders);

module.exports = router;

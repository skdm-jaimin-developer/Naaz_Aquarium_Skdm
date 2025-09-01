const express = require('express');
const router = express.Router();
const addressesController = require('../controllers/addressController');
const authMiddleware = require('../middleware/authMiddleware');

// All address routes require an authenticated user.
router.use(authMiddleware);

router.post('/', addressesController.createAddress);
router.get('/', addressesController.getAllAddresses);
router.get('/:id', addressesController.getAddressById);
router.put('/:id', addressesController.updateAddress);
router.delete('/:id', addressesController.deleteAddress);

module.exports = router;

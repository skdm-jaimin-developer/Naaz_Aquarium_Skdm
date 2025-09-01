const db = require('../models/db');


exports.createAddress = (req, res) => {
    // Check if the request body exists before destructuring
    if (!req.body) {
        return res.status(400).json({success:false, message: 'Request body is missing.' });
    }

    const { address1, address2, landmark, city, state, pincode } = req.body;
    const userId = req.userData.userId; // Get user ID from the authenticated token

    // Check for required fields
    if (!address1 || !city || !state || !pincode) {
        return res.status(400).json({success:false, message: 'Address, city, state, and pincode are required.' });
    }

    const sql = 'INSERT INTO addresses (user_id, address1, address2, landmark, city, state, pincode) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [userId, address1, address2, landmark, city, state, pincode], (err, result) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to create address.', error: err });
        }
        
        // After successfully inserting, fetch the complete address to return in the response
        const newAddressId = result.insertId;
        const fetchSql = 'SELECT id, address1, address2, landmark, city, state, pincode FROM addresses WHERE id = ?';
        db.query(fetchSql, [newAddressId], (fetchErr, newAddressResult) => {
            if (fetchErr) {
                return res.status(500).json({success:false, message: 'Address created, but failed to fetch details.', error: fetchErr });
            }
            if (newAddressResult.length === 0) {
                return res.status(404).json({success:false, message: 'Address created but not found.' });
            }
            res.status(201).json({ 
                success:true,
                message: 'Address created successfully.', 
                address: newAddressResult[0] 
            });
        });
    });
};

exports.getAllAddresses = (req, res) => {
    const userId = req.userData.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // First, get the total count of addresses for the user
    db.query('SELECT COUNT(*) AS total FROM addresses WHERE user_id = ?', [userId], (err, result) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to fetch total address count.', error: err });
        }
        const totalAddresses = result[0].total;

        // Then, get the paginated list of addresses for the user
        const sql = 'SELECT id, address1, address2, landmark, city, state, pincode FROM addresses WHERE user_id = ? LIMIT ? OFFSET ?';
        db.query(sql, [userId, limit, offset], (err, addresses) => {
            if (err) {
                return res.status(500).json({success:false, message: 'Failed to fetch addresses.', error: err });
            }

            res.status(200).json({
                success:true,
                message:"Address Fetched Successfully",
                total: totalAddresses,
                page,
                limit,
                addresses
            });
        });
    });
};

exports.getAddressById = (req, res) => {
    const userId = req.userData.userId;
    const addressId = req.params.id;

    const sql = 'SELECT id, address1, address2, landmark, city, state, pincode FROM addresses WHERE id = ? AND user_id = ?';
    db.query(sql, [addressId, userId], (err, address) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to fetch address.', error: err });
        }
        if (address.length === 0) {
            return res.status(404).json({success:false, message: 'Address not found or does not belong to the user.' });
        }
        res.status(200).json({success:true,message:"Address Fetched Successfully",address:address[0]});
    });
};


exports.updateAddress = (req, res) => {
    const userId = req.userData.userId;
    const addressId = req.params.id;
    const { address1, address2, landmark, city, state, pincode } = req.body;

    const sql = 'UPDATE addresses SET address1 = ?, address2 = ?, landmark = ?, city = ?, state = ?, pincode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
    db.query(sql, [address1, address2, landmark, city, state, pincode, addressId, userId], (err, result) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to update address.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({success:false, message: 'Address not found or does not belong to the user.' });
        }

        // Fetch the newly updated address to return in the response
        const fetchSql = 'SELECT id, address1, address2, landmark, city, state, pincode FROM addresses WHERE id = ?';
        db.query(fetchSql, [addressId], (fetchErr, updatedAddressResult) => {
            if (fetchErr) {
                return res.status(500).json({success:false, message: 'Address updated, but failed to fetch details.', error: fetchErr });
            }
            res.status(200).json({
                success:true,
                message: 'Address updated successfully.',
                address: updatedAddressResult[0]
            });
        });
    });
};

exports.deleteAddress = (req, res) => {
    const userId = req.userData.userId;
    const addressId = req.params.id;

    const sql = 'DELETE FROM addresses WHERE id = ? AND user_id = ?';
    db.query(sql, [addressId, userId], (err, result) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to delete address.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({success:false, message: 'Address not found or does not belong to the user.' });
        }
        res.status(200).json({success:true, message: 'Address deleted successfully.' });
    });
};

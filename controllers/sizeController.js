const db = require('../models/db');

exports.addSize = (req, res) => {
    const { productId } = req.params;
    // Added length, width, height, weight
    const { name, price, discount_price, stock, length, width, height, weight } = req.body; 

    // Updated required fields check
    if (!name || !price || !stock) {
        return res.status(400).json({ success: false, message: 'Size name, price, and stock are required.' });
    }

    // Updated SQL query and parameters
    const sql = 'INSERT INTO sizes (product_id, name, price, discount_price, stock, length, width, height, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(sql, [
        productId, 
        name, 
        price, 
        discount_price || null, 
        stock, 
        length || null, // Allow null if not provided
        width || null,  // Allow null if not provided
        height || null, // Allow null if not provided
        weight || null  // Allow null if not provided
    ], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to add size.', error: err });
        }
        res.status(201).json({ success: true, message: 'Size added successfully.', sizeId: result.insertId });
    });
};

exports.getSizesByProductId = (req, res) => {
    const { productId } = req.params;
    const sql = 'SELECT * FROM sizes WHERE product_id = ?';
    db.query(sql, [productId], (err, sizes) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to fetch sizes.', error: err });
        }
        res.json({ success: true, sizes });
    });
};

exports.updateSize = (req, res) => {
    const { sizeId } = req.params;
    // Added length, width, height, weight
    const { name, price, discount_price, stock, length, width, height, weight } = req.body;

    // Updated SQL query to set all new columns
    const sql = 'UPDATE sizes SET name = ?, price = ?, discount_price = ?, stock = ?, length = ?, width = ?, height = ?, weight = ? WHERE id = ?';
    db.query(sql, [
        name, 
        price, 
        discount_price || null, 
        stock, 
        length || null, 
        width || null, 
        height || null, 
        weight || null, 
        sizeId
    ], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to update size.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Size not found.' });
        }
        res.json({ success: true, message: 'Size updated successfully.' });
    });
};

exports.deleteSize = (req, res) => {
    const { sizeId } = req.params;
    const sql = 'DELETE FROM sizes WHERE id = ?';
    db.query(sql, [sizeId], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to delete size.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Size not found.' });
        }
        res.json({ success: true, message: 'Size deleted successfully.' });
    });
};







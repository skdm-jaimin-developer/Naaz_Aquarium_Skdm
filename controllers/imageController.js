const db = require('../models/db');
const path = require('path');
const fs = require('fs');

exports.addImage = (req, res) => {
    const { productId } = req.params;
    const images = req.files;

    if (!images || images.length === 0) {
        return res.status(400).json({ success: false, message: 'No images uploaded.' });
    }
    const imageValues = images.map(file => [productId, file.filename]);
    console.log("imageValues",images)
    const sql = 'INSERT INTO images (product_id, url) VALUES ?';

    db.query(sql, [imageValues], (err, result) => {
        if (err) {
            // Delete uploaded files if database insertion fails
            images.forEach(file => {
                fs.unlink(path.join(__dirname, '..', file.path), (unlinkErr) => {
                    if (unlinkErr) console.error('Failed to delete uploaded file after database error:', unlinkErr);
                });
            });
            return res.status(500).json({ success: false, message: 'Failed to add images.', error: err });
        }
        const insertedImageIds = result.insertId;
        res.status(201).json({ success: true, message: 'Images added successfully.', imageIds: insertedImageIds });
    });
};

exports.deleteImage = (req, res) => {
    const { imageId } = req.params;

    // First, get the file path from the database
    const findSql = 'SELECT url FROM images WHERE id = ?';
    db.query(findSql, [imageId], (findErr, findResult) => {
        if (findErr) {
            return res.status(500).json({ success: false, message: 'Failed to find image.', error: findErr });
        }
        if (findResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Image not found.' });
        }
        const imagePath = path.join(__dirname, 'uploads' ,'product_images', findResult[0].url);

        // Then, delete the image from the database
        const deleteSql = 'DELETE FROM images WHERE id = ?';
        db.query(deleteSql, [imageId], (deleteErr, deleteResult) => {
            if (deleteErr) {
                return res.status(500).json({ success: false, message: 'Failed to delete image from database.', error: deleteErr });
            }

            // Finally, delete the physical file from the server
            fs.unlink(imagePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Failed to delete physical image file:', unlinkErr);
                }
                res.json({ success: true, message: 'Image deleted successfully.' });
            });
        });
    });
};
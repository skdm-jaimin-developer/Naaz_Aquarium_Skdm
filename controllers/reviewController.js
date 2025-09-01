const db = require('../models/db');

exports.addReview = (req, res) => {
    const { productId } = req.params;
    const { name, review } = req.body;
    if (!name || !review) {
        return res.status(400).json({ success: false, message: 'Reviewer name and review text are required.' });
    }

    const sql = 'INSERT INTO reviews (product_id, name, review) VALUES (?, ?, ?)';
    db.query(sql, [productId, name, review], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to add review.', error: err });
        }

        // Increment no_of_reviews on the product table
        const updateProductSql = 'UPDATE products SET no_of_reviews = no_of_reviews + 1 WHERE id = ?';
        db.query(updateProductSql, [productId], (updateErr) => {
            if (updateErr) {
                console.error('Failed to update product review count:', updateErr);
            }
            res.status(201).json({ success: true, message: 'Review added successfully.', reviewId: result.insertId });
        });
    });
};

exports.getReviewsByProductId = (req, res) => {
    const { productId } = req.params;
    const sql = 'SELECT * FROM reviews WHERE product_id = ?';
    db.query(sql, [productId], (err, reviews) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to fetch reviews.', error: err });
        }
        res.json({ success: true, reviews });
    });
};

exports.deleteReview = (req, res) => {
    const { reviewId } = req.params;
    
    // First, find the product ID to decrement the review count
    const findProductSql = 'SELECT product_id FROM reviews WHERE id = ?';
    db.query(findProductSql, [reviewId], (findErr, findResult) => {
        if (findErr) {
            return res.status(500).json({ success: false, message: 'Failed to find review.', error: findErr });
        }
        if (findResult.length === 0) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }
        const productId = findResult[0].product_id;

        // Then, delete the review
        const deleteSql = 'DELETE FROM reviews WHERE id = ?';
        db.query(deleteSql, [reviewId], (deleteErr, result) => {
            if (deleteErr) {
                return res.status(500).json({ success: false, message: 'Failed to delete review.', error: deleteErr });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Review not found.' });
            }

            // Decrement no_of_reviews on the product table
            const updateProductSql = 'UPDATE products SET no_of_reviews = no_of_reviews - 1 WHERE id = ? AND no_of_reviews > 0';
            db.query(updateProductSql, [productId], (updateErr) => {
                if (updateErr) {
                    console.error('Failed to update product review count:', updateErr);
                }
                res.json({ success: true, message: 'Review deleted successfully.' });
            });
        });
    });
};
const db = require('../models/db');

function updateProductCount(productId, reviewId, res) {
    const updateProductSql = 'UPDATE products SET no_of_reviews = no_of_reviews + 1 WHERE id = ?';
    db.query(updateProductSql, [productId], (updateErr) => {
        if (updateErr) {
            console.error('Failed to update product review count:', updateErr);
        }
        res.status(201).json({
            success: true,
            message: 'Review and associated data added successfully.',
            reviewId: reviewId
        });
    });
}

exports.addReview = (req, res) => {
    const { productId } = req.params;
    const { name, review, rateStars } = req.body;
    const images = req.files;

    const userId = req.userData.userId; // Get user ID from the authenticated token
    if (!userId || !name || !review || !rateStars) {
        // Added userId check for robustness, though middleware should ensure it exists
        return res.status(400).json({
            success: false,
            message: 'Authentication failed or required fields are missing.'
        });
    }
    
    
    const parsedRateStars = parseInt(rateStars, 10);
    if (isNaN(parsedRateStars) || parsedRateStars < 1 || parsedRateStars > 5) {
        return res.status(400).json({
            success: false,
            message: 'Star rating must be a number between 1 and 5.'
        });
    }

    
    const reviewSql = 'INSERT INTO reviews (product_id, user_id, name, review, rate_stars) VALUES (?, ?, ?, ?, ?)';
    
    db.query(reviewSql, [productId, userId, name, review, parsedRateStars], (err, reviewResult) => {
        if (err) {
            console.error("Database error inserting review:", err);
            return res.status(500).json({ success: false, message: 'Failed to add review.', error: err });
        }

        const reviewId = reviewResult.insertId;

        // --- 3. Handle Image Inserts into 'review_images' table ---

        if (images && images.length > 0) {
            const imageValues = images.map(file => [reviewId, file.filename]); 
            const imageSql = 'INSERT INTO review_images (review_id, image_path) VALUES ?';

            db.query(imageSql, [imageValues], (imageErr) => {
                if (imageErr) {
                    console.error('Failed to add review images:', imageErr);
                }
                updateProductCount(productId, reviewId, res);
            });
        } else {
            // Proceed to update product count if no images were uploaded
            updateProductCount(productId, reviewId, res);
        }
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
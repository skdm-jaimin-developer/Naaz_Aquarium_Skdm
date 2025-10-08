const db = require('./db');

const Coupon = {
    // --- Create Operation (C) ---
    create: (newCoupon, productIds, callback) => {
        // 1. Insert into the main coupon table
        db.query('INSERT INTO coupons SET ?', newCoupon, (err, result) => {
            if (err) {
                return callback(err, null);
            }

            const couponId = result.insertId;

            // 2. If apply_on is 'product', insert into a linking table (e.g., coupon_products)
            if (newCoupon.apply_on === 'product' && productIds && productIds.length > 0) {
                const productValues = productIds.map(productId => [couponId, productId]);
                const insertProductsQuery = 'INSERT INTO coupon_products (coupon_id, product_id) VALUES ?';
                
                db.query(insertProductsQuery, [productValues], (err) => {
                    if (err) {
                        // Handle the error and potentially roll back the coupon creation
                        console.error("Error linking products:", err);
                        // In a real app, you would implement transaction management here.
                        return callback(err, null);
                    }
                    callback(null, { id: couponId, ...newCoupon });
                });
            } else {
                // No products to link, return success
                callback(null, { id: couponId, ...newCoupon });
            }
        });
    },

    // --- Read Operations (R) ---
    getAll: (callback) => {
        const query = `SELECT 
                c.*, 
                -- Use GROUP_CONCAT to list all product IDs for the coupon
                GROUP_CONCAT(cp.product_id) AS product_ids
            FROM 
                coupons c
            LEFT JOIN 
                coupon_products cp ON c.id = cp.coupon_id
            -- Group by the coupon ID to get one row per coupon
            GROUP BY 
                c.id
            ORDER BY 
                c.id DESC
            `;
        db.query(query, callback);
    },

    getById: (id, callback) => {
        // Query to get coupon details and associated product IDs (if any)
        const query = `
            SELECT 
                c.*, 
                GROUP_CONCAT(cp.product_id) AS product_ids
            FROM 
                coupons c
            LEFT JOIN 
                coupon_products cp ON c.id = cp.coupon_id
            WHERE 
                c.id = ?
            GROUP BY c.id
        `;
        db.query(query, [id], callback);
    },


     getByCode: (code, callback) => {
        const query = `
            SELECT 
                c.*, 
                GROUP_CONCAT(cp.product_id) AS product_ids
            FROM 
                coupons c
            LEFT JOIN 
                coupon_products cp ON c.id = cp.coupon_id
            WHERE 
                c.code = ?  -- Querying by the 'code' column
            GROUP BY c.id
        `;
        // The value passed is 'code', so we use it directly in the query parameters
        db.query(query, [code], callback); 
    },

    
    // --- Update Operation (U) ---
    update: (id, couponData, productIds, callback) => {
        // 1. Update the main coupon table
        db.query('UPDATE coupons SET ? WHERE id = ?', [couponData, id], (err, result) => {
            if (err) return callback(err, null);

            // 2. Manage linking table (This is a simplified approach, a real app may use transactions)
            // Delete existing links for this coupon
            db.query('DELETE FROM coupon_products WHERE coupon_id = ?', [id], (err) => {
                if (err) {
                    console.error("Error clearing old product links:", err);
                    return callback(err, null);
                }
                
                // If apply_on is 'product', insert new links
                if (couponData.apply_on === 'product' && productIds && productIds.length > 0) {
                    const productValues = productIds.map(productId => [id, productId]);
                    const insertProductsQuery = 'INSERT INTO coupon_products (coupon_id, product_id) VALUES ?';
                    
                    db.query(insertProductsQuery, [productValues], (err) => {
                        if (err) {
                            console.error("Error inserting new product links:", err);
                            return callback(err, null);
                        }
                        callback(null, result);
                    });
                } else {
                    callback(null, result); // Return success if no products to link
                }
            });
        });
    },

    // --- Delete Operation (D) ---
    remove: (id, callback) => {
        // Note: For tables with foreign keys (like coupon_products), 
        // using ON DELETE CASCADE on the foreign key is the cleanest way.
        // If not using CASCADE, you would need to delete from coupon_products first, then from coupons.
        
        // Assuming no ON DELETE CASCADE, let's delete manually:
        db.query('DELETE FROM coupon_products WHERE coupon_id = ?', [id], (err, result) => {
             if (err) return callback(err, null);
             
             db.query('DELETE FROM coupons WHERE id = ?', [id], callback);
        });
    }
};

module.exports = Coupon;
const CouponModel = require('../models/CouponModel');


const extractCouponData = (body) => {
    // Get product IDs and ensure it's an array
let rawProductData = body['products[]'] || body.products; // Check for both 'products[]' and 'products'
    
    // Get product IDs and ensure it's an array
    let productIds = [];
    if (body.apply_on === 'product' && rawProductData) {
        if (Array.isArray(rawProductData)) {
            // Case 1: Multiple products sent (Multer correctly makes it an array)
            productIds = rawProductData;
        } else {
            // Case 2: Only one product sent (Multer often makes it a single string)
            // We wrap the single string in an array.
            productIds = [rawProductData];
        }
        // Ensure all are treated as Numbers if needed later (optional but recommended for DB insertion)
        productIds = productIds.map(id => Number(id));
    }
    // Construct the main coupon data object for the database
    const couponData = {
        code: body.code,
        type: body.type,
        value: parseFloat(body.value),
        min_purchase: parseFloat(body.min_purchase),
        max_discount: parseFloat(body.max_discount),
        description: body.description,
        apply_on: body.apply_on,
        start_date: body.start_date, // Assumes YYYY-MM-DD from frontend
        end_date: body.end_date,     // Assumes YYYY-MM-DD from frontend
        is_active: body.is_active === '1' ? 1 : 0, // '1' or '0' string from FormData
    };
    
    return { couponData, productIds };
};


// --- CREATE Coupon ---
exports.createCoupon = (req, res) => {
    // Basic validation
    console.log(req.body)
    if (!req.body.code || !req.body.type || !req.body.value) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const { couponData, productIds } = extractCouponData(req.body);

    CouponModel.create(couponData, productIds, (err, coupon) => {
        if (err) {
            console.error('Error creating coupon:', err);
            return res.status(500).json({ message: 'Error creating coupon', error: err.message });
        }
        res.status(201).json({success:true, message: 'Coupon created successfully', data: coupon });
    });
};

// --- READ All Coupons ---
exports.getAllCoupons = (req, res) => {
    CouponModel.getAll((err, rows) => {
        if (err) {
            console.error('Error fetching coupons:', err);
            return res.status(500).json({ message: 'Error fetching coupons' });
        }
        const coupons = rows.map(coupon => {
            // Check if product_ids is a non-empty string (e.g., '101,102')
            if (coupon.product_ids) {
                // Split the string by comma and convert each element to a number
                coupon.product_ids = coupon.product_ids.split(',').map(Number);
            } else {
                // If it's NULL (no linked products), set it to an empty array
                coupon.product_ids = [];
            }
            return coupon;
        });

        res.status(200).json({ success: true, coupons });
    });
};

// --- READ Single Coupon ---
exports.getCouponById = (req, res) => {
    const id = req.params.id;

    CouponModel.getById(id, (err, rows) => {
        if (err) {
            console.error('Error fetching coupon:', err);
            return res.status(500).json({ message: 'Error fetching coupon' });
        }
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        
        const coupon = rows[0];
        // Convert product_ids string to an array of numbers
        coupon.product_ids = coupon.product_ids ? coupon.product_ids.split(',').map(Number) : [];

        res.status(200).json(coupon);
    });
};


exports.getCouponByCode = (req, res) => {
    // Assuming the coupon code is passed as a URL parameter, e.g., /api/coupons/code/:code
    const code = req.params.code; 
    console.log(code)
    CouponModel.getByCode(code, (err, rows) => {
        if (err) {
            console.error('Error fetching coupon by code:', err);
            return res.status(500).json({ success: false, message: 'Error fetching coupon' });
        }
        
        // Check if any row was returned
        if (rows.length === 0) {
            // Requirement: Send a specific message and success: false if not found
            return res.status(404).json({ 
                success: false, 
                message: 'No such coupon code available' 
            });
        }
        
        const coupon = rows[0];
        
        // Convert product_ids string to an array of numbers
        coupon.product_ids = coupon.product_ids ? coupon.product_ids.split(',').map(Number) : [];

        // Success response
        res.status(200).json({ success: true, coupon });
    });
};
// --- UPDATE Coupon ---
exports.updateCoupon = (req, res) => {
    const id = req.params.id;
    
    if (!req.body.code || !req.body.type || !req.body.value) {
        return res.status(400).json({ message: 'Missing required fields for update.' });
    }
    
    const { couponData, productIds } = extractCouponData(req.body);
    console.log(productIds)
    CouponModel.update(id, couponData, productIds, (err, result) => {
        if (err) {
            console.error('Error updating coupon:', err);
            return res.status(500).json({ message: 'Error updating coupon' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.status(200).json({success:true, message: 'Coupon updated successfully' });
    });
};

// --- DELETE Coupon ---
exports.deleteCoupon = (req, res) => {
    const id = req.params.id;

    CouponModel.remove(id, (err, result) => {
        if (err) {
            console.error('Error deleting coupon:', err);
            return res.status(500).json({ message: 'Error deleting coupon' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.status(200).json({ message: 'Coupon deleted successfully' });
    });
};
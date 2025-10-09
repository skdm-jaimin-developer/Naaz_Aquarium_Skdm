const Activity = require('../models/activityModel');
const db = require('../models/db'); // For complex joins/queries

/**
 * POST /api/activity
 * Handles creation or update of user activity (cart/checkout).
 */
const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000;
    return `https://naaz-aquarium-skdm.onrender.com/uploads/product_images/${imageName}`;
};

exports.createOrUpdateActivity = (req, res) => {
    const { user_id, product_ids, current_step } = req.body;

    if (!user_id || !product_ids || !current_step) {
        return res.status(400).json({success:false, error: 'Missing required fields: user_id, product_ids, current_step' });
    }

    // --- Step 1: Validate User ID existence ---
    Activity.checkExistence(user_id, (userErr, userExists) => {
        if (userErr) {
            console.error(userErr);
            return res.status(500).json({success:false, error: 'Database error while checking user existence.' });
        }

        if (!userExists) {
            // This is the custom application error response for the foreign key violation
            return res.status(404).json({ success:false,error: `User with ID ${user_id} not found. Cannot record activity.` });
        }

        // --- Step 2: Proceed with Activity Logic ---
        const productIdsJson = JSON.stringify(product_ids);

        Activity.findByUserId(user_id, (activityErr, results) => {
            if (activityErr) {
                console.error(activityErr);
                return res.status(500).json({success:false, error: 'Database error finding activity.' });
            }

            if (results.length > 0) {
                // Update logic
                Activity.update(user_id, productIdsJson, current_step, (updateErr, updateResults) => {
                    // ... standard error and success response ...
                    if (updateErr) {
                         console.error(updateErr);
                         return res.status(500).json({success:false, error: 'Database error updating activity.' });
                    }
                   return res.status(200).json({success:true, message: 'Activity updated successfully', user_id });
                });
            } else {
                // Create logic
                Activity.create(user_id, productIdsJson, current_step, (createErr, createResults) => {
                    // ... standard error and success response ...
                    if (createErr) {
                         console.error(createErr);
                         return res.status(500).json({success:false, error: 'Database error creating activity.' });
                    }
                   return res.status(201).json({success:true, message: 'Activity created successfully', user_id });
                });
            }
        });
    });
};

/**
 * GET /api/activity
 * Fetches all activities with user details, product details, and pagination.
 */
exports.fetchAllActivities = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // 1. Fetch paginated activity records with user details
    Activity.findAll(limit, offset, (err, activities) => {
        if (err) {
            console.error(err);
            return res.status(500).json({success:false, error: 'Database error fetching activities' });
        }

        if (activities.length === 0) {
            return res.status(200).json({success:true, data: [], page, limit, total_pages: 0, total_records: 0 });
        }

        // 2. Extract unique product IDs from all activities
        let allProductIds = new Set();
        activities.forEach(activity => {
            try {
                // Assuming product_ids is stored as a JSON string
                const ids = JSON.parse(activity.product_ids);
                ids.forEach(id => allProductIds.add(id));
            } catch (e) {
                console.error("Error parsing product_ids:", e);
            }
        });

        const productIdsArray = Array.from(allProductIds);

        // 3. Fetch product details and images for all unique product IDs
        if (productIdsArray.length === 0) {
            // If no product IDs, just return the activity and user data
            Activity.countAll((countErr, countResult) => {
                 const totalRecords = countResult[0].total_records;
                 const totalPages = Math.ceil(totalRecords / limit);
                 return res.status(200).json({success:true, data: activities, page, limit, total_pages: totalPages, total_records: totalRecords });
            });
            return;
        }

        const productDetailsQuery = `
            SELECT p.id, p.name,  i.url AS image_url
            FROM products p
            LEFT JOIN images i ON p.id = i.product_id
            WHERE p.id IN (?)
        `;

        db.query(productDetailsQuery, [productIdsArray], (prodErr, productResults) => {
            if (prodErr) {
                console.error(prodErr);
                return res.status(500).json({success:false, error: 'Database error fetching product details' });
            }

            // Map product details and images for easy lookup
            const productMap = {};
            productResults.forEach(item => {
                if (!productMap[item.id]) {
                    productMap[item.id] = {
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        images: []
                    };
                }
                if (item.image_url) {
                    productMap[item.id].images.push(getImageUrl(item.image_url));
                }
            });

            // 4. Combine activity, user, and product details
            const finalData = activities.map(activity => {
                const activityProductIds = JSON.parse(activity.product_ids || '[]');
                const detailedProducts = activityProductIds
                    .map(pid => productMap[pid])
                    .filter(p => p); // filter out products that weren't found

                return {
                    user_id: activity.user_id,
                    user_name: activity.user_name,
                    user_email: activity.user_email,
                    user_mobile: activity.user_mobile,
                    current_step: activity.current_step,
                    created_at: activity.created_at,
                    updated_at: activity.updated_at,
                    products: detailedProducts
                };
            });

            // 5. Get total count for pagination metadata
            Activity.countAll((countErr, countResult) => {
                const totalRecords = countResult[0].total_records;
                const totalPages = Math.ceil(totalRecords / limit);

                 return res.status(200).json({
                    success:true,
                    data: finalData,
                    page,
                    limit,
                    total_pages: totalPages,
                    total_records: totalRecords
                });
            });
        });
    });
};
const db = require('../models/db');


exports.getAllUsers = (req, res) => {
    // The adminMiddleware has already verified the user's role.
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // First, get the total count of users to provide to the client for pagination
    db.query('SELECT COUNT(*) AS total FROM users', (err, result) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to fetch total user count.', error: err });
        }
        const totalUsers = result[0].total;

        // Then, get the paginated list of users
        const sql = 'SELECT id, name, email, mobile, role, created_at FROM users LIMIT ? OFFSET ?';
        db.query(sql, [limit, offset], (err, users) => {
            if (err) {
                return res.status(500).json({success:false, message: 'Failed to fetch users.', error: err });
            }

            // Respond with the paginated data and the total count
            res.status(200).json({
                message:"Users Fetched Successfully",
                success:true,
                total: totalUsers,
                page,
                limit,
                users
            });
        });
    });
};

exports.getUserById = (req, res) => {
    const userId = req.params.id;

    // Check if the authenticated user is an admin or the user they're trying to view.
    if (req.userData.role !== 'admin' && req.userData.userId != userId) {
        return res.status(403).json({success:false, message: 'Forbidden: You can only view your own user data.' });
    }

    const sql = 'SELECT id, name, email, mobile, role FROM users WHERE id = ?';
    db.query(sql, [userId], (err, user) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Failed to fetch user.', error: err });
        }
        if (user.length === 0) {
            return res.status(404).json({success:false, message: 'User not found.' });
        }
        res.status(200).json({message:"User Fetched Successfully",success:true,user:user[0]});
    });
};

exports.getTableCounts = (req, res) => {
    // Single SQL query using subqueries to retrieve all counts in one go
    const sql = `
        SELECT
            (SELECT COUNT(*) FROM users) AS userCount,
            (SELECT COUNT(*) FROM products) AS productCount,
            (SELECT COUNT(*) FROM orders) AS orderCount,
            (SELECT COUNT(*) FROM categories) AS categoryCount;
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error fetching all table counts:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch table counts.',
                error: err.message
            });
        }

        // The result is an array with a single object containing all counts
        const rawCounts = result[0];

        const counts = {
            users: rawCounts.userCount,
            products: rawCounts.productCount,
            orders: rawCounts.orderCount,
            categories: rawCounts.categoryCount
        };

        res.json({ 
            success: true, 
            message: 'Table counts fetched successfully.',
            counts 
        });
    });
};
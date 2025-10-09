const db = require('./db');


exports.findByUserId = (userId, callback) => {
    const sql = 'SELECT * FROM activity WHERE user_id = ?';
    db.query(sql, [userId], callback);
};

exports.checkExistence = (userId, callback) => {
    const sql = 'SELECT id FROM users WHERE id = ? LIMIT 1';
    db.query(sql, [userId], (err, results) => {
        if (err) {
            return callback(err);
        }
        // Returns true if results.length > 0 (user found)
        callback(null, results.length > 0);
    });
};

exports.create = (userId, productIdsJson, currentStep, callback) => {
    const sql = 'INSERT INTO activity (user_id, product_ids, current_step) VALUES (?, ?, ?)';
    db.query(sql, [userId, productIdsJson, currentStep], callback);
};


exports.update = (userId, productIdsJson, currentStep, callback) => {
    const sql = 'UPDATE activity SET product_ids = ?, current_step = ?, updated_at = NOW() WHERE user_id = ?';
    db.query(sql, [productIdsJson, currentStep, userId], callback);
};


exports.findAll = (limit, offset, callback) => {
    const sql = `
        SELECT a.user_id, a.product_ids, a.current_step, a.created_at, a.updated_at,
               u.name AS user_name, u.email AS user_email , u.mobile AS user_mobile
        FROM activity a
        JOIN users u ON a.user_id = u.id
        LIMIT ? OFFSET ?;
    `;
    db.query(sql, [limit, offset], callback);
};


exports.countAll = (callback) => {
    const sql = 'SELECT COUNT(*) AS total_records FROM activity';
    db.query(sql, callback);
};
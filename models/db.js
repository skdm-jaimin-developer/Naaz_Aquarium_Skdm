const mysql = require('mysql');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error getting a connection from the pool: ' + err.stack);
        return;
    }
    console.log('Connected to the database pool. Connection id: ' + connection.threadId);
    connection.release();
});

module.exports = pool;

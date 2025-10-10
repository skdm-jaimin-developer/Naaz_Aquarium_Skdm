const mysql = require('mysql');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true 

});
const MIGRATION_FILE_PATH = path.join(__dirname, '..', 'migration.sql');

pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.');
        } else if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.');
        } else if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.');
        } else {
            console.error('Database connection error:', err);
        }
        return;
    }

    // --- Connection Success: Execute Migrations ---
    if (connection) {
        console.log('Successfully connected to the database.');

        try {
            // 1. Read the migration SQL file (Synchronous read for simplicity during startup)
            const sql = fs.readFileSync(MIGRATION_FILE_PATH, 'utf8');

            // 2. Execute the SQL statements
            // Because we set multipleStatements: true, this will run all 4-5 CREATE TABLE commands.
            connection.query(sql, (queryErr, results) => {
                connection.release(); // Release the connection immediately after use

                if (queryErr) {
                    console.error('Error executing migration SQL:', queryErr);
                    return;
                }
                console.log('All tables from migration.sql checked/created successfully.');
            });

        } catch (fileErr) {
            connection.release();
            console.error(`Error reading migration file at ${MIGRATION_FILE_PATH}:`, fileErr);
        }
    }
    console.log('Connected to the database pool. Connection id: ' + connection.threadId);
});

module.exports = pool;

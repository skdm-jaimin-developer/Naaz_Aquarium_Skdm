const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../models/db');
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

const client = new OAuth2Client(CLIENT_ID);

const isValidMobile = (mobile) => {
    // Regex for a 10-digit mobile number, with optional country code at the beginning
    const mobileRegex = /^[0-9]{10}$/;
    return mobileRegex.test(mobile);
};


exports.registerUser = async (req, res) => {
    const { name, email, password, mobile, role } = req.body;

    if (!email || !password || !name || !mobile) {
        return res.status(400).json({ success:false,message: 'All fields are required.' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success:false,message: 'Invalid email format.' });
    }
    
    if (!isValidMobile(mobile)) {
        return res.status(400).json({ success:false,message: 'Invalid mobile number format.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success:false,message: 'Password must be at least 6 characters long.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (name, email, password, mobile, role) VALUES (?, ?, ?, ?, ?)';
        db.query(sql, [name, email, hashedPassword, mobile, role || 'user'], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success:false,message: 'Email or mobile number already exists.' });
                }
                return res.status(500).json({ success:false,message: 'User registration failed.', error: err });
            }

            const userId = result.insertId;
            const token = jwt.sign({ userId, role: role || 'user' }, JWT_SECRET);

            db.query('SELECT id, name, email, mobile, role FROM users WHERE id = ?', [userId], (err, userRows) => {
                if (err) {
                    return res.status(500).json({success:false, message: 'Failed to fetch user data after registration.' });
                }
                res.status(201).json({ success:true, message: 'User registered successfully!', user: userRows[0], token });
            });
        });
    } catch (error) {
        res.status(500).json({success:false, message: 'Registration failed.', error });
    }
};


exports.loginUser = (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({success:false, message: 'Email and password are required.' });
    }

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, rows) => {
        if (err) {
            return res.status(500).json({success:false, message: 'Login failed.', error: err });
        }
        if (rows.length === 0) {
            return res.status(401).json({success:false, message: 'Invalid email or password.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({success:false, message: 'Invalid email or password.' });
        }

        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);

        delete user.password;
        res.status(200).json({success:true, message: 'Login successful!', user, token });
    });
};

exports.updateProfile = async (req, res) => {
    // Get the user ID from the authenticated request object.
    const userId = req.userData.userId;
    const { name, mobile } = req.body;

    // Build the query and values dynamically based on what's provided.
    const updates = [];
    const values = [];

    // Ensure at least one field is provided for an update.
    if (!name && !mobile) {
        return res.status(400).json({ success: false, message: 'At least one field (name or mobile) is required for update.' });
    }

    // Add name to updates if it exists
    if (name) {
        updates.push('name = ?');
        values.push(name);
    }

    // Add mobile to updates if it exists and is valid
    if (mobile) {
        // Assume isValidMobile() is a defined function that validates the mobile number format.
        if (!isValidMobile(mobile)) {
            return res.status(400).json({ success: false, message: 'Invalid mobile number format.' });
        }
        updates.push('mobile = ?');
        values.push(mobile);
    }

    // Construct the final SQL query
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    values.push(userId);

    try {
        db.query(sql, values, (err, result) => {
            if (err) {
                // Check for duplicate entry error specifically for the mobile number.
                if (err.code === 'ER_DUP_ENTRY' && err.sqlMessage.includes('mobile')) {
                    return res.status(409).json({ success: false, message: 'Mobile number is already registered to another user.' });
                }
                console.error('Database error:', err);
                return res.status(500).json({ success: false, message: 'Profile update failed.', error: err });
            }

            // Check if any rows were affected. If not, the user ID was likely not found.
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'User not found or no changes were made.' });
            }

            // After successful update, fetch the updated user data to return to the client.
            db.query('SELECT id, name, email, mobile, role FROM users WHERE id = ?', [userId], (err, userRows) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Failed to fetch updated user data.' });
                }
                if (userRows.length === 0) {
                    // This case should ideally not happen if affectedRows > 0, but is a good safeguard.
                    return res.status(404).json({ success: false, message: 'User data not found after update.' });
                }
                res.status(200).json({ success: true, message: 'Profile updated successfully!', user: userRows[0] });
            });
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Profile update failed.', error });
    }
};

exports.googleLogin = async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        return res.status(400).json({ error: 'Missing credential.' });
    }

    try {
        // 1. Verify the ID Token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload['sub'];
        const email = payload['email'];
        const name = payload['name'];
        // picture is available but not stored in your current SQL schema

        // 2. Database Transaction: Check existing user or register new user
        
        // Check 1: User exists via Google ID (Normal Login)
        const checkGoogleIdQuery = 'SELECT * FROM users WHERE google_id = ?';
        db.query(checkGoogleIdQuery, [googleId], (err, googleResults) => {
            if (err) {
                console.error('DB Error (google check):', err);
                return res.status(500).json({ error: 'Server error during login lookup.' });
            }

            if (googleResults.length > 0) {
                // User found by Google ID - Standard login path
                const user = googleResults[0];
                const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
                
                delete user.password;
                delete user.google_id;
                // Response updated to user's requested format
                return res.status(200).json({ 
                    success: true,
                    message: 'Login successful!',
                    user,
                    token: token,
                });
            }

            // Check 2: User exists via Email (Account Linking)
            const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
            db.query(checkEmailQuery, [email], (err, emailResults) => {
                if (err) {
                    console.error('DB Error (email check):', err);
                    return res.status(500).json({ error: 'Server error during email lookup.' });
                }

                if (emailResults.length > 0) {
                    // User found by email - Link the Google ID to the existing local account
                    const existingUser = emailResults[0];
                    console.log(`Linking Google ID to existing account: ${email}`);
                      return res.status(200).json({
                            success: false,
                            message: 'Account already exists with Email!'
                        });
                    
                } else {
                    // Check 3: New User Registration (Google Signup)
                    console.log(`Registering new Google user: ${email}`);

                    const newUser = { 
                        google_id: googleId, 
                        email: email, 
                        name: name,
                        password: '',    // Placeholder for NOT NULL
                        mobile: null,    // Correctly null for nullable column
                        role: 'user'     // Default role
                    };
                    
                    const insertQuery = 'INSERT INTO users SET ?';
                    db.query(insertQuery, newUser, (err, insertResult) => {
                        if (err) {
                            console.error('DB Error (registration):', err);
                            return res.status(500).json({ error: 'Server error during registration.' });
                        }
                        
                        // Create user object with local ID for token generation
                        db.query('SELECT id, name, email, mobile, role FROM users WHERE id = ?', [insertResult.insertId], (err, userRows) => {
                            if (err) {
                                return res.status(500).json({success:false, message: 'Failed to fetch user data after registration.' });
                            }
                            const token = jwt.sign({ userId : userRows[0].id, role: userRows[0].role || 'user' }, JWT_SECRET);
                            res.status(201).json({ success:true, message: 'Registration via Google successful!', user: userRows[0], token });
                        });
                        
                        // Response updated to user's requested format
                       
                    });
                }
            });
        });

    } catch (error) {
        console.error('Token Verification Failed:', error);
        res.status(401).json({ success: false, error: 'Invalid Google token or verification failed.' });
    }
};
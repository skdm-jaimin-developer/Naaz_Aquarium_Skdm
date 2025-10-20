const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../models/db');
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

const client = new OAuth2Client(CLIENT_ID);

const nodemailer = require('nodemailer');
const crypto = require('crypto');

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


const transporter = nodemailer.createTransport({
    service: 'Gmail', // Or your SMTP service
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS
    }
});

// Helper function to send the OTP email with the secure HTML template
const sendOtpEmail = (email, otp) => {
    // HTML Email Template (professional and secure)
    const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                .header { background-color: #007bff; color: white; padding: 10px; text-align: center; border-radius: 6px 6px 0 0; }
                .otp-box { background-color: #f4f4ff; border: 2px dashed #007bff; padding: 15px; text-align: center; margin: 20px 0; }
                .otp-code { font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #333; }
                .warning { color: #dc3545; font-size: 14px; margin-top: 15px; }
                .footer { font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; }
            </style>
        </head>
        <body>
        <div class="container">
            <div class="header">
                <h2>Password Reset Request</h2>
            </div>
            <p>Hi,</p>
            <p>We received a request to reset the password for your account. To proceed, please use the One-Time Password (OTP) provided below:</p>
            <div class="otp-box">
                <p style="margin-bottom: 5px; font-size: 14px;">Your Reset Code:</p>
                <div class="otp-code">${otp}</div> 
            </div>
            <p>Please enter this code on the password reset screen. <strong>This code is valid for 10 minutes.</strong></p>
            <div class="warning">
                <p><strong>Security Warning:</strong> If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged. Do not share this code with anyone.</p>
            </div>
            <div class="footer">
                <p>&copy; Your Company Name. All rights reserved.</p>
                <p>This is an automated message, please do not reply.</p>
            </div>
        </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Password Reset Code',
        html: htmlTemplate 
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.error('Error sending email:', error);
        }
        console.log('Email sent:', info.response);
    });
};

// --- 3. API Endpoints ---

// --- Step 1 & 2: Initial Request, Check Google ID, Generate & Send OTP ---
exports.forgotPassword = (req, res) => {
    const { email } = req.body;

    const query = 'SELECT id, google_id FROM users WHERE email = ?';
    db.query(query, [email], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error.' });
        
        if (results.length === 0) {
            return res.json({ success: true, message: 'If an account exists, an OTP has been sent.' });
        }

        const user = results[0];

        if (user.google_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account linked to Google. Please login via Google.' 
            });
        }

        try {
            const otp = crypto.randomInt(100000, 1000000).toString(); // Secure 6-digit OTP
            const otpHash = await bcrypt.hash(otp, 10);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

            const insertQuery = `
                INSERT INTO password_resets (user_id, otp_hash, expires_at) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE otp_hash = VALUES(otp_hash), expires_at = VALUES(expires_at)
            `;
            db.query(insertQuery, [user.id, otpHash, expiresAt], (insertErr) => {
                if (insertErr) {
                    console.error('Error storing OTP:', insertErr);
                    return res.status(500).json({ success: false, message: 'Failed to save OTP.' });
                }
                
                sendOtpEmail(email, otp);

                res.json({ success: true, message: 'OTP sent to your email.' });
            });
        } catch (e) {
            console.error('Error during OTP hashing or sending:', e);
            res.status(500).json({ success: false, message: 'Server processing error.' });
        }
    });
};

// ----------------------------------------------------------------------

// --- Step 3: Verify OTP ---
exports.verifyOtp = (req, res) => {
    const { email, otp } = req.body;

    const userQuery = 'SELECT id FROM users WHERE email = ?';
    db.query(userQuery, [email], (err, userResults) => {
        if (err || userResults.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid request or email.' });
        }
        const user_id = userResults[0].id;

        const otpQuery = 'SELECT otp_hash, expires_at FROM password_resets WHERE user_id = ?';
        db.query(otpQuery, [user_id], async (otpErr, otpResults) => {
            if (otpErr || otpResults.length === 0) {
                return res.status(400).json({ success: false, message: 'OTP not found or reset process not initiated.' });
            }

            const storedOtpData = otpResults[0];

            const isExpired = new Date() > new Date(storedOtpData.expires_at);
            if (isExpired) {
                return res.status(400).json({ success: false, message: 'OTP has expired.' });
            }

            try {
                const isMatch = await bcrypt.compare(otp, storedOtpData.otp_hash);

                if (!isMatch) {
                    return res.status(400).json({ success: false, message: 'Invalid OTP.' });
                }

                
                res.json({ 
                    success: true, 
                    message: 'OTP verified. Proceed to set your new password.', 
                    user_id: user_id, 
                    
                });
            } catch (compareError) {
                console.log(compareError)
                res.status(500).json({ success: false, message: 'Verification error.' });
            }
        });
    });
};

// ----------------------------------------------------------------------

// --- Step 4: Set New Password ---
exports.resetPassword = (req, res) => {
    const { user_id, newPassword } = req.body;

    bcrypt.hash(newPassword, 10, (hashErr, newHashedPassword) => {
        if (hashErr) {
            console.error('Error hashing password:', hashErr);
            return res.status(500).json({ success: false, message: 'Failed to process password.' });
        }

        const updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
        db.query(updateQuery, [newHashedPassword, user_id], (updateErr) => {
            if (updateErr) {
                console.error('Error updating password:', updateErr);
                return res.status(500).json({ success: false, message: 'Failed to update password.' });
            }

            const deleteQuery = 'DELETE FROM password_resets WHERE user_id = ?';
            db.query(deleteQuery, [user_id], (deleteErr) => {
                if (deleteErr) console.error('Cleanup error:', deleteErr);
            });

            res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
        });
    });
};

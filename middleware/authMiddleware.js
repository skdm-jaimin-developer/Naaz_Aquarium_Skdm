const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (req, res, next) => {
    try {
        // Get the token from the 'Authorization' header.
        const token = req.headers.authorization.split(" ")[1];
        if (!token) {
            return res.status(401).json({success:false, message: 'Authentication failed: No token provided.' });
        }
        
        // Verify the token using the secret key.
        const decodedToken = jwt.verify(token, JWT_SECRET);
        
        // Attach the user's ID and role to the request object for use in subsequent middleware and controllers.
        req.userData = { userId: decodedToken.userId, role: decodedToken.role };
        
        // Continue to the next middleware or route handler.
        next();
    } catch (error) {
        // If verification fails, return a 401 Unauthorized status.
        return res.status(401).json({success:false, message: 'Authentication failed: Invalid token.' });
    }
};

module.exports = (req, res, next) => {
    // The authMiddleware has already run and attached the user data to req.userData.
    if (req.userData.role !== 'admin') {
        // If the user is not an admin, return a 403 Forbidden status.
        return res.status(403).json({success:false, message: 'Forbidden. Admin access required.' });
    }
    
    // If the user is an admin, continue to the next middleware or route handler.
    next();
};
// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

// Middleware to authenticate user based on JWT token
const authenticateToken = (req, res, next) => {
    // Get the token from Authorization header
    const token = req.headers['authorization']?.split(' ')[1]; // "Bearer token"

    // If no token, return Unauthorized error
    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    // Verify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }

        // Attach the user to the request object for further use
        req.user = user;
        next();  // Proceed to the next middleware or route handler
    });
};

module.exports = authenticateToken;

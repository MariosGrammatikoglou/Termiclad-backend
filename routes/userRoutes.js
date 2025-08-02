// routes/userRoutes.js
const express = require('express');
const { getUsers } = require('../controllers/userController');
const authenticateToken = require('../middlewares/authMiddleware');

const router = express.Router();

// Endpoint to fetch all users
router.get('/users', authenticateToken, getUsers);

module.exports = router;

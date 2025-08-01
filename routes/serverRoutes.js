const express = require('express');
const { createServer } = require('../controllers/serverController');
const authenticateToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.post('/create-server', authenticateToken, createServer);

module.exports = router;

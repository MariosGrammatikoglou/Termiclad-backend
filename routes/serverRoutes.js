const express = require('express');
const { createServer, getServers } = require('../controllers/serverController');
const authenticateToken = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/create-server', authenticateToken, createServer);
router.get('/servers', authenticateToken, getServers);

module.exports = router;

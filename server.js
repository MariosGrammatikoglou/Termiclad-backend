// server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');
const pool = require('./models/db'); // Database connection
const authMiddleware = require('./middlewares/authMiddleware'); // Authentication middleware

// Initialize express app and HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://your-frontend-url.vercel.app"], // Frontend URLs
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Backend is running' });
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Routes
const createServerRoute = async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Server name is required' });
    }

    try {
        // Create the new server (group chat)
        const result = await pool.query(
            'INSERT INTO group_chats (name, created_by) VALUES ($1, $2) RETURNING id, name, created_by',
            [name, req.user.userId]
        );

        const group = result.rows[0];

        // Add the creator as the first member of the group
        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
            [group.id, req.user.userId]
        );

        res.status(201).json({
            message: 'Server created successfully',
            server: group
        });
    } catch (error) {
        console.error('Create server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// API to create a new server (group chat)
app.post('/api/create-server', authenticateToken, createServerRoute);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined room user_${userId}`);
    });

    socket.on('send_message', async (data) => {
        const { senderId, receiverId, message } = data;

        try {
            // Save the message to the database
            const result = await pool.query(
                'INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *',
                [senderId, receiverId, message]
            );

            const newMessage = result.rows[0];

            // Get sender's username
            const senderResult = await pool.query(
                'SELECT username FROM users WHERE id = $1',
                [senderId]
            );

            const messageWithUsername = {
                ...newMessage,
                sender_username: senderResult.rows[0].username
            };

            // Emit to receiver via socket
            io.to(`user_${receiverId}`).emit('new_message', messageWithUsername);

            // Emit back to sender for confirmation
            socket.emit('message_sent', messageWithUsername);
        } catch (error) {
            console.error('Socket send message error:', error);
            socket.emit('message_error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Server Initialization
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});

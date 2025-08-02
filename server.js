// server.js or app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/authRoutes');
const serverRoutes = require('./routes/serverRoutes');
const userRoutes = require('./routes/userRoutes'); // Import new user routes
const prisma = require('./prisma/client'); // Prisma client for DB access

const app = express();
const httpServer = createServer(app);

// Set up CORS and Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:3000', 'https://your-frontend-url.vercel.app'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', authRoutes);  // Authentication routes (login, register, etc.)
app.use('/api', serverRoutes);  // General server-related routes
app.use('/api', userRoutes);  // User-specific routes (CRUD for users, etc.)

// Health check route
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Join a room based on user ID
    socket.on('join_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined the room`);
    });

    // Handle message sending
    socket.on('send_message', async ({ senderId, receiverId, message }) => {
        try {
            // Create the message in the database
            const newMsg = await prisma.message.create({
                data: {
                    senderId,
                    receiverId,
                    message,
                },
            });

            // Get sender's username for the message payload
            const sender = await prisma.user.findUnique({
                where: { id: senderId },
                select: { username: true },
            });

            // Prepare payload
            const payload = { ...newMsg, sender_username: sender.username };

            // Emit message to the receiver
            io.to(`user_${receiverId}`).emit('new_message', payload);

            // Acknowledge the sender that the message was sent successfully
            socket.emit('message_sent', payload);
        } catch (error) {
            console.error('Socket message error:', error);
            socket.emit('message_error', { message: 'Failed to send message' });
        }
    });

    // Handle socket disconnection
    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// Start the HTTP server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/authRoutes');
const serverRoutes = require('./routes/serverRoutes');
const authenticateToken = require('./middlewares/authMiddleware');
const prisma = require('./prisma/client');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:3000", "https://your‑frontend‑url.vercel.app"],
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', serverRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_room', (userId) => socket.join(`user_${userId}`));

    socket.on('send_message', async ({ senderId, receiverId, message }) => {
        try {
            const newMsg = await prisma.message.create({ data: { senderId, receiverId, message } });
            const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { username: true } });
            const payload = { ...newMsg, sender_username: sender.username };
            io.to(`user_${receiverId}`).emit('new_message', payload);
            socket.emit('message_sent', payload);
        } catch (error) {
            console.error('Socket msg error:', error);
            socket.emit('message_error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

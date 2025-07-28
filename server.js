// backend/server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:3001"],
        methods: ["GET", "POST"]
    }
});

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Initialize database tables
const initializeDatabase = async () => {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_online BOOLEAN DEFAULT false
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id),
        receiver_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT false
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS group_chats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES group_chats(id),
        sender_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES group_chats(id),
        user_id INTEGER REFERENCES users(id),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      )
    `);

        console.log('Database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

// Routes

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user exists
        const userExists = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, passwordHash]
        );

        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET);

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT id, username, email, password_hash FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Update online status
        await pool.query(
            'UPDATE users SET is_online = true, last_seen = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET);

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (for chat list)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, is_online, last_seen FROM users WHERE id != $1 ORDER BY is_online DESC, username ASC',
            [req.user.userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get messages between two users
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `SELECT m.*, u.username as sender_username 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE (m.sender_id = $1 AND m.receiver_id = $2) 
          OR (m.sender_id = $2 AND m.receiver_id = $1) 
       ORDER BY m.timestamp ASC`,
            [req.user.userId, userId]
        );

        // Mark messages as read
        await pool.query(
            'UPDATE messages SET is_read = true WHERE sender_id = $1 AND receiver_id = $2',
            [userId, req.user.userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Send message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { receiverId, message } = req.body;

        if (!receiverId || !message) {
            return res.status(400).json({ message: 'Receiver ID and message are required' });
        }

        const result = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *',
            [req.user.userId, receiverId, message]
        );

        const newMessage = result.rows[0];

        // Emit to receiver via socket
        io.to(`user_${receiverId}`).emit('new_message', {
            ...newMessage,
            sender_username: req.user.username
        });

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined room user_${userId}`);
    });

    socket.on('send_message', async (data) => {
        try {
            const { senderId, receiverId, message } = data;

            // Save to database
            const result = await pool.query(
                'INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING *',
                [senderId, receiverId, message]
            );

            const newMessage = result.rows[0];

            // Get sender username
            const senderResult = await pool.query(
                'SELECT username FROM users WHERE id = $1',
                [senderId]
            );

            const messageWithUsername = {
                ...newMessage,
                sender_username: senderResult.rows[0].username
            };

            // Emit to receiver
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Termiclad backend is running' });
});

const PORT = process.env.PORT || 5000;

// Initialize database and start server
initializeDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`Termiclad backend running on port ${PORT}`);
    });
});
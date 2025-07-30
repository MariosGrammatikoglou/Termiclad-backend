// server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');  // To hash passwords
const { createServer } = require('http');
const { Server } = require('socket.io');
const prisma = require('./models/db'); // Prisma client connection
const authMiddleware = require('./middlewares/authMiddleware'); // Authentication middleware

// Initialize express app and HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://termiclad-frontend.vercel.app"], // Frontend URLs
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

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    console.log("Registration Request:", { username, email, password });

    if (!username || !email || !password) {
        console.log("Missing fields in registration request");
        return res.status(400).json({ message: 'All fields (username, email, password) are required' });
    }

    try {
        console.log("Checking if email exists...");
        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {
            console.log("Email already in use");
            return res.status(400).json({ message: 'Email is already in use' });
        }

        console.log("Hashing password...");
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log("Creating user...");
        const newUser = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
            },
        });

        console.log("User Created:", newUser);

        return res.status(201).json({
            message: 'User registered successfully',
            user: { id: newUser.id, username: newUser.username, email: newUser.email },
        });
    } catch (error) {
        console.error("Error during registration:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return res.status(400).json({ message: `Database error: ${error.message}` });
        }
        res.status(500).json({ message: 'Internal server error, please try again later' });
    }
});



// User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Compare the password with the stored hash
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({
            message: 'Login successful',
            user: { id: user.id, email: user.email },
            token,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create Server Route (Group chat)
const createServerRoute = async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ message: 'Server name is required' });
    }

    try {
        // Create the new server (group chat)
        const newGroup = await prisma.groupChat.create({
            data: {
                name,
                createdById: req.user.userId,
            }
        });

        // Add the creator as the first member of the group
        await prisma.groupMember.create({
            data: {
                groupId: newGroup.id,
                userId: req.user.userId
            }
        });

        res.status(201).json({
            message: 'Server created successfully',
            server: newGroup
        });
    } catch (error) {
        console.error('Create server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// API to create a new server (group chat)
app.post('/api/create-server', authMiddleware, createServerRoute);

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
            const newMessage = await prisma.message.create({
                data: {
                    senderId,
                    receiverId,
                    message,
                }
            });

            // Get sender's username
            const sender = await prisma.user.findUnique({
                where: { id: senderId }
            });

            const messageWithUsername = {
                ...newMessage,
                sender_username: sender.username
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

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

exports.register = async (req, res) => {
    const { username, email, password } = req.body;
    console.log('Register:', username, email);
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ message: 'Email already in use' });
        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, email, password: hashed }
        });
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            user: { id: user.id, username: user.username, email: user.email },
            token
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    console.log('Login:', email);
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        const matched = await bcrypt.compare(password, user.password);
        if (!matched) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({
            user: { id: user.id, username: user.username, email: user.email },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

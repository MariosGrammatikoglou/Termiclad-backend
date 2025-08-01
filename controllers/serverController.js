const prisma = require('../prisma/client');

exports.createServer = async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Server name required' });
    try {
        const group = await prisma.groupChat.create({
            data: {
                name,
                createdBy: req.user.userId,
                members: { create: { userId: req.user.userId } }
            }
        });
        res.status(201).json({ server: group, message: 'Server created' });
    } catch (error) {
        console.error('Create-server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

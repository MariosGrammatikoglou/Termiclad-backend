const prisma = require('../prisma/client');

exports.createServer = async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Server name required' });
    }

    try {
        const group = await prisma.groupChat.create({
            data: {
                name,
                createdBy: req.user.userId,
                members: {
                    create: { userId: req.user.userId }
                }
            }
        });
        res.status(201).json({ server: group });
    } catch (error) {
        console.error('Create-server error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getServers = async (req, res) => {
    try {
        const userId = req.user.userId;
        const servers = await prisma.groupChat.findMany({
            where: {
                members: {
                    some: { userId }
                }
            }
        });
        res.json({ servers });
    } catch (error) {
        console.error('Get servers error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

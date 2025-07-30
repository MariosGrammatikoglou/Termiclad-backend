// models/db.js
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client
const prisma = new PrismaClient();

// Ensure Prisma connects when server starts
async function connectToDb() {
    try {
        await prisma.$connect();
        console.log('Connected to the database');
    } catch (error) {
        console.error('Error connecting to the database:', error);
        process.exit(1); // Exit the process if connection fails
    }
}

// Call the connection function
connectToDb();

// Export prisma instance to use in other files
module.exports = prisma;

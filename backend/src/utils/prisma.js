const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool optimized for Render free tier
  connection: {
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 30000,
    },
  },
});

// Graceful shutdown - close connections on app exit
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
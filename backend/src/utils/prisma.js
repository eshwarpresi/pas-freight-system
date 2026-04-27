const { PrismaClient } = require('@prisma/client');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:sxBQLXpYkJNQFwnKUxMzZlHICroephol@shuttle.proxy.rlwy.net:30071/railway';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});

module.exports = prisma;
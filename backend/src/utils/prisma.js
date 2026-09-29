const { PrismaClient } = require('@prisma/client');

// ✅ FIX — without an explicit connection_limit, Prisma falls back to a
// default formula based on the number of CPUs it detects on the host
// machine. On a shared-CPU Render plan, that auto-detected number can be
// unpredictable and isn't necessarily a safe fit for your database's
// actual maximum connection ceiling (Starter-tier Postgres plans have a
// fairly small one). This explicitly caps how many connections THIS
// backend process will ever open at once, leaving headroom for:
//   - any other process that might connect to the same database
//     (a migration running, an admin tool, etc.)
//   - Render's own health checks
// As you grow toward more concurrent employees, this number — and your
// database plan's own limit — are the two things to revisit together.
function buildDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return base;
  const limit = process.env.DB_CONNECTION_LIMIT || '15';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}connection_limit=${limit}&pool_timeout=20`;
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: buildDatabaseUrl(),
    },
  },
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
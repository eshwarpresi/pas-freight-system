// backend/scripts/seedRefCounter.js
//
// ONE-TIME SETUP SCRIPT. Run this exactly once to seed the global
// reference number counter with the last number already in use, so the
// very next auto-generated number continues correctly from there.
//
// Usage (from the backend/ folder):
//   node scripts/seedRefCounter.js 2601
//
// This sets the counter to 2601. The NEXT generated number (whatever
// prefix is picked) will be 2602, then 2603, and so on — one shared
// counter across all prefixes (RE, SI, PIPE, ...).
//
// Safe to run only if the counter doesn't already exist — running it
// again later will NOT silently reset your counter back down; it will
// tell you the counter already exists and stop.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const startValue = parseInt(process.argv[2], 10);

  if (isNaN(startValue)) {
    console.error('❌ Please provide a starting number, e.g.: node scripts/seedRefCounter.js 2601');
    process.exit(1);
  }

  const existing = await prisma.referenceCounter.findUnique({ where: { id: 'global' } });

  if (existing) {
    console.log(`⚠️  Counter already exists with value ${existing.value}. Not overwriting.`);
    console.log('   If you really need to change it, edit it directly via Prisma Studio.');
    process.exit(0);
  }

  const created = await prisma.referenceCounter.create({
    data: { id: 'global', value: startValue }
  });

  console.log(`✅ Reference counter seeded at ${created.value}.`);
  console.log(`   The next generated reference number will use ${created.value + 1}.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
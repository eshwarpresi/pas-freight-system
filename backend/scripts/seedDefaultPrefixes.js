// backend/scripts/seedDefaultPrefixes.js
//
// ONE-TIME SETUP SCRIPT. Adds the default prefixes (RE, SI, PIPE) so the
// dropdown isn't empty on first use. Safe to run more than once — any
// prefix that already exists is skipped, never duplicated or overwritten.
//
// Usage (from the backend/ folder):
//   node scripts/seedDefaultPrefixes.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_PREFIXES = ['RE', 'SI', 'PIPE'];

async function main() {
  for (const code of DEFAULT_PREFIXES) {
    const existing = await prisma.referencePrefix.findUnique({ where: { code } });
    if (existing) {
      console.log(`⏭️  "${code}" already exists, skipping.`);
      continue;
    }
    await prisma.referencePrefix.create({ data: { code, createdBy: 'System (default seed)' } });
    console.log(`✅ Added default prefix "${code}"`);
  }
  console.log('\nDone. Default prefixes are ready in the dropdown.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  
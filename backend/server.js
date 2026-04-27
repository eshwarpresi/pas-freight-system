const app = require('./src/app');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production') {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed!');
  } catch (error) {
    console.log('Migration failed, trying reset...');
    try {
      execSync('npx prisma migrate dev --name init --skip-generate', { stdio: 'inherit' });
      execSync('npx prisma generate', { stdio: 'inherit' });
      console.log('Database reset completed!');
    } catch (err) {
      console.error('All migration attempts failed');
    }
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
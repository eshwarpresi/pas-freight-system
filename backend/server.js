const app = require('./src/app');
const { execSync } = require('child_process');

// Run Prisma migrations automatically in production
if (process.env.NODE_ENV === 'production') {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed!');
  } catch (error) {
    console.error('Migration failed:', error.message);
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
});
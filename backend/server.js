const { execSync } = require('child_process');

// Auto-migrate database on production (Render)
if (process.env.NODE_ENV === 'production') {
  console.log('Running prisma db push...');
  try {
    execSync('npx prisma db push --accept-data-loss', { 
      stdio: 'inherit',
      timeout: 60000
    });
    console.log('Database tables created!');
  } catch (e) {
    console.error('DB push error:', e.message);
  }
}

const app = require('./src/app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
});
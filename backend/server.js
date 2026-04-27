const app = require('./src/app');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 5000;

// Run migration
try {
  execSync('npx prisma migrate deploy', { 
    stdio: 'pipe',
    env: { ...process.env }
  });
} catch (e) {
  console.log('Migration note:', e.message.substring(0, 100));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
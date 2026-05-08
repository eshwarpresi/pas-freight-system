const { execSync } = require('child_process');
const https = require('https');

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

  // Self-ping every 10 minutes to prevent Render free tier sleep
  if (process.env.NODE_ENV === 'production') {
    const APP_URL = process.env.RENDER_EXTERNAL_URL || `https://pas-freight-api.onrender.com`;
    
    setInterval(() => {
      https.get(`${APP_URL}/api/freight/shipments?limit=1`, (res) => {
        console.log(`[KEEP-ALIVE] Pinged server - Status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.log(`[KEEP-ALIVE] Ping failed: ${err.message}`);
      });
    }, 10 * 60 * 1000); // Every 10 minutes

    console.log('🔄 Keep-alive ping enabled (every 10 minutes)');
  }
});
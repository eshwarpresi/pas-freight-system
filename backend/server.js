const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

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

// Create HTTP server (needed for Socket.io)
const server = http.createServer(app);

// Setup Socket.io
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://pas-freight-system.onrender.com'
    ],
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // User joins with their info
  socket.on('user:join', (userData) => {
    onlineUsers.set(socket.id, {
      name: userData.name || userData.email || 'Unknown',
      email: userData.email || '',
      connectedAt: new Date()
    });
    
    // Broadcast updated user list to everyone
    io.emit('users:update', Array.from(onlineUsers.values()));
    console.log(`👤 ${userData.name || userData.email} joined (${onlineUsers.size} online)`);
  });

  // Shipment created
  socket.on('shipment:created', (data) => {
    socket.broadcast.emit('shipment:new', data);
    console.log(`📦 New shipment broadcast: ${data.refNo}`);
  });

  // Shipment updated
  socket.on('shipment:updated', (data) => {
    socket.broadcast.emit('shipment:update', data);
    console.log(`✏️ Shipment updated broadcast: ${data.refNo}`);
  });

  // Shipment status changed
  socket.on('shipment:statusChanged', (data) => {
    socket.broadcast.emit('shipment:statusUpdate', data);
    console.log(`🔄 Status change broadcast: ${data.refNo} → ${data.status}`);
  });

  // Shipment archived/unarchived
  socket.on('shipment:archived', (data) => {
    socket.broadcast.emit('shipment:archiveUpdate', data);
    console.log(`📁 Archive update broadcast: ${data.refNo}`);
  });

  // User typing indicator (on detail page)
  socket.on('user:typing', (data) => {
    socket.broadcast.emit('user:typing', {
      ...data,
      user: onlineUsers.get(socket.id)?.name || 'Someone'
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    console.log(`🔌 User disconnected: ${user?.name || socket.id}`);
    onlineUsers.delete(socket.id);
    io.emit('users:update', Array.from(onlineUsers.values()));
  });
});

// Make io accessible to routes/controllers
app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket ready`);

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

  // ─── DAILY REPORT EMAIL SCHEDULER (NEW) ───
  // Checks every minute; when it's 18:30 IST and today's report hasn't
  // already gone out, builds and emails it. No cron dependency needed —
  // mirrors the keep-alive setInterval pattern above. lastSentDateIST
  // guards against firing more than once in the same day (the check
  // fires every minute, so without this it would only actually match
  // the 18:30 minute once anyway — but this also protects against a
  // server restart landing exactly in that minute twice).
  if (process.env.NODE_ENV === 'production') {
    const { buildDailyReport } = require('./src/controllers/freightForwarding.controller');
    const { sendDailyReportEmail } = require('./src/utils/emailService');
    const DAILY_REPORT_RECIPIENTS = ['shivu@pasfreight.com', 'prathima@pasfreight.com', 'priya.c@pasfreight.com'];
    let lastSentDateIST = null;

    setInterval(async () => {
      try {
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(Date.now() + IST_OFFSET_MS);
        const istDateStr = istNow.toISOString().split('T')[0];
        const hh = istNow.getUTCHours(); // already shifted to IST wall-clock above
        const mm = istNow.getUTCMinutes();

        if (hh === 18 && mm === 30 && lastSentDateIST !== istDateStr) {
          lastSentDateIST = istDateStr;
          console.log('📧 [DAILY REPORT] Building report for', istDateStr);
          const report = await buildDailyReport(istDateStr);
          await sendDailyReportEmail(report, DAILY_REPORT_RECIPIENTS);
        }
      } catch (err) {
        console.error('[DAILY REPORT] Failed:', err.message);
      }
    }, 60 * 1000); // check every minute

    console.log('🗓️ Daily report scheduler enabled (18:30 IST)');
  }
});
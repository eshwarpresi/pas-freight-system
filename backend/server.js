const BOOT_STARTED = Date.now();
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// Auto-migrate database on production (Render)
// Set SKIP_DB_PUSH=true in Render's environment to skip this on boot (saves
// time on every restart). Remove it again whenever you ship a schema change.
if (process.env.NODE_ENV === 'production' && process.env.SKIP_DB_PUSH !== 'true') {
  console.log('Running prisma db push...');
  const pushStarted = Date.now();
  try {
    execSync('npx prisma db push --accept-data-loss', { 
      stdio: 'inherit',
      timeout: 60000
    });
    console.log(`Database tables created! (db push took ${Math.round((Date.now() - pushStarted) / 1000)}s)`);
  } catch (e) {
    console.error('DB push error:', e.message);
  }
} else if (process.env.SKIP_DB_PUSH === 'true') {
  console.log('Skipping prisma db push (SKIP_DB_PUSH=true)');
}

const app = require('./src/app');

// A stray unhandled promise rejection crashes Node 15+ outright, which means a
// restart and a cold boot. Log it loudly instead so nothing is hidden.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ UNHANDLED REJECTION (server kept running):', reason && reason.stack ? reason.stack : reason);
});

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
require('./src/controllers/freightForwarding.controller').setSocketServer(io); // lets the server broadcast changes it makes itself

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket ready`);
  console.log(`⏱️ [BOOT] ready in ${((Date.now() - BOOT_STARTED) / 1000).toFixed(1)}s`);

  // Health heartbeat every 5 min: memory + uptime. A sudden uptime reset means
  // the server restarted; rss near 512MB means it is about to run out of memory.
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(`[HEALTH] rss=${Math.round(m.rss / 1048576)}MB heap=${Math.round(m.heapUsed / 1048576)}MB uptime=${Math.round(process.uptime() / 60)}min sockets=${io.engine?.clientsCount ?? onlineUsers.size}`);
  }, 5 * 60 * 1000);

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


  // ─── ENSURE ADMIN ACCOUNTS (NEW) ───
  // These emails are always Admin (the MD and the support account). Override
  // with env ADMIN_EMAILS="a@x.com,b@x.com" if the list ever changes.
  (async () => {
    try {
      const prisma = require('./src/utils/prisma');
      const emails = (process.env.ADMIN_EMAILS || 'shivu@pasfreight.com,support@pasfreight.com')
        .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
      const r = await prisma.user.updateMany({ where: { email: { in: emails }, NOT: { role: 'ADMIN' } }, data: { role: 'ADMIN' } });
      if (r.count) console.log(`👑 Set ${r.count} account(s) to Admin: ${emails.join(', ')}`);
    } catch (err) {
      console.error('[ADMIN] could not ensure admin accounts:', err.message);
    }
  })();

  // ─── SMART REMINDERS SCHEDULER (NEW) ───
  // Checks every 20 minutes. The sweep itself decides what is due (per
  // shipment, India time, Sundays skipped, quiet 8 PM–9 AM). Mode comes
  // from env REMINDERS_MODE: off | dry (default, logs only) | bell | live.
  {
    const { runReminderSweep } = require('./src/services/reminders.service');
    const tick = async () => {
      try { await runReminderSweep(); } catch (err) { console.error('[REMINDER] sweep failed:', err.message); }
    };
    setInterval(tick, 20 * 60 * 1000);
    setTimeout(tick, 60 * 1000); // first check one minute after boot
    console.log(`⏰ Smart reminders scheduler enabled (mode=${process.env.REMINDERS_MODE || 'dry'})`);
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

  // ─── 30-DAY AUTO-ARCHIVE SWEEP (FIXED) ───
  // Two functions now, split for performance:
  //   - archiveMaturedInvoices(): lightweight, also runs on every live
  //     request in freightForwarding.controller.js — safe, small result set.
  //   - restoreIneligibleArchives(): the heavy full-archive-table scan
  //     (retroactively un-archives anything missing required fields).
  //     This used to ALSO run on every live request, which with 1,300+
  //     archived shipments made every click on the dashboard noticeably
  //     slow. It now runs ONLY here, on schedule, never per-request.
  if (process.env.NODE_ENV === 'production') {
    const { archiveMaturedInvoices, restoreIneligibleArchives, archiveNewlyCompleted, archiveLegacyInvoiced, migrateFreightWorkflowStatuses } = require('./src/controllers/freightForwarding.controller');

    setInterval(async () => {
      try {
        await archiveMaturedInvoices();
        await restoreIneligibleArchives();
      } catch (err) {
        console.error('[AUTO-ARCHIVE] Sweep failed:', err.message);
      }
    }, 6 * 60 * 60 * 1000); // every 6 hours

    // Also run once shortly after startup, so a freshly deployed/restarted
    // server doesn't wait up to 6 hours for the first sweep.
    setTimeout(async () => {
      try {
        await archiveMaturedInvoices();
        await restoreIneligibleArchives();
        await archiveNewlyCompleted();
        await archiveLegacyInvoiced();
        await migrateFreightWorkflowStatuses();
        console.log('[AUTO-ARCHIVE] Initial sweep complete');
      } catch (err) {
        console.error('[AUTO-ARCHIVE] Initial sweep failed:', err.message);
      }
    }, 15 * 1000);

    console.log('📦 30-day auto-archive sweep enabled (every 6 hours)');
  }
});
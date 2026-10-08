const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
const app = express();

// ========== CONFIG ==========
const JWT_SECRET = process.env.JWT_SECRET || 'pas-freight-jwt-secret-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_DOMAIN = '@pasfreight.com'; // Only this domain can login

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ========== PERFORMANCE MIDDLEWARE ==========
// ✅ CORS FIX — cors() now runs FIRST, before helmet or anything else,
// so the preflight (OPTIONS) check is answered before any other
// middleware has a chance to interfere with it. Also now explicitly
// lists allowed methods/headers and adds a dedicated app.options('*', ...)
// handler — some proxy/CDN layers (Render included, occasionally on a
// cold start) don't reliably auto-answer preflight requests unless this
// is spelled out explicitly.
const corsOptions = {
  origin: ['https://pas-freight-system.onrender.com', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ explicit preflight handler for every route

// Level 1 + 1KB threshold: level 6 on every tiny response burns CPU the
// instance doesn't have. Payloads are slightly larger, responses are faster.
app.use(compression({ level: 1, threshold: 1024 }));
app.use(helmet({
  // ✅ Default helmet sets Cross-Origin-Opener-Policy: same-origin, which
  // is exactly what caused the "postMessage blocked" warning with Google
  // Sign-In's popup — this relaxes just that one header so the Google
  // popup can talk back to your main window, without weakening anything
  // else helmet does.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? ':method :url :status :response-time ms' : 'dev', {
  skip: (req) => req.originalUrl === '/api/health'
}));
// Flags any request slower than 1.5s so the log shows exactly which
// endpoints are slow (search Render logs for "SLOW").
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    if (ms > 1500) console.warn(`🐌 SLOW ${ms}ms ${req.method} ${req.originalUrl}`);
  });
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public', { maxAge: '1d' }));

// ========== AUTH MIDDLEWARE ==========
function authenticateToken(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Authentication required. Please login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Session expired. Please login again.' });
  }
}

// Optional auth - doesn't block, but adds user if token exists
function optionalAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {}
  }
  next();
}

// ========== ONLINE TRACKING MIDDLEWARE ==========
// Records "last active" for the Online Users list. It used to await a
// database WRITE on every single request (a dashboard load is 6-10
// requests), blocking each response on it. "Online" means active within
// 5 minutes, so one write per user per minute is plenty — and it no
// longer holds up the response.
const lastActivityWrite = new Map();
function trackUserActivity(req, res, next) {
  const id = req.user?.id;
  if (id) {
    const now = Date.now();
    if (now - (lastActivityWrite.get(id) || 0) > 60000) {
      lastActivityWrite.set(id, now);
      prisma.user.update({ where: { id }, data: { lastActive: new Date() } }).catch(() => {});
    }
  }
  next();
}

// ========== PUBLIC ROUTES (no auth needed) ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'PAS Freight API is running',
    timestamp: new Date().toISOString()
  });
});

// Google OAuth Login
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ status: 'error', message: 'Google credential is required' });
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    // Check if email is from allowed domain
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      return res.status(403).json({ 
        status: 'error', 
        message: `Only ${ALLOWED_DOMAIN} email addresses are allowed to access this system.` 
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: '', // No password needed for Google OAuth
          role: 'OPERATIONS'
        }
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      }
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ status: 'error', message: 'Invalid Google credential' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, lastActive: true, createdAt: true }
    });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
    res.json({ status: 'success', data: user });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to get user' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ status: 'success', message: 'Logged out successfully' });
});

// Get online users count
app.get('/api/users/online', authenticateToken, async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineUsers = await prisma.user.findMany({
      where: { lastActive: { gte: fiveMinutesAgo } },
      select: { id: true, name: true, email: true, lastActive: true }
    });
    res.json({ 
      status: 'success', 
      data: { count: onlineUsers.length, users: onlineUsers }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to get online users' });
  }
});

// ========== PROTECTED ROUTES (auth required) ==========

// Import Routes
const freightForwardingRoutes = require('./routes/freightForwarding.routes');
const chaRoutes = require('./routes/cha.routes');
const accountsRoutes = require('./routes/accounts.routes');
const archiveRoutes = require('./routes/archive.routes');
const notificationRoutes = require('./routes/notification.routes');
const checklistRoutes = require('./routes/checklist.routes');
const deliveryChallanRoutes = require('./routes/deliveryChallan.routes'); // ✅ NEW

// Apply auth + tracking middleware to ALL shipment routes
// Any successful change to shipment data throws away the cached dashboard numbers
// straight away, so the next refresh shows the truth instead of up to 8 seconds
// of stale counts.
const { clearStatsCache } = require('./controllers/freightForwarding.controller');
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', () => { if (res.statusCode < 400) clearStatsCache(); });
  }
  next();
});
app.use('/api/freight', authenticateToken, trackUserActivity, freightForwardingRoutes);
app.use('/api/cha', authenticateToken, trackUserActivity, chaRoutes);
app.use('/api/accounts', authenticateToken, trackUserActivity, accountsRoutes);
// Restoring a shipment from Archive clears its "completed" stamp first, so the
// automatic archiver treats it as open work again instead of moving it straight
// back to Archive a minute later.
app.put('/api/archive/shipments/:id/unarchive', authenticateToken, async (req, res, next) => {
  try {
    await prisma.shipment.update({ where: { id: req.params.id }, data: { accounts: { update: { completedAt: null } } } });
  } catch (e) { /* no accounts record, or already clear — nothing to do */ }
  next();
});
app.use('/api/archive', authenticateToken, trackUserActivity, archiveRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/reminders', authenticateToken, trackUserActivity, require('./routes/reminders.routes')); // ✅ NEW — smart reminders
app.use('/api/checklist', authenticateToken, checklistRoutes);
app.use('/api/delivery-challan', authenticateToken, deliveryChallanRoutes); // ✅ NEW

// ========== ERROR HANDLERS ==========
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Something went wrong!' });
});

module.exports = app;
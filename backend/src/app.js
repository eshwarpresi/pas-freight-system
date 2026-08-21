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
app.use(compression({ level: 6, threshold: 100 }));
app.use(helmet());
app.use(cors({
  origin: ['https://pas-freight-system.onrender.com', 'http://localhost:5173'],
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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
async function trackUserActivity(req, res, next) {
  if (req.user?.id) {
    try {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { lastActive: new Date() }
      }).catch(() => {}); // Silently fail if user doesn't exist yet
    } catch (err) {}
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
app.use('/api/freight', authenticateToken, trackUserActivity, freightForwardingRoutes);
app.use('/api/cha', authenticateToken, trackUserActivity, chaRoutes);
app.use('/api/accounts', authenticateToken, trackUserActivity, accountsRoutes);
app.use('/api/archive', authenticateToken, trackUserActivity, archiveRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
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
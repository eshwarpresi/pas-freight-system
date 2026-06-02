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

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ========== PERFORMANCE MIDDLEWARE ==========
app.use(compression({ level: 6, threshold: 100 }));
app.use(helmet());
app.use(cors({
  origin: ['https://pas-freight-system.onrender.com', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public', { maxAge: '1d' }));

// ========== AUTH MIDDLEWARE ==========
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.cookies?.token || (authHeader ? authHeader.split(' ')[1] : null);
  
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

// Optional auth
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.cookies?.token || (authHeader ? authHeader.split(' ')[1] : null);
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (err) {}
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
      }).catch(() => {});
    } catch (err) {}
  }
  next();
}

// ========== PUBLIC ROUTES (no auth needed) ==========

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

    console.log('🔐 Login attempt:', email);

    // ✅ ALLOW ALL @pasfreight.com emails (removed strict domain check)
    // If you want to restrict, uncomment below:
    // if (!email.endsWith('@pasfreight.com')) {
    //   return res.status(403).json({ status: 'error', message: 'Only @pasfreight.com emails allowed' });
    // }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: '',
          role: 'OPERATIONS'
        }
      });
      console.log('👤 New user created:', email);
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
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    console.log('✅ Login success:', email);

    res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      }
    });

  } catch (error) {
    console.error('❌ Google auth error:', error.message);
    res.status(401).json({ status: 'error', message: 'Invalid Google credential. Please try again.' });
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

const freightForwardingRoutes = require('./routes/freightForwarding.routes');
const chaRoutes = require('./routes/cha.routes');
const accountsRoutes = require('./routes/accounts.routes');
const archiveRoutes = require('./routes/archive.routes');
const notificationRoutes = require('./routes/notification.routes');

app.use('/api/freight', authenticateToken, trackUserActivity, freightForwardingRoutes);
app.use('/api/cha', authenticateToken, trackUserActivity, chaRoutes);
app.use('/api/accounts', authenticateToken, trackUserActivity, accountsRoutes);
app.use('/api/archive', authenticateToken, trackUserActivity, archiveRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);

// ========== ERROR HANDLERS ==========
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Something went wrong!' });
});

module.exports = app;
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

// Import Routes
const freightForwardingRoutes = require('./routes/freightForwarding.routes');
const chaRoutes = require('./routes/cha.routes');
const accountsRoutes = require('./routes/accounts.routes');
const archiveRoutes = require('./routes/archive.routes');

const app = express();

// ========== PERFORMANCE MIDDLEWARE ==========
// Gzip compression - reduces response size by 60-80%
app.use(compression({ level: 6, threshold: 100 }));

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Logging - use 'combined' in production, 'dev' in development
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file caching (if you serve any static files)
app.use(express.static('public', { maxAge: '1d' }));

// Test Route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'PAS Freight API is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/freight', freightForwardingRoutes);
app.use('/api/cha', chaRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/archive', archiveRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

module.exports = app;
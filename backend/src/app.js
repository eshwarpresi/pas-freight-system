const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import Routes
const freightForwardingRoutes = require('./routes/freightForwarding.routes');
const chaRoutes = require('./routes/cha.routes');
const accountsRoutes = require('./routes/accounts.routes');
const archiveRoutes = require('./routes/archive.routes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!'
  });
});

module.exports = app;
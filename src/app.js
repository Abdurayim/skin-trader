const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { requestLogger } = require('./utils/logger');
const { languageMiddleware, userLanguageMiddleware } = require('./middlewares/language');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/errorHandler');
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const { sanitizeBody } = require('./middlewares/validation');

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Allow popups (Google OAuth) to postMessage back to the opener window
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
const corsOrigins = corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim());
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  // credentials only valid when specific origins are set (not wildcard)
  credentials: corsOrigin !== '*'
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize request body
app.use(sanitizeBody);

// Request logging
app.use(requestLogger);

// Debug middleware - log all incoming requests
app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url} - Headers:`, {
    contentType: req.get('content-type'),
    authorization: req.get('authorization') ? 'Present' : 'Missing'
  });
  next();
});

// Language detection
app.use(languageMiddleware);

// Block direct access to KYC uploads (served via authenticated admin endpoint)
app.use('/uploads/kyc', (req, res) => {
  res.status(403).json({ success: false, message: 'Access denied' });
});

// Static files for uploads
app.use('/uploads', express.static(path.join(process.cwd(), config.upload.uploadDir)));

// Rate limiting for API routes
app.use('/api', apiRateLimiter);

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SkinTrader API',
    version: '1.0.0',
    docs: '/api/v1/health'
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

module.exports = app;

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // Database
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/skintrader'
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d'
  },

  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    certUrl: process.env.FIREBASE_CERT_URL
  },

  // Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024, // 5MB
    maxFiles: parseInt(process.env.MAX_FILES, 10) || 5,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    uploadDir: process.env.UPLOAD_DIR || 'uploads'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    otpMax: parseInt(process.env.OTP_RATE_LIMIT_MAX, 10) || 5
  },

  // Cache TTL (in seconds)
  cache: {
    postsTTL: parseInt(process.env.CACHE_POSTS_TTL, 10) || 300, // 5 minutes
    gamesTTL: parseInt(process.env.CACHE_GAMES_TTL, 10) || 3600, // 1 hour
    userTTL: parseInt(process.env.CACHE_USER_TTL, 10) || 600 // 10 minutes
  },

  // Pagination
  pagination: {
    defaultLimit: parseInt(process.env.DEFAULT_PAGE_LIMIT, 10) || 20,
    maxLimit: parseInt(process.env.MAX_PAGE_LIMIT, 10) || 100
  },

  // Supported languages
  languages: ['en', 'ru', 'uz'],
  defaultLanguage: 'en',

  // Supported currencies
  currencies: ['UZS', 'USD'],
  defaultCurrency: 'UZS',

  // KYC
  kyc: {
    maxIdSize: 10 * 1024 * 1024, // 10MB for ID documents
    faceMatchThreshold: 0.6 // 60% confidence for face match
  }
};

// Validate required environment variables in production
if (config.env === 'production') {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = config;

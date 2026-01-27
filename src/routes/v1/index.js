const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const userRoutes = require('./users');
const postRoutes = require('./posts');
const gameRoutes = require('./games');
const messageRoutes = require('./messages');
const adminRoutes = require('./admin');

// API Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SkinTrader API is running',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/games', gameRoutes);
router.use('/messages', messageRoutes);
router.use('/admin', adminRoutes);

module.exports = router;

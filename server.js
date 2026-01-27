require('dotenv').config();

const app = require('./src/app');
const config = require('./src/config');
const connectDatabase = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { initializeFirebase } = require('./src/config/firebase');
const logger = require('./src/utils/logger');
const { handleUncaughtException, handleUnhandledRejection } = require('./src/middlewares/errorHandler');

// Handle uncaught exceptions
handleUncaughtException();

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Connect to Redis
    const redis = connectRedis();
    await redis.connect();

    // Initialize Firebase (lazy initialization, will be done on first use)
    // initializeFirebase();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running in ${config.env} mode on port ${config.port}`);
      logger.info(`API available at http://localhost:${config.port}/api/v1`);
    });

    // Handle unhandled promise rejections
    handleUnhandledRejection(server);

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close Redis connection
          const { disconnectRedis } = require('./src/config/redis');
          await disconnectRedis();

          // Close MongoDB connection
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

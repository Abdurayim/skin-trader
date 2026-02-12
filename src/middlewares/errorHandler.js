const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');
const config = require('../config');

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found error handler (404)
 */
const notFoundHandler = (req, res, next) => {
  console.log(`[404 ERROR] ${req.method} ${req.originalUrl}`, {
    baseUrl: req.baseUrl,
    path: req.path,
    params: req.params,
    query: req.query
  });
  const error = new AppError(`Not found: ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
};

/**
 * Global error handler
 */
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log error
  if (err.statusCode >= 500 || !err.isOperational) {
    logger.error({
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.userId || req.adminId,
      body: config.env === 'development' ? req.body : undefined
    }, 'Server error');
  } else {
    logger.warn({
      message: err.message,
      url: req.originalUrl,
      method: req.method,
      statusCode: err.statusCode
    }, 'Client error');
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = new AppError('Invalid ID format', 400, 'INVALID_ID');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`${field} already exists`, 409, 'DUPLICATE_KEY');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    error = new AppError('Validation failed', 422, 'VALIDATION_ERROR', errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  }

  // Multer errors
  if (err.name === 'MulterError') {
    error = new AppError(`Upload error: ${err.message}`, 400, 'UPLOAD_ERROR');
  }

  // Default to 500 if no status code
  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || 'Internal server error';
  const errorCode = error.errorCode || err.errorCode || 'INTERNAL_ERROR';

  const response = {
    success: false,
    message,
    errorCode
  };

  if (error.errors) {
    response.errors = error.errors;
  }

  // Include stack trace in development
  if (config.env === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.fatal({
      message: err.message,
      stack: err.stack
    }, 'UNCAUGHT EXCEPTION! Shutting down...');

    process.exit(1);
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = (server) => {
  process.on('unhandledRejection', (err) => {
    logger.fatal({
      message: err.message,
      stack: err.stack
    }, 'UNHANDLED REJECTION! Shutting down...');

    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
};

module.exports = {
  AppError,
  notFoundHandler,
  globalErrorHandler,
  asyncHandler,
  handleUncaughtException,
  handleUnhandledRejection
};

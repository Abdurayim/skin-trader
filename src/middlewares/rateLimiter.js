const { getRedisClient } = require('../config/redis');
const config = require('../config');
const { tooManyRequestsResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Redis-based rate limiter
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = config.rateLimit.windowMs,
    max = config.rateLimit.max,
    keyPrefix = 'rl:',
    message = 'Too many requests, please try again later',
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress
  } = options;

  return async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const key = `${keyPrefix}${keyGenerator(req)}`;
      const windowSecs = Math.floor(windowMs / 1000);

      const multi = redis.multi();
      multi.incr(key);
      multi.expire(key, windowSecs);
      const results = await multi.exec();

      const current = results[0][1];

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - current),
        'X-RateLimit-Reset': Date.now() + windowMs
      });

      if (current > max) {
        return tooManyRequestsResponse(res, message);
      }

      // Track successful vs failed requests
      if (skipFailedRequests) {
        res.on('finish', async () => {
          if (res.statusCode >= 400) {
            try {
              await redis.decr(key);
            } catch (err) {
              logger.error('Rate limiter decrement error:', err);
            }
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      // On Redis error, allow request but log
      next();
    }
  };
};

/**
 * Strict rate limiter for sensitive endpoints (OTP, login)
 */
const strictRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyPrefix: 'rl:strict:',
  message: 'Too many attempts. Please wait 15 minutes before trying again.'
});

/**
 * Standard API rate limiter
 */
const apiRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  keyPrefix: 'rl:api:'
});

/**
 * Search rate limiter
 */
const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyPrefix: 'rl:search:'
});

/**
 * Upload rate limiter
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  keyPrefix: 'rl:upload:',
  message: 'Too many uploads. Please wait before uploading more files.'
});

/**
 * Message rate limiter
 */
const messageRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyPrefix: 'rl:msg:',
  message: 'Too many messages. Please slow down.'
});

/**
 * Admin rate limiter
 */
const adminRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  keyPrefix: 'rl:admin:'
});

/**
 * Sliding window rate limiter (more accurate but uses more memory)
 */
const slidingWindowLimiter = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    max = 60,
    keyPrefix = 'rl:sw:'
  } = options;

  return async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const key = `${keyPrefix}${req.ip}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries
      await redis.zremrangebyscore(key, '-inf', windowStart);

      // Count current entries
      const count = await redis.zcard(key);

      if (count >= max) {
        res.set({
          'X-RateLimit-Limit': max,
          'X-RateLimit-Remaining': 0,
          'Retry-After': Math.ceil(windowMs / 1000)
        });
        return tooManyRequestsResponse(res, 'Too many requests');
      }

      // Add current request
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, Math.ceil(windowMs / 1000));

      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': max - count - 1
      });

      next();
    } catch (error) {
      logger.error('Sliding window rate limiter error:', error);
      next();
    }
  };
};

module.exports = {
  createRateLimiter,
  strictRateLimiter,
  apiRateLimiter,
  searchRateLimiter,
  uploadRateLimiter,
  messageRateLimiter,
  adminRateLimiter,
  slidingWindowLimiter
};

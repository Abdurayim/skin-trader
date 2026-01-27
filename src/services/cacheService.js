const { getRedisClient } = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { CACHE_KEYS } = require('../utils/constants');

/**
 * Redis Cache Service
 * Provides caching functionality for improved performance
 */
class CacheService {
  constructor() {
    this.redis = null;
    this.defaultTTL = 300; // 5 minutes
  }

  /**
   * Get Redis client (lazy initialization)
   */
  getClient() {
    if (!this.redis) {
      this.redis = getRedisClient();
    }
    return this.redis;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON stringified)
   * @param {number} ttl - Time to live in seconds
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const client = this.getClient();
      const serialized = JSON.stringify(value);

      if (ttl > 0) {
        await client.setex(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }

      return true;
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {any} Parsed value or null
   */
  async get(key) {
    try {
      const client = this.getClient();
      const value = await client.get(key);

      if (!value) return null;

      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Delete cache key
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      const client = this.getClient();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   * @param {string} pattern - Pattern to match keys
   */
  async delByPattern(pattern) {
    try {
      const client = this.getClient();
      const keys = await client.keys(pattern);

      if (keys.length > 0) {
        await client.del(...keys);
      }

      return true;
    } catch (error) {
      logger.error('Cache delete by pattern error:', { pattern, error: error.message });
      return false;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   */
  async exists(key) {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get or set cache (cache-aside pattern)
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   */
  async getOrSet(key, fetchFn, ttl = this.defaultTTL) {
    try {
      // Try to get from cache
      const cached = await this.get(key);

      if (cached !== null) {
        return cached;
      }

      // Fetch fresh data
      const data = await fetchFn();

      // Cache the result
      if (data !== null && data !== undefined) {
        await this.set(key, data, ttl);
      }

      return data;
    } catch (error) {
      logger.error('Cache getOrSet error:', { key, error: error.message });
      // On cache error, still try to fetch
      return fetchFn();
    }
  }

  /**
   * Increment value
   * @param {string} key - Cache key
   */
  async incr(key) {
    try {
      const client = this.getClient();
      return await client.incr(key);
    } catch (error) {
      logger.error('Cache incr error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set expiration on key
   * @param {string} key - Cache key
   * @param {number} seconds - TTL in seconds
   */
  async expire(key, seconds) {
    try {
      const client = this.getClient();
      await client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', { key, error: error.message });
      return false;
    }
  }

  // Specific cache methods for the application

  /**
   * Cache games list
   */
  async cacheGamesList(games) {
    return this.set(CACHE_KEYS.GAMES_LIST, games, config.cache.gamesTTL);
  }

  /**
   * Get cached games list
   */
  async getCachedGamesList() {
    return this.get(CACHE_KEYS.GAMES_LIST);
  }

  /**
   * Cache single game
   */
  async cacheGame(gameId, game) {
    return this.set(`${CACHE_KEYS.GAME_BY_ID}${gameId}`, game, config.cache.gamesTTL);
  }

  /**
   * Get cached game
   */
  async getCachedGame(gameId) {
    return this.get(`${CACHE_KEYS.GAME_BY_ID}${gameId}`);
  }

  /**
   * Cache post
   */
  async cachePost(postId, post) {
    return this.set(`${CACHE_KEYS.POST_BY_ID}${postId}`, post, config.cache.postsTTL);
  }

  /**
   * Get cached post
   */
  async getCachedPost(postId) {
    return this.get(`${CACHE_KEYS.POST_BY_ID}${postId}`);
  }

  /**
   * Invalidate post cache
   */
  async invalidatePost(postId) {
    await this.del(`${CACHE_KEYS.POST_BY_ID}${postId}`);
    // Also invalidate list caches
    await this.delByPattern(`${CACHE_KEYS.POSTS_LIST}*`);
  }

  /**
   * Cache user profile
   */
  async cacheUserProfile(userId, profile) {
    return this.set(`${CACHE_KEYS.USER_PROFILE}${userId}`, profile, config.cache.userTTL);
  }

  /**
   * Get cached user profile
   */
  async getCachedUserProfile(userId) {
    return this.get(`${CACHE_KEYS.USER_PROFILE}${userId}`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(userId) {
    await this.del(`${CACHE_KEYS.USER_PROFILE}${userId}`);
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(query, results) {
    const key = `${CACHE_KEYS.SEARCH_RESULTS}${Buffer.from(JSON.stringify(query)).toString('base64')}`;
    return this.set(key, results, 60); // 1 minute cache for search
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(query) {
    const key = `${CACHE_KEYS.SEARCH_RESULTS}${Buffer.from(JSON.stringify(query)).toString('base64')}`;
    return this.get(key);
  }

  /**
   * Flush all cache
   */
  async flushAll() {
    try {
      const client = this.getClient();
      await client.flushdb();
      logger.info('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Get cache stats
   */
  async getStats() {
    try {
      const client = this.getClient();
      const info = await client.info('memory');
      const dbSize = await client.dbsize();

      return {
        memoryInfo: info,
        keys: dbSize
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }
}

// Export singleton instance
const cacheService = new CacheService();

module.exports = cacheService;

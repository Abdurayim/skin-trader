const cron = require('node-cron');
const { User, Subscription } = require('../models');
const { SUBSCRIPTION_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Subscription Cleanup Service
 * Runs daily to handle subscription expirations and grace periods
 */

class SubscriptionCleanupService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  /**
   * Start the cleanup service
   * Runs daily at 00:00 UTC
   */
  start() {
    if (this.cronJob) {
      logger.warn('Subscription cleanup service is already running');
      return;
    }

    // Run every day at 00:00 UTC
    // Cron format: second minute hour day month weekday
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      await this.runCleanup();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    logger.info('Subscription cleanup service started (daily at 00:00 UTC)');

    // Run once on startup (for testing/immediate execution)
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Running cleanup on startup (non-production mode)');
      setTimeout(() => this.runCleanup(), 5000); // Run after 5 seconds
    }
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Subscription cleanup service stopped');
    }
  }

  /**
   * Run the cleanup process
   */
  async runCleanup() {
    if (this.isRunning) {
      logger.warn('Cleanup already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Starting subscription cleanup process...');

      // Step 1: Expire active subscriptions that have passed their end date
      const expiredCount = await this.expireSubscriptions();

      // Step 2: Handle users in grace period that have exceeded grace period
      const gracePeriodExpiredCount = await this.expireGracePeriods();

      const duration = Date.now() - startTime;
      logger.info('Subscription cleanup completed', {
        expiredSubscriptions: expiredCount,
        expiredGracePeriods: gracePeriodExpiredCount,
        durationMs: duration
      });
    } catch (error) {
      logger.error('Error during subscription cleanup:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Expire subscriptions that have passed their end date
   * Move users to grace period
   */
  async expireSubscriptions() {
    const now = new Date();
    const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS) || 3;

    // Find all active subscriptions that have passed their end date
    const expiredSubscriptions = await Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $lte: now }
    });

    if (expiredSubscriptions.length === 0) {
      logger.info('No subscriptions to expire');
      return 0;
    }

    let count = 0;
    for (const subscription of expiredSubscriptions) {
      try {
        // Update subscription status
        subscription.status = SUBSCRIPTION_STATUS.EXPIRED;
        subscription.gracePeriodStarted = now;
        await subscription.save();

        // Update user status - move to grace period
        const user = await User.findById(subscription.userId);
        if (user) {
          user.subscriptionStatus = SUBSCRIPTION_STATUS.GRACE_PERIOD;
          user.gracePeriodEndsAt = new Date(
            now.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000)
          );
          await user.save();

          logger.info(`User ${user._id} moved to grace period (${gracePeriodDays} days)`, {
            subscriptionId: subscription._id,
            gracePeriodEnds: user.gracePeriodEndsAt
          });
        }

        count++;
      } catch (error) {
        logger.error(`Failed to expire subscription ${subscription._id}:`, error);
      }
    }

    logger.info(`Expired ${count} subscriptions and moved users to grace period`);
    return count;
  }

  /**
   * Expire grace periods that have exceeded the grace period duration
   */
  async expireGracePeriods() {
    const now = new Date();

    // Find all users in grace period that have exceeded the grace period
    const expiredGracePeriodUsers = await User.find({
      subscriptionStatus: SUBSCRIPTION_STATUS.GRACE_PERIOD,
      gracePeriodEndsAt: { $lte: now }
    });

    if (expiredGracePeriodUsers.length === 0) {
      logger.info('No grace periods to expire');
      return 0;
    }

    let count = 0;
    for (const user of expiredGracePeriodUsers) {
      try {
        // Update user status
        user.subscriptionStatus = SUBSCRIPTION_STATUS.EXPIRED;
        user.gracePeriodEndsAt = null; // Clear grace period end date
        await user.save();

        logger.info(`User ${user._id} grace period expired`, {
          previousGracePeriodEnd: user.gracePeriodEndsAt
        });

        count++;
      } catch (error) {
        logger.error(`Failed to expire grace period for user ${user._id}:`, error);
      }
    }

    logger.info(`Expired ${count} grace periods`);
    return count;
  }

  /**
   * Manual trigger for cleanup (for testing or manual execution)
   */
  async triggerCleanup() {
    logger.info('Manual cleanup triggered');
    await this.runCleanup();
  }
}

// Create singleton instance
const subscriptionCleanupService = new SubscriptionCleanupService();

module.exports = subscriptionCleanupService;

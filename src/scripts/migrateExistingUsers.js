require('dotenv').config();

const mongoose = require('mongoose');
const { User, Subscription } = require('../models');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLAN, KYC_STATUS } = require('../utils/constants');
const connectDatabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Migration Script: Grant Free Subscriptions to Existing Users
 *
 * This script grants a 30-day free subscription to all existing KYC-verified users
 * to ensure a smooth transition to the subscription-based system.
 *
 * Usage: node src/scripts/migrateExistingUsers.js
 */

async function migrateExistingUsers() {
  try {
    console.log('='.repeat(60));
    console.log('SUBSCRIPTION MIGRATION SCRIPT');
    console.log('='.repeat(60));
    console.log('');

    // Connect to database
    await connectDatabase();
    console.log('✓ Connected to database');
    console.log('');

    // Get migration parameters from environment
    const durationDays = parseInt(process.env.SUBSCRIPTION_DURATION_DAYS) || 30;
    console.log(`Migration Parameters:`);
    console.log(`- Free subscription duration: ${durationDays} days`);
    console.log('');

    // Find all users who:
    // 1. Have KYC verified
    // 2. Don't have an active subscription
    const query = {
      kycStatus: KYC_STATUS.VERIFIED,
      subscriptionStatus: { $in: [null, SUBSCRIPTION_STATUS.NONE, SUBSCRIPTION_STATUS.EXPIRED] }
    };

    const existingUsers = await User.find(query);

    if (existingUsers.length === 0) {
      console.log('No users found that need migration.');
      console.log('');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`Found ${existingUsers.length} users to migrate:`);
    console.log('');

    // Ask for confirmation (skip in CI/non-interactive environments)
    if (process.stdin.isTTY) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question(
          `Do you want to grant free subscriptions to ${existingUsers.length} users? (yes/no): `,
          resolve
        );
      });

      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('Migration cancelled.');
        await mongoose.connection.close();
        process.exit(0);
      }
      console.log('');
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    console.log('Starting migration...');
    console.log('');

    for (let i = 0; i < existingUsers.length; i++) {
      const user = existingUsers[i];

      try {
        // Calculate dates
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + (durationDays * 24 * 60 * 60 * 1000));

        // Create subscription
        const subscription = new Subscription({
          userId: user._id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startDate,
          endDate,
          plan: SUBSCRIPTION_PLAN.MONTHLY,
          autoRenew: false
        });
        await subscription.save();

        // Update user
        user.subscriptionStatus = SUBSCRIPTION_STATUS.ACTIVE;
        user.currentSubscriptionId = subscription._id;
        user.subscriptionExpiresAt = endDate;
        user.gracePeriodEndsAt = null;
        await user.save();

        successCount++;

        // Show progress every 10 users
        if ((i + 1) % 10 === 0 || i === existingUsers.length - 1) {
          console.log(`Progress: ${i + 1}/${existingUsers.length} users processed`);
        }

      } catch (error) {
        errorCount++;
        errors.push({
          userId: user._id,
          phoneNumber: user.phoneNumber,
          error: error.message
        });
        console.error(`✗ Error migrating user ${user._id}: ${error.message}`);
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log(`✓ Successfully migrated: ${successCount} users`);

    if (errorCount > 0) {
      console.log(`✗ Failed to migrate: ${errorCount} users`);
      console.log('');
      console.log('Errors:');
      errors.forEach((err, index) => {
        console.log(`${index + 1}. User ${err.userId} (${err.phoneNumber}): ${err.error}`);
      });
    }

    console.log('');
    console.log('Next Steps:');
    console.log('1. Notify users about the new subscription system via email/SMS');
    console.log('2. Monitor subscription expirations in 30 days');
    console.log('3. Ensure PayMe integration is properly configured');
    console.log('');

    // Log to application logger
    logger.info('User migration completed', {
      totalUsers: existingUsers.length,
      successCount,
      errorCount,
      durationDays
    });

  } catch (error) {
    console.error('');
    console.error('FATAL ERROR during migration:');
    console.error(error);
    logger.error('Migration failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
    console.log('');
  }
}

// Run migration
migrateExistingUsers().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

const { User, Subscription, Transaction } = require('../models');
const paymeService = require('../services/paymeService');
const { SUBSCRIPTION_STATUS, TRANSACTION_STATUS, CURRENCIES } = require('../utils/constants');
const { successResponse, createdResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Get current subscription status
 * GET /api/v1/subscriptions/status
 */
const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).select(
    'subscriptionStatus currentSubscriptionId subscriptionExpiresAt gracePeriodEndsAt'
  );

  let subscription = null;
  if (user.currentSubscriptionId) {
    subscription = await Subscription.findById(user.currentSubscriptionId);
  }

  const response = {
    subscriptionStatus: user.subscriptionStatus || SUBSCRIPTION_STATUS.NONE,
    hasActiveSubscription: user.hasActiveSubscription(),
    isInGracePeriod: user.isInGracePeriod(),
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    gracePeriodEndsAt: user.gracePeriodEndsAt,
    subscription: subscription ? {
      _id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      autoRenew: subscription.autoRenew,
      daysRemaining: subscription.daysRemaining()
    } : null
  };

  return successResponse(res, response, 'Subscription status retrieved');
});

/**
 * Initiate subscription payment
 * POST /api/v1/subscriptions/initiate
 */
const initiateSubscription = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { currency = CURRENCIES.UZS } = req.body;

  // Validate currency
  if (currency !== CURRENCIES.USD && currency !== CURRENCIES.UZS) {
    return badRequestResponse(res, 'Invalid currency. Use USD or UZS');
  }

  // Check for existing pending/processing transaction to prevent duplicates
  const existingPending = await Transaction.findOne({
    userId,
    status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.PROCESSING] }
  });
  if (existingPending) {
    return badRequestResponse(res, 'A payment is already in progress. Please complete or wait for it to expire.');
  }

  // Get price from environment
  const priceUSD = parseFloat(process.env.SUBSCRIPTION_PRICE_USD) || 1;
  const priceUZS = parseFloat(process.env.SUBSCRIPTION_PRICE_UZS) || 12000;
  const amount = currency === CURRENCIES.USD ? priceUSD : priceUZS;

  // Create transaction record
  const transaction = new Transaction({
    userId,
    amount,
    currency,
    status: TRANSACTION_STATUS.PENDING,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  await transaction.save();

  try {
    // Generate PayMe payment URL
    const paymentUrl = paymeService.generatePaymentUrl(
      userId,
      amount,
      currency,
      transaction._id
    );

    return createdResponse(res, {
      transactionId: transaction._id,
      paymentUrl,
      amount,
      currency,
      expiresIn: 900 // 15 minutes
    }, 'Payment initiated. Redirect user to paymentUrl');
  } catch (error) {
    // Mark transaction as failed
    await transaction.markAsFailed(error.message, 'PAYMENT_URL_GENERATION_FAILED');

    logger.error('Failed to generate payment URL:', error);
    return badRequestResponse(res, 'Failed to initiate payment. Please try again.');
  }
});

/**
 * Get subscription history
 * GET /api/v1/subscriptions/history
 */
const getSubscriptionHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const skip = (page - 1) * limit;

  const subscriptions = await Subscription.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('lastPaymentId', 'amount currency status createdAt');

  const total = await Subscription.countDocuments({ userId });

  return successResponse(res, {
    subscriptions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, 'Subscription history retrieved');
});

/**
 * Cancel auto-renewal
 * POST /api/v1/subscriptions/cancel
 */
const cancelAutoRenewal = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { reason } = req.body;

  const user = await User.findById(userId);
  if (!user.currentSubscriptionId) {
    return badRequestResponse(res, 'No active subscription found');
  }

  const subscription = await Subscription.findById(user.currentSubscriptionId);
  if (!subscription) {
    return notFoundResponse(res, 'Subscription not found');
  }

  if (!subscription.autoRenew) {
    return badRequestResponse(res, 'Auto-renewal is already disabled');
  }

  await subscription.cancel(reason || 'User requested cancellation');

  return successResponse(res, {
    subscription: {
      _id: subscription._id,
      autoRenew: subscription.autoRenew,
      cancelledAt: subscription.cancelledAt,
      endDate: subscription.endDate
    }
  }, 'Auto-renewal cancelled. Subscription will expire on ' + subscription.endDate.toISOString());
});

module.exports = {
  getSubscriptionStatus,
  initiateSubscription,
  getSubscriptionHistory,
  cancelAutoRenewal
};

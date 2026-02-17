const { User, Subscription, Transaction, AdminLog } = require('../models');
const {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  TRANSACTION_STATUS,
  ADMIN_ACTIONS
} = require('../utils/constants');
const { successResponse, createdResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Get all subscriptions with filters
 * GET /api/v1/admin/subscriptions
 */
const getAllSubscriptions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    userId,
    sortBy = 'createdAt',
    order = 'desc'
  } = req.query;

  const query = {};
  if (status) query.status = status;
  if (userId) query.userId = userId;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: order === 'desc' ? -1 : 1 };

  const subscriptions = await Subscription.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('userId', 'displayName email kycStatus')
    .populate('lastPaymentId', 'amount currency status createdAt');

  const total = await Subscription.countDocuments(query);

  // Get stats
  const stats = await Subscription.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  return successResponse(res, {
    subscriptions,
    stats,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, 'Subscriptions retrieved');
});

/**
 * Grant free subscription to user
 * POST /api/v1/admin/subscriptions/grant
 */
const grantFreeSubscription = asyncHandler(async (req, res) => {
  const { userId, durationDays } = req.body;
  const adminId = req.adminId;

  const user = await User.findById(userId);
  if (!user) {
    return notFoundResponse(res, 'User not found');
  }

  const duration = durationDays || parseInt(process.env.SUBSCRIPTION_DURATION_DAYS) || 30;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + (duration * 24 * 60 * 60 * 1000));

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

  // Log action
  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.SUBSCRIPTION_GRANTED,
    targetModel: 'User',
    targetId: user._id,
    details: {
      subscriptionId: subscription._id,
      durationDays: duration,
      endDate
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.info(`Admin ${adminId} granted free subscription to user ${userId}`);

  return createdResponse(res, {
    subscription: {
      _id: subscription._id,
      userId: subscription.userId,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: subscription.daysRemaining()
    }
  }, `Free subscription granted for ${duration} days`);
});

/**
 * Revoke user subscription
 * POST /api/v1/admin/subscriptions/:id/revoke
 */
const revokeSubscription = asyncHandler(async (req, res) => {
  const { id: subscriptionId } = req.params;
  const { reason } = req.body;
  const adminId = req.adminId;

  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) {
    return notFoundResponse(res, 'Subscription not found');
  }

  // Mark as cancelled
  subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
  subscription.cancelledAt = new Date();
  subscription.cancelReason = reason || 'Revoked by admin';
  await subscription.save();

  // Update user
  const user = await User.findById(subscription.userId);
  if (user) {
    user.subscriptionStatus = SUBSCRIPTION_STATUS.EXPIRED;
    user.gracePeriodEndsAt = null;
    await user.save();
  }

  // Log action
  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.SUBSCRIPTION_REVOKED,
    targetModel: 'Subscription',
    targetId: subscription._id,
    details: { reason, userId: subscription.userId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.warn(`Admin ${adminId} revoked subscription ${subscriptionId}`);

  return successResponse(res, { subscription }, 'Subscription revoked');
});

/**
 * Get all transactions
 * GET /api/v1/admin/transactions
 */
const getAllTransactions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    userId,
    sortBy = 'createdAt',
    order = 'desc'
  } = req.query;

  const query = {};
  if (status) query.status = status;
  if (userId) query.userId = userId;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: order === 'desc' ? -1 : 1 };

  const transactions = await Transaction.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('userId', 'displayName email')
    .populate('subscriptionId', 'plan status startDate endDate')
    .select('-paymentResponse'); // Don't expose sensitive payment data

  const total = await Transaction.countDocuments(query);

  // Get revenue stats
  const revenueStats = await Transaction.aggregate([
    { $match: { status: TRANSACTION_STATUS.COMPLETED } },
    {
      $group: {
        _id: '$currency',
        totalRevenue: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  return successResponse(res, {
    transactions,
    revenueStats,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, 'Transactions retrieved');
});

/**
 * Get subscription statistics
 * GET /api/v1/admin/subscriptions/stats
 */
const getSubscriptionStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Active subscriptions
  const activeCount = await Subscription.countDocuments({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gt: new Date() }
  });

  // Expired subscriptions
  const expiredCount = await Subscription.countDocuments({
    status: SUBSCRIPTION_STATUS.EXPIRED
  });

  // Grace period subscriptions
  const gracePeriodCount = await User.countDocuments({
    subscriptionStatus: SUBSCRIPTION_STATUS.GRACE_PERIOD
  });

  // New subscriptions (this period)
  const newSubscriptions = await Subscription.countDocuments({
    ...dateFilter
  });

  // Revenue
  const revenue = await Transaction.aggregate([
    {
      $match: {
        status: TRANSACTION_STATUS.COMPLETED,
        ...dateFilter
      }
    },
    {
      $group: {
        _id: '$currency',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Churn rate (expired in last 30 days / total active at start of period)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const churnedCount = await Subscription.countDocuments({
    status: SUBSCRIPTION_STATUS.EXPIRED,
    updatedAt: { $gte: thirtyDaysAgo }
  });

  return successResponse(res, {
    active: activeCount,
    expired: expiredCount,
    gracePeriod: gracePeriodCount,
    new: newSubscriptions,
    churned: churnedCount,
    revenue
  }, 'Subscription statistics retrieved');
});

module.exports = {
  getAllSubscriptions,
  grantFreeSubscription,
  revokeSubscription,
  getAllTransactions,
  getSubscriptionStats
};

const { User, Subscription, Transaction, AdminLog } = require('../models');
const paymeService = require('../services/paymeService');
const {
  SUBSCRIPTION_STATUS,
  TRANSACTION_STATUS,
  SUBSCRIPTION_PLAN,
  ADMIN_ACTIONS
} = require('../utils/constants');
const { successResponse, badRequestResponse, unauthorizedResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Handle PayMe webhook (JSON-RPC 2.0)
 * POST /api/v1/payments/payme/webhook
 * NO AUTHENTICATION - Uses signature verification
 */
const handlePaymeWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;
  const signature = req.headers['x-payme-signature'];

  // Verify webhook signature
  try {
    const isValid = paymeService.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      logger.warn('Invalid PayMe webhook signature');
      return res.status(401).json({
        jsonrpc: '2.0',
        id: payload.id,
        error: {
          code: -32504,
          message: 'Invalid signature'
        }
      });
    }
  } catch (error) {
    logger.error('Webhook signature verification error:', error);
    return res.status(401).json({
      jsonrpc: '2.0',
      id: payload.id,
      error: {
        code: -32504,
        message: 'Signature verification failed'
      }
    });
  }

  try {
    // Handle the webhook based on method
    const result = await paymeService.handleWebhook(payload);

    // If method is PerformTransaction, activate subscription
    if (payload.method === 'PerformTransaction') {
      await activateSubscriptionFromTransaction(result.transaction);
    }

    return res.json({
      jsonrpc: '2.0',
      id: payload.id,
      result
    });
  } catch (error) {
    logger.error('PayMe webhook error:', error);

    // Return JSON-RPC error
    return res.json({
      jsonrpc: '2.0',
      id: payload.id,
      error: {
        code: -32400,
        message: error.message
      }
    });
  }
});

/**
 * Activate subscription after successful payment
 */
async function activateSubscriptionFromTransaction(transactionId) {
  try {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      logger.error('Subscription activation failed: transaction not found', { transactionId });
      return;
    }

    if (transaction.status !== TRANSACTION_STATUS.COMPLETED) {
      return; // Not yet completed
    }

    if (transaction.subscriptionId) {
      return; // Already processed (idempotent)
    }

    const user = await User.findById(transaction.userId);
    if (!user) {
      logger.error('Subscription activation failed: user not found', {
        transactionId,
        userId: transaction.userId
      });
      return;
    }

    // Get subscription duration from env
    const durationDays = parseInt(process.env.SUBSCRIPTION_DURATION_DAYS) || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (durationDays * 24 * 60 * 60 * 1000));

    // Create subscription
    const subscription = new Subscription({
      userId: user._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      startDate,
      endDate,
      plan: SUBSCRIPTION_PLAN.MONTHLY,
      lastPaymentId: transaction._id,
      autoRenew: false // User must explicitly enable auto-renew
    });
    await subscription.save();

    // Update transaction with subscription ID
    transaction.subscriptionId = subscription._id;
    await transaction.save();

    // Update user subscription status
    user.subscriptionStatus = SUBSCRIPTION_STATUS.ACTIVE;
    user.currentSubscriptionId = subscription._id;
    user.subscriptionExpiresAt = endDate;
    user.gracePeriodEndsAt = null; // Clear grace period
    await user.save();

    logger.info(`Subscription activated for user ${user._id}`, {
      subscriptionId: subscription._id,
      transactionId: transaction._id,
      endDate
    });
  } catch (error) {
    // Log but don't throw — payment is already completed.
    // This allows the webhook to return success to PayMe while we handle the issue.
    logger.error('Subscription activation failed after payment completed', {
      transactionId,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Handle PayMe callback redirect
 * GET /api/v1/payments/payme/callback
 */
const handlePaymeCallback = asyncHandler(async (req, res) => {
  const { account, status } = req.query;

  // Parse account data
  let userId, transactionId;
  try {
    const accountData = JSON.parse(Buffer.from(account, 'base64').toString());
    userId = accountData.user_id;
    transactionId = accountData.transaction_id;
  } catch (error) {
    logger.error('Failed to parse callback account data:', error);
    return res.redirect(`${process.env.CORS_ORIGIN}/subscription?error=invalid_callback`);
  }

  // Check transaction status
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    return res.redirect(`${process.env.CORS_ORIGIN}/subscription?error=transaction_not_found`);
  }

  if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
    // Success - redirect to success page
    return res.redirect(`${process.env.CORS_ORIGIN}/subscription?success=true`);
  } else if (transaction.status === TRANSACTION_STATUS.FAILED ||
             transaction.status === TRANSACTION_STATUS.CANCELLED) {
    // Failed - redirect with error
    return res.redirect(`${process.env.CORS_ORIGIN}/subscription?error=payment_failed`);
  } else {
    // Pending - redirect to pending page
    return res.redirect(`${process.env.CORS_ORIGIN}/subscription?status=pending`);
  }
});

/**
 * Get user's transaction history
 * GET /api/v1/transactions
 */
const getTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const query = { userId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('subscriptionId', 'plan status startDate endDate')
    .select('-paymentResponse'); // Don't expose raw payment response

  const total = await Transaction.countDocuments(query);

  return successResponse(res, {
    transactions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, 'Transactions retrieved');
});

/**
 * Get transaction details
 * GET /api/v1/transactions/:id
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const transactionId = req.params.id;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    userId
  })
    .populate('subscriptionId', 'plan status startDate endDate')
    .select('-paymentResponse'); // Don't expose raw payment response

  if (!transaction) {
    return badRequestResponse(res, 'Transaction not found');
  }

  return successResponse(res, { transaction }, 'Transaction details retrieved');
});

module.exports = {
  handlePaymeWebhook,
  handlePaymeCallback,
  getTransactions,
  getTransactionById,
  activateSubscriptionFromTransaction // Export for manual processing if needed
};

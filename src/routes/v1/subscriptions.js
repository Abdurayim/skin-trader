const express = require('express');
const router = express.Router();
const subscriptionController = require('../../controllers/subscriptionController');
const { authenticateUser } = require('../../middlewares/auth');
const { validateBody, validateQuery } = require('../../middlewares/validation');
const { apiRateLimiter } = require('../../middlewares/rateLimiter');
const Joi = require('joi');

// Validation schemas
const initiateSubscriptionSchema = Joi.object({
  currency: Joi.string().valid('USD', 'UZS').optional()
});

const cancelSubscriptionSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(50).optional()
});

/**
 * @route   GET /api/v1/subscriptions/status
 * @desc    Get current subscription status
 * @access  Private
 */
router.get(
  '/status',
  authenticateUser,
  subscriptionController.getSubscriptionStatus
);

/**
 * @route   POST /api/v1/subscriptions/initiate
 * @desc    Initiate subscription payment
 * @access  Private
 */
router.post(
  '/initiate',
  authenticateUser,
  apiRateLimiter,
  validateBody(initiateSubscriptionSchema),
  subscriptionController.initiateSubscription
);

/**
 * @route   GET /api/v1/subscriptions/history
 * @desc    Get subscription history
 * @access  Private
 */
router.get(
  '/history',
  authenticateUser,
  validateQuery(historyQuerySchema),
  subscriptionController.getSubscriptionHistory
);

/**
 * @route   POST /api/v1/subscriptions/cancel
 * @desc    Cancel auto-renewal
 * @access  Private
 */
router.post(
  '/cancel',
  authenticateUser,
  apiRateLimiter,
  validateBody(cancelSubscriptionSchema),
  subscriptionController.cancelAutoRenewal
);

module.exports = router;

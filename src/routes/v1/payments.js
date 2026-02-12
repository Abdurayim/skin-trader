const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/paymentController');
const { authenticateUser } = require('../../middlewares/auth');
const { validateQuery } = require('../../middlewares/validation');
const Joi = require('joi');

// Validation schemas
const transactionQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(50).optional(),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded').optional()
});

/**
 * @route   POST /api/v1/payments/payme/webhook
 * @desc    PayMe webhook handler (JSON-RPC 2.0)
 * @access  Public (signature verified)
 */
router.post(
  '/payme/webhook',
  paymentController.handlePaymeWebhook
);

/**
 * @route   GET /api/v1/payments/payme/callback
 * @desc    PayMe callback redirect
 * @access  Public
 */
router.get(
  '/payme/callback',
  paymentController.handlePaymeCallback
);

/**
 * @route   GET /api/v1/transactions
 * @desc    Get user's transaction history
 * @access  Private
 */
router.get(
  '/transactions',
  authenticateUser,
  validateQuery(transactionQuerySchema),
  paymentController.getTransactions
);

/**
 * @route   GET /api/v1/transactions/:id
 * @desc    Get transaction details
 * @access  Private
 */
router.get(
  '/transactions/:id',
  authenticateUser,
  paymentController.getTransactionById
);

module.exports = router;

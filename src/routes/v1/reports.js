const express = require('express');
const router = express.Router();
const reportController = require('../../controllers/reportController');
const { authenticateUser } = require('../../middlewares/auth');
const { validateBody, validateQuery, validateObjectId } = require('../../middlewares/validation');
const { apiRateLimiter } = require('../../middlewares/rateLimiter');
const Joi = require('joi');

// Validation schemas
const createReportSchema = Joi.object({
  reportType: Joi.string().valid('post', 'user').required(),
  targetId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  category: Joi.string().valid(
    'scam',
    'fake_item',
    'inappropriate_content',
    'duplicate_post',
    'incorrect_pricing',
    'harassment',
    'spam',
    'fraud',
    'impersonation',
    'offensive_profile',
    'other'
  ).required(),
  description: Joi.string().max(1000).optional()
});

const myReportsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(50).optional(),
  status: Joi.string().valid('pending', 'under_review', 'resolved', 'dismissed').optional(),
  reportType: Joi.string().valid('post', 'user').optional()
});

/**
 * @route   POST /api/v1/reports
 * @desc    Create a new report
 * @access  Private
 */
router.post(
  '/',
  authenticateUser,
  apiRateLimiter,
  validateBody(createReportSchema),
  reportController.createReport
);

/**
 * @route   GET /api/v1/reports/my
 * @desc    Get user's submitted reports
 * @access  Private
 */
router.get(
  '/my',
  authenticateUser,
  validateQuery(myReportsQuerySchema),
  reportController.getMyReports
);

/**
 * @route   GET /api/v1/reports/:id
 * @desc    Get report details
 * @access  Private
 */
router.get(
  '/:id',
  authenticateUser,
  validateObjectId('id'),
  reportController.getReportById
);

module.exports = router;

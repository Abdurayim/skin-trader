const express = require('express');
const router = express.Router();
const { adminController } = require('../../controllers');
const adminSubscriptionController = require('../../controllers/adminSubscriptionController');
const adminReportController = require('../../controllers/adminReportController');
const { authenticateAdmin, requirePermission, requireSuperAdmin } = require('../../middlewares/auth');
const { validateBody, validateObjectId, validateQuery } = require('../../middlewares/validation');
const { strictRateLimiter, adminRateLimiter } = require('../../middlewares/rateLimiter');
const { adminSchemas, gameSchemas, offsetPaginationSchema } = require('../../utils/validators');
const { ADMIN_PERMISSIONS } = require('../../utils/constants');
const Joi = require('joi');

/**
 * @route   POST /api/v1/admin/login
 * @desc    Admin login
 * @access  Public
 */
router.post(
  '/login',
  strictRateLimiter,
  validateBody(adminSchemas.login),
  adminController.login
);

/**
 * @route   POST /api/v1/admin/logout
 * @desc    Admin logout
 * @access  Private (Admin)
 */
router.post(
  '/logout',
  authenticateAdmin,
  adminController.logout
);

/**
 * @route   POST /api/v1/admin/refresh-token
 * @desc    Refresh admin token
 * @access  Public
 */
router.post(
  '/refresh-token',
  validateBody(adminSchemas.refreshToken),
  adminController.refreshToken
);

// Apply admin authentication and rate limiting to all routes below
router.use(authenticateAdmin);
router.use(adminRateLimiter);

/**
 * @route   GET /api/v1/admin/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin)
 */
router.get(
  '/stats',
  requirePermission(ADMIN_PERMISSIONS.VIEW_STATS),
  adminController.getStats
);

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users
 * @access  Private (Admin)
 */
router.get(
  '/users',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_USERS),
  adminController.getUsers
);

/**
 * @route   GET /api/v1/admin/users/:id
 * @desc    Get user details
 * @access  Private (Admin)
 */
router.get(
  '/users/:id',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_USERS),
  validateObjectId('id'),
  adminController.getUserDetails
);

/**
 * @route   PATCH /api/v1/admin/users/:id/status
 * @desc    Update user status (ban/unban/suspend)
 * @access  Private (Admin)
 */
router.patch(
  '/users/:id/status',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_USERS),
  validateObjectId('id'),
  validateBody(adminSchemas.updateUserStatus),
  adminController.updateUserStatus
);

/**
 * @route   GET /api/v1/admin/posts
 * @desc    Get all posts
 * @access  Private (Admin)
 */
router.get(
  '/posts',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_POSTS),
  adminController.getPosts
);

/**
 * @route   DELETE /api/v1/admin/posts/:id
 * @desc    Delete post
 * @access  Private (Admin)
 */
router.delete(
  '/posts/:id',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_POSTS),
  validateObjectId('id'),
  adminController.deletePost
);

/**
 * @route   GET /api/v1/admin/kyc/pending
 * @desc    Get pending KYC verifications
 * @access  Private (Admin)
 */
router.get(
  '/kyc/pending',
  requirePermission(ADMIN_PERMISSIONS.VIEW_KYC),
  adminController.getPendingKyc
);

/**
 * @route   PATCH /api/v1/admin/kyc/:userId/approve
 * @desc    Approve KYC
 * @access  Private (Admin)
 */
router.patch(
  '/kyc/:userId/approve',
  requirePermission(ADMIN_PERMISSIONS.APPROVE_KYC),
  validateObjectId('userId'),
  adminController.approveKyc
);

/**
 * @route   PATCH /api/v1/admin/kyc/:userId/reject
 * @desc    Reject KYC
 * @access  Private (Admin)
 */
router.patch(
  '/kyc/:userId/reject',
  requirePermission(ADMIN_PERMISSIONS.APPROVE_KYC),
  validateObjectId('userId'),
  validateBody(adminSchemas.kycAction),
  adminController.rejectKyc
);

/**
 * @route   GET /api/v1/admin/kyc/image/:filename
 * @desc    Serve KYC document image to authenticated admin
 * @access  Private (Admin)
 */
router.get(
  '/kyc/image/:filename',
  requirePermission(ADMIN_PERMISSIONS.VIEW_KYC),
  adminController.serveKycImage
);

/**
 * @route   GET /api/v1/admin/logs
 * @desc    Get admin activity logs
 * @access  Private (Admin)
 */
router.get(
  '/logs',
  requirePermission(ADMIN_PERMISSIONS.VIEW_LOGS),
  adminController.getLogs
);

/**
 * @route   GET /api/v1/admin/admins
 * @desc    Get all admins
 * @access  Private (Super Admin)
 */
router.get(
  '/admins',
  requireSuperAdmin,
  adminController.getAdmins
);

/**
 * @route   POST /api/v1/admin/admins
 * @desc    Create new admin
 * @access  Private (Super Admin)
 */
router.post(
  '/admins',
  requireSuperAdmin,
  validateBody(adminSchemas.createAdmin),
  adminController.createAdmin
);

/**
 * @route   PUT /api/v1/admin/admins/:id
 * @desc    Update admin
 * @access  Private (Super Admin)
 */
router.put(
  '/admins/:id',
  requireSuperAdmin,
  validateObjectId('id'),
  validateBody(adminSchemas.updateAdmin),
  adminController.updateAdmin
);

/**
 * @route   GET /api/v1/admin/games
 * @desc    Get all games (including inactive)
 * @access  Private (Admin)
 */
router.get(
  '/games',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_GAMES),
  adminController.getGames
);

/**
 * @route   POST /api/v1/admin/games
 * @desc    Create new game
 * @access  Private (Admin)
 */
router.post(
  '/games',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_GAMES),
  validateBody(gameSchemas.create),
  adminController.createGame
);

/**
 * @route   PUT /api/v1/admin/games/:id
 * @desc    Update game
 * @access  Private (Admin)
 */
router.put(
  '/games/:id',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_GAMES),
  validateObjectId('id'),
  validateBody(gameSchemas.update),
  adminController.updateGame
);

// ============================================
// SUBSCRIPTION MANAGEMENT ROUTES
// ============================================

/**
 * @route   GET /api/v1/admin/subscriptions
 * @desc    Get all subscriptions with filters
 * @access  Private (Admin - Manage Subscriptions)
 */
router.get(
  '/subscriptions',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_SUBSCRIPTIONS),
  adminSubscriptionController.getAllSubscriptions
);

/**
 * @route   GET /api/v1/admin/subscriptions/stats
 * @desc    Get subscription statistics
 * @access  Private (Admin - View Stats)
 */
router.get(
  '/subscriptions/stats',
  requirePermission(ADMIN_PERMISSIONS.VIEW_STATS),
  adminSubscriptionController.getSubscriptionStats
);

/**
 * @route   POST /api/v1/admin/subscriptions/grant
 * @desc    Grant free subscription to user
 * @access  Private (Admin - Manage Subscriptions)
 */
const grantSubscriptionSchema = Joi.object({
  userId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  durationDays: Joi.number().integer().min(1).max(365).optional()
});

router.post(
  '/subscriptions/grant',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_SUBSCRIPTIONS),
  validateBody(grantSubscriptionSchema),
  adminSubscriptionController.grantFreeSubscription
);

/**
 * @route   POST /api/v1/admin/subscriptions/:id/revoke
 * @desc    Revoke subscription
 * @access  Private (Admin - Manage Subscriptions)
 */
const revokeSubscriptionSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});

router.post(
  '/subscriptions/:id/revoke',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_SUBSCRIPTIONS),
  validateObjectId('id'),
  validateBody(revokeSubscriptionSchema),
  adminSubscriptionController.revokeSubscription
);

/**
 * @route   GET /api/v1/admin/transactions
 * @desc    Get all transactions
 * @access  Private (Admin - Manage Subscriptions)
 */
router.get(
  '/transactions',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_SUBSCRIPTIONS),
  adminSubscriptionController.getAllTransactions
);

// ============================================
// REPORT MANAGEMENT ROUTES
// ============================================

/**
 * @route   GET /api/v1/admin/reports
 * @desc    Get all reports with filters
 * @access  Private (Admin - Manage Reports)
 */
router.get(
  '/reports',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_REPORTS),
  adminReportController.getAllReports
);

/**
 * @route   GET /api/v1/admin/reports/stats
 * @desc    Get report statistics
 * @access  Private (Admin - View Stats)
 */
router.get(
  '/reports/stats',
  requirePermission(ADMIN_PERMISSIONS.VIEW_STATS),
  adminReportController.getReportStats
);

/**
 * @route   GET /api/v1/admin/reports/:id
 * @desc    Get report details
 * @access  Private (Admin - Manage Reports)
 */
router.get(
  '/reports/:id',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_REPORTS),
  validateObjectId('id'),
  adminReportController.getReportDetails
);

/**
 * @route   PATCH /api/v1/admin/reports/:id/status
 * @desc    Update report status
 * @access  Private (Admin - Manage Reports)
 */
const updateReportStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'under_review', 'resolved', 'dismissed').required()
});

router.patch(
  '/reports/:id/status',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_REPORTS),
  validateObjectId('id'),
  validateBody(updateReportStatusSchema),
  adminReportController.updateReportStatus
);

/**
 * @route   POST /api/v1/admin/reports/:id/resolve
 * @desc    Resolve report with action
 * @access  Private (Admin - Manage Reports)
 */
const resolveReportSchema = Joi.object({
  action: Joi.string().valid(
    'dismiss',
    'delete_post',
    'warn_user',
    'suspend_user',
    'ban_user',
    'delete_user'
  ).required(),
  notes: Joi.string().max(2000).optional(),
  adminNotes: Joi.string().max(2000).optional()
});

router.post(
  '/reports/:id/resolve',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_REPORTS),
  validateObjectId('id'),
  validateBody(resolveReportSchema),
  adminReportController.resolveReport
);

/**
 * @route   POST /api/v1/admin/reports/:id/dismiss
 * @desc    Dismiss report
 * @access  Private (Admin - Manage Reports)
 */
const dismissReportSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});

router.post(
  '/reports/:id/dismiss',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_REPORTS),
  validateObjectId('id'),
  validateBody(dismissReportSchema),
  adminReportController.dismissReport
);

module.exports = router;

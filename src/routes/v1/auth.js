const express = require('express');
const router = express.Router();
const { authController } = require('../../controllers');
const { authenticateUser } = require('../../middlewares/auth');
const { validateBody } = require('../../middlewares/validation');
const { strictRateLimiter, uploadRateLimiter } = require('../../middlewares/rateLimiter');
const { kycDocumentUpload, handleUploadError } = require('../../middlewares/upload');
const { authSchemas, userSchemas } = require('../../utils/validators');

/**
 * @route   POST /api/v1/auth/verify-token
 * @desc    Verify Firebase token and login/register user
 * @access  Public
 */
router.post(
  '/verify-token',
  strictRateLimiter,
  validateBody(authSchemas.verifyOtp),
  authController.verifyToken
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  validateBody(authSchemas.refreshToken),
  authController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post(
  '/logout',
  authenticateUser,
  authController.logout
);

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post(
  '/logout-all',
  authenticateUser,
  authController.logoutAll
);

/**
 * @route   POST /api/v1/auth/kyc/upload
 * @desc    Upload KYC document
 * @access  Private
 */
router.post(
  '/kyc/upload',
  authenticateUser,
  uploadRateLimiter,
  kycDocumentUpload.single('document'),
  handleUploadError,
  validateBody(userSchemas.kycUpload),
  authController.uploadKycDocument
);

/**
 * @route   POST /api/v1/auth/kyc/verify
 * @desc    Trigger KYC verification
 * @access  Private
 */
router.post(
  '/kyc/verify',
  authenticateUser,
  authController.verifyKyc
);

/**
 * @route   GET /api/v1/auth/kyc/status
 * @desc    Get KYC status
 * @access  Private
 */
router.get(
  '/kyc/status',
  authenticateUser,
  authController.getKycStatus
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get(
  '/me',
  authenticateUser,
  authController.getMe
);

module.exports = router;

const { User } = require('../models');
const { firebaseAuthService, kycService, cacheService } = require('../services');
const { generateTokens, verifyRefreshToken } = require('../middlewares/auth');
const { successResponse, createdResponse, badRequestResponse, unauthorizedResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const { KYC_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Verify Firebase token and create/login user
 * Client handles OTP sending via Firebase SDK
 * POST /api/v1/auth/verify-token
 */
const verifyToken = asyncHandler(async (req, res) => {
  const { firebaseToken } = req.body;

  // Verify Firebase token
  const firebaseResult = await firebaseAuthService.verifyIdToken(firebaseToken);

  if (!firebaseResult.success) {
    return badRequestResponse(res, firebaseResult.error);
  }

  const { uid, phoneNumber } = firebaseResult;

  // Find or create user
  let user = await User.findOne({
    $or: [
      { firebaseUid: uid },
      { phoneNumber }
    ]
  });

  let isNewUser = false;

  if (!user) {
    // Create new user
    user = new User({
      phoneNumber,
      firebaseUid: uid,
      isPhoneVerified: true,
      language: req.language || 'en'
    });
    await user.save();
    isNewUser = true;
    logger.info('New user created', { userId: user._id, phoneNumber });
  } else {
    // Update existing user
    if (!user.firebaseUid) {
      user.firebaseUid = uid;
    }
    user.isPhoneVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  }

  // Generate JWT tokens
  const tokens = generateTokens({
    userId: user._id.toString(),
    role: 'user'
  });

  // Store refresh token
  user.refreshTokens.push({
    token: tokens.refreshToken,
    deviceInfo: req.get('user-agent')
  });

  // Limit to 5 devices
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save();

  const response = {
    user: {
      _id: user._id,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      email: user.email,
      kycStatus: user.kycStatus,
      language: user.language,
      isNewUser
    },
    tokens
  };

  if (isNewUser) {
    return createdResponse(res, response, req.t('auth.registered'));
  }

  return successResponse(res, response, req.t('auth.loginSuccess'));
});

/**
 * Refresh access token
 * POST /api/v1/auth/refresh-token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  const { valid, decoded, error } = verifyRefreshToken(token);

  if (!valid) {
    return unauthorizedResponse(res, error);
  }

  // Find user and verify token exists
  const user = await User.findById(decoded.userId);

  if (!user) {
    return unauthorizedResponse(res, 'User not found');
  }

  const tokenExists = user.refreshTokens.some(t => t.token === token);

  if (!tokenExists) {
    return unauthorizedResponse(res, 'Invalid refresh token');
  }

  // Generate new tokens
  const tokens = generateTokens({
    userId: user._id.toString(),
    role: 'user'
  });

  // Replace old token with new one
  user.refreshTokens = user.refreshTokens.filter(t => t.token !== token);
  user.refreshTokens.push({
    token: tokens.refreshToken,
    deviceInfo: req.get('user-agent')
  });

  await user.save();

  return successResponse(res, { tokens }, 'Token refreshed');
});

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (token) {
    await User.findByIdAndUpdate(req.userId, {
      $pull: { refreshTokens: { token } }
    });
  }

  return successResponse(res, null, req.t('auth.logoutSuccess'));
});

/**
 * Logout from all devices
 * POST /api/v1/auth/logout-all
 */
const logoutAll = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.userId, {
    refreshTokens: []
  });

  // Revoke Firebase tokens too
  if (req.user.firebaseUid) {
    await firebaseAuthService.revokeRefreshTokens(req.user.firebaseUid);
  }

  return successResponse(res, null, 'Logged out from all devices');
});

/**
 * Upload KYC document
 * POST /api/v1/auth/kyc/upload
 */
const uploadKycDocument = asyncHandler(async (req, res) => {
  const { documentType } = req.body;

  if (!req.file) {
    return badRequestResponse(res, 'Document file is required');
  }

  const result = await kycService.uploadDocument(req.userId, req.file, documentType);

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  return successResponse(res, result, req.t('kyc.documentUploaded'));
});

/**
 * Verify KYC (triggers auto-verification)
 * POST /api/v1/auth/kyc/verify
 */
const verifyKyc = asyncHandler(async (req, res) => {
  const result = await kycService.autoVerify(req.userId);

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  if (result.alreadyVerified) {
    return successResponse(res, { verified: true }, req.t('kyc.alreadyVerified'));
  }

  if (result.verified) {
    return successResponse(res, {
      verified: true,
      score: result.score
    }, req.t('kyc.verificationSuccess'));
  }

  return successResponse(res, {
    verified: false,
    requiresManualReview: result.requiresManualReview,
    message: result.message
  }, req.t('kyc.pendingReview'));
});

/**
 * Get KYC status
 * GET /api/v1/auth/kyc/status
 */
const getKycStatus = asyncHandler(async (req, res) => {
  const result = await kycService.getStatus(req.userId);

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  return successResponse(res, result);
});

/**
 * Get current user info
 * GET /api/v1/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select('-refreshTokens -kycDocuments.filePath')
    .lean();

  return successResponse(res, { user });
});

module.exports = {
  verifyToken,
  refreshToken,
  logout,
  logoutAll,
  uploadKycDocument,
  verifyKyc,
  getKycStatus,
  getMe
};

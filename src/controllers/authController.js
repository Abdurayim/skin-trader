const { User } = require('../models');
const { googleAuthService, kycService } = require('../services');
const { generateTokens, verifyRefreshToken } = require('../middlewares/auth');
const { successResponse, createdResponse, badRequestResponse, unauthorizedResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Google OAuth login/register
 * POST /api/v1/auth/google
 */
const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  let googleUser;
  try {
    googleUser = await googleAuthService.verifyIdToken(idToken);
  } catch (err) {
    logger.warn('Google auth failed', { error: err.message });
    return unauthorizedResponse(res, req.t('auth.googleAuthFailed'));
  }

  // Find user by googleId, or fallback by email (link existing account)
  let user = await User.findOne({ googleId: googleUser.googleId });

  if (!user) {
    user = await User.findOne({ email: googleUser.email });
  }

  let isNewUser = false;

  if (!user) {
    user = new User({
      googleId: googleUser.googleId,
      email: googleUser.email,
      displayName: googleUser.displayName,
      avatarUrl: googleUser.avatarUrl,
      language: req.language || 'en'
    });
    await user.save();
    isNewUser = true;
    logger.info('New user created via Google', { userId: user._id, email: googleUser.email });
  } else {
    // Link googleId if missing (existing user found by email)
    if (!user.googleId) {
      user.googleId = googleUser.googleId;
    }
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
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
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
  googleAuth,
  refreshToken,
  logout,
  logoutAll,
  uploadKycDocument,
  verifyKyc,
  getKycStatus,
  getMe
};

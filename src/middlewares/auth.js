const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Admin } = require('../models');
const { unauthorizedResponse, forbiddenResponse } = require('../utils/response');
const { ERROR_CODES, KYC_STATUS, USER_STATUS, ADMIN_PERMISSIONS, SUBSCRIPTION_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorizedResponse(res, 'Access token required');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      if (decoded.type !== 'access' || decoded.role !== 'user') {
        return unauthorizedResponse(res, 'Invalid token type');
      }

      const user = await User.findById(decoded.userId).lean();

      if (!user) {
        return unauthorizedResponse(res, 'User not found');
      }

      if (user.status === USER_STATUS.BANNED) {
        return forbiddenResponse(res, 'Account has been banned');
      }

      if (user.status === USER_STATUS.SUSPENDED) {
        return forbiddenResponse(res, 'Account is suspended');
      }

      req.user = user;
      req.userId = user._id;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return unauthorizedResponse(res, 'Token expired');
      }
      return unauthorizedResponse(res, 'Invalid token');
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return unauthorizedResponse(res, 'Authentication failed');
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      if (decoded.type === 'access' && decoded.role === 'user') {
        const user = await User.findById(decoded.userId).lean();
        if (user && user.status === USER_STATUS.ACTIVE) {
          req.user = user;
          req.userId = user._id;
        }
      }
    } catch (jwtError) {
      // Token invalid but we continue without auth
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Require KYC verification
 */
const requireKyc = (req, res, next) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  if (req.user.kycStatus !== KYC_STATUS.VERIFIED) {
    return forbiddenResponse(res, 'KYC verification required to perform this action', {
      code: ERROR_CODES.KYC_REQUIRED
    });
  }

  next();
};

/**
 * Require active subscription
 * Must be used AFTER authenticateUser and requireKyc
 */
const requireActiveSubscription = async (req, res, next) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  // Check KYC first
  if (req.user.kycStatus !== KYC_STATUS.VERIFIED) {
    return forbiddenResponse(res, 'KYC verification required', {
      code: ERROR_CODES.KYC_REQUIRED
    });
  }

  const now = new Date();

  // Check if user has active subscription
  const hasActiveSubscription = req.user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE &&
                                req.user.subscriptionExpiresAt &&
                                req.user.subscriptionExpiresAt > now;

  // Check if user is in grace period
  const inGracePeriod = req.user.subscriptionStatus === SUBSCRIPTION_STATUS.GRACE_PERIOD &&
                        req.user.gracePeriodEndsAt &&
                        req.user.gracePeriodEndsAt > now;

  if (!hasActiveSubscription && !inGracePeriod) {
    return forbiddenResponse(res, 'Active subscription required to create posts', {
      code: ERROR_CODES.SUBSCRIPTION_REQUIRED,
      subscriptionStatus: req.user.subscriptionStatus || SUBSCRIPTION_STATUS.NONE,
      subscriptionExpiresAt: req.user.subscriptionExpiresAt
    });
  }

  // If in grace period, add warning header
  if (inGracePeriod) {
    res.set('X-Grace-Period-Warning', 'true');
    res.set('X-Grace-Period-Ends', req.user.gracePeriodEndsAt.toISOString());
  }

  next();
};

/**
 * Verify admin JWT token
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorizedResponse(res, 'Access token required');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      if (decoded.type !== 'access' || decoded.role !== 'admin') {
        return unauthorizedResponse(res, 'Invalid token type');
      }

      const admin = await Admin.findById(decoded.adminId).lean();

      if (!admin) {
        return unauthorizedResponse(res, 'Admin not found');
      }

      if (!admin.isActive) {
        return forbiddenResponse(res, 'Admin account is deactivated');
      }

      req.admin = admin;
      req.adminId = admin._id;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return unauthorizedResponse(res, 'Token expired');
      }
      return unauthorizedResponse(res, 'Invalid token');
    }
  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    return unauthorizedResponse(res, 'Authentication failed');
  }
};

/**
 * Check if admin has specific permission
 */
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.admin) {
      return unauthorizedResponse(res, 'Admin authentication required');
    }

    const hasPermission = permissions.some(permission =>
      req.admin.permissions.includes(permission)
    );

    if (!hasPermission) {
      return forbiddenResponse(res, 'Insufficient permissions');
    }

    next();
  };
};

/**
 * Check if admin is super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return unauthorizedResponse(res, 'Admin authentication required');
  }

  if (req.admin.role !== 'superadmin') {
    return forbiddenResponse(res, 'Super admin access required');
  }

  next();
};

/**
 * Generate JWT tokens
 */
const generateTokens = (payload) => {
  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    if (decoded.type !== 'refresh') {
      return { valid: false, error: 'Invalid token type' };
    }

    return { valid: true, decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Refresh token expired' };
    }
    return { valid: false, error: 'Invalid refresh token' };
  }
};

module.exports = {
  authenticateUser,
  optionalAuth,
  requireKyc,
  requireActiveSubscription,
  authenticateAdmin,
  requirePermission,
  requireSuperAdmin,
  generateTokens,
  verifyRefreshToken
};

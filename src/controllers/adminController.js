const { Admin, User, Post, Game, AdminLog } = require('../models');
const { kycService, cacheService } = require('../services');
const { generateTokens, verifyRefreshToken } = require('../middlewares/auth');
const { successResponse, badRequestResponse, notFoundResponse, unauthorizedResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const { offsetPaginate } = require('../utils/pagination');
const { ADMIN_ACTIONS, USER_STATUS, POST_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Admin login
 * POST /api/v1/admin/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findByEmail(email);

  if (!admin) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  if (!admin.isActive) {
    return unauthorizedResponse(res, 'Account is deactivated');
  }

  const isMatch = await admin.comparePassword(password);

  if (!isMatch) {
    return unauthorizedResponse(res, 'Invalid credentials');
  }

  // Generate tokens
  const tokens = generateTokens({
    adminId: admin._id.toString(),
    role: 'admin'
  });

  // Store refresh token
  admin.refreshTokens.push({
    token: tokens.refreshToken,
    deviceInfo: req.get('user-agent')
  });

  // Limit to 3 sessions
  if (admin.refreshTokens.length > 3) {
    admin.refreshTokens = admin.refreshTokens.slice(-3);
  }

  // Update last login
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = req.ip;
  await admin.save();

  // Log action
  await AdminLog.logAuthAction(admin._id, ADMIN_ACTIONS.ADMIN_LOGIN, {}, req);

  logger.info('Admin logged in', { adminId: admin._id, email });

  return successResponse(res, {
    admin: {
      _id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      permissions: admin.permissions
    },
    tokens
  });
});

/**
 * Admin logout
 * POST /api/v1/admin/logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await Admin.findByIdAndUpdate(req.adminId, {
      $pull: { refreshTokens: { token: refreshToken } }
    });
  }

  await AdminLog.logAuthAction(req.adminId, ADMIN_ACTIONS.ADMIN_LOGOUT, {}, req);

  return successResponse(res, null, 'Logged out successfully');
});

/**
 * Refresh admin token
 * POST /api/v1/admin/refresh-token
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  const { valid, decoded, error } = verifyRefreshToken(token);

  if (!valid) {
    return unauthorizedResponse(res, error);
  }

  const admin = await Admin.findById(decoded.adminId);

  if (!admin || !admin.isActive) {
    return unauthorizedResponse(res, 'Invalid token');
  }

  const tokenExists = admin.refreshTokens.some(t => t.token === token);

  if (!tokenExists) {
    return unauthorizedResponse(res, 'Invalid refresh token');
  }

  const tokens = generateTokens({
    adminId: admin._id.toString(),
    role: 'admin'
  });

  admin.refreshTokens = admin.refreshTokens.filter(t => t.token !== token);
  admin.refreshTokens.push({
    token: tokens.refreshToken,
    deviceInfo: req.get('user-agent')
  });

  await admin.save();

  return successResponse(res, { tokens });
});

/**
 * Get all users
 * GET /api/v1/admin/users
 */
const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, status, kycStatus, search } = req.query;

  const query = {};

  if (status) query.status = status;
  if (kycStatus) query.kycStatus = kycStatus;
  if (search) {
    query.$or = [
      { phoneNumber: { $regex: search, $options: 'i' } },
      { displayName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const { documents, pagination } = await offsetPaginate(User, query, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder === 'asc' ? 1 : -1,
    select: '-refreshTokens'
  });

  return successResponse(res, { users: documents, pagination });
});

/**
 * Get user details with KYC documents
 * GET /api/v1/admin/users/:id
 */
const getUserDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select('-refreshTokens').lean();

  if (!user) {
    return notFoundResponse(res, 'User not found');
  }

  // Get user's posts count
  const postsCount = await Post.countDocuments({
    userId: id,
    deletedAt: { $exists: false }
  });

  // Get admin logs related to this user
  const logs = await AdminLog.getByTarget('User', id, { limit: 10 });

  return successResponse(res, {
    user,
    stats: { postsCount },
    adminLogs: logs
  });
});

/**
 * Update user status (ban/unban/suspend)
 * PATCH /api/v1/admin/users/:id/status
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const user = await User.findById(id);

  if (!user) {
    return notFoundResponse(res, 'User not found');
  }

  const previousStatus = user.status;
  user.status = status;
  user.statusReason = reason;
  await user.save();

  // Determine action
  let action;
  if (status === USER_STATUS.BANNED) action = ADMIN_ACTIONS.USER_BANNED;
  else if (status === USER_STATUS.SUSPENDED) action = ADMIN_ACTIONS.USER_SUSPENDED;
  else if (status === USER_STATUS.ACTIVE && previousStatus !== USER_STATUS.ACTIVE) {
    action = ADMIN_ACTIONS.USER_UNBANNED;
  }

  if (action) {
    await AdminLog.logUserAction(req.adminId, action, id, {
      previousStatus,
      newStatus: status,
      reason
    }, req);
  }

  // Invalidate cache
  await cacheService.invalidateUserCache(id);

  logger.info('User status updated', { userId: id, status, adminId: req.adminId });

  return successResponse(res, { user: { _id: user._id, status: user.status } });
});

/**
 * Get all posts (admin)
 * GET /api/v1/admin/posts
 */
const getPosts = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, status, gameId, userId } = req.query;

  const query = { deletedAt: { $exists: false } };

  if (status) query.status = status;
  if (gameId) query.gameId = gameId;
  if (userId) query.userId = userId;

  const { documents, pagination } = await offsetPaginate(Post, query, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder === 'asc' ? 1 : -1,
    populate: [
      { path: 'userId', select: 'displayName phoneNumber' },
      { path: 'gameId', select: 'name slug' }
    ]
  });

  return successResponse(res, { posts: documents, pagination });
});

/**
 * Delete post (admin)
 * DELETE /api/v1/admin/posts/:id
 */
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const post = await Post.findById(id);

  if (!post) {
    return notFoundResponse(res, 'Post not found');
  }

  // Soft delete
  post.deletedAt = new Date();
  post.deletedBy = req.adminId;
  post.deletedByModel = 'Admin';
  await post.save();

  // Log action
  await AdminLog.logPostAction(req.adminId, ADMIN_ACTIONS.POST_DELETED, id, {
    reason,
    postTitle: post.title,
    userId: post.userId
  }, req);

  // Invalidate cache
  await cacheService.invalidatePost(id);

  logger.info('Post deleted by admin', { postId: id, adminId: req.adminId, reason });

  return successResponse(res, null, 'Post deleted');
});

/**
 * Get pending KYC verifications
 * GET /api/v1/admin/kyc/pending
 */
const getPendingKyc = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;

  const result = await kycService.getPendingVerifications({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20
  });

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  return successResponse(res, result);
});

/**
 * Approve KYC
 * PATCH /api/v1/admin/kyc/:userId/approve
 */
const approveKyc = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await kycService.adminApprove(userId, req.adminId);

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  // Log action
  await AdminLog.logKycAction(req.adminId, ADMIN_ACTIONS.KYC_APPROVED, userId, {}, req);

  logger.info('KYC approved', { userId, adminId: req.adminId });

  return successResponse(res, result, 'KYC approved');
});

/**
 * Reject KYC
 * PATCH /api/v1/admin/kyc/:userId/reject
 */
const rejectKyc = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  const result = await kycService.adminReject(userId, req.adminId, reason);

  if (!result.success) {
    return badRequestResponse(res, result.error);
  }

  // Log action
  await AdminLog.logKycAction(req.adminId, ADMIN_ACTIONS.KYC_REJECTED, userId, { reason }, req);

  logger.info('KYC rejected', { userId, adminId: req.adminId, reason });

  return successResponse(res, result, 'KYC rejected');
});

/**
 * Get admin activity logs
 * GET /api/v1/admin/logs
 */
const getLogs = asyncHandler(async (req, res) => {
  const { page, limit, action, adminId: filterAdminId, startDate, endDate } = req.query;

  let logs;

  if (filterAdminId) {
    logs = await AdminLog.getByAdmin(filterAdminId, {
      limit: parseInt(limit) || 50,
      page: parseInt(page) || 1
    });
  } else if (action) {
    logs = await AdminLog.getByAction(action, {
      limit: parseInt(limit) || 50,
      page: parseInt(page) || 1,
      startDate,
      endDate
    });
  } else {
    logs = await AdminLog.getRecentLogs(parseInt(limit) || 100);
  }

  return successResponse(res, { logs });
});

/**
 * Get dashboard statistics
 * GET /api/v1/admin/stats
 */
const getStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    verifiedUsers,
    pendingKyc,
    totalPosts,
    activePosts,
    totalGames
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ kycStatus: 'verified' }),
    User.countDocuments({ kycStatus: 'pending' }),
    Post.countDocuments({ deletedAt: { $exists: false } }),
    Post.countDocuments({ deletedAt: { $exists: false }, status: POST_STATUS.ACTIVE }),
    Game.countDocuments({ isActive: true })
  ]);

  // Recent registrations (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentRegistrations = await User.countDocuments({
    createdAt: { $gte: weekAgo }
  });

  // Recent posts (last 7 days)
  const recentPosts = await Post.countDocuments({
    createdAt: { $gte: weekAgo },
    deletedAt: { $exists: false }
  });

  return successResponse(res, {
    stats: {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        pendingKyc,
        recentRegistrations
      },
      posts: {
        total: totalPosts,
        active: activePosts,
        recent: recentPosts
      },
      games: {
        total: totalGames
      }
    }
  });
});

/**
 * Create new admin (super admin only)
 * POST /api/v1/admin/admins
 */
const createAdmin = asyncHandler(async (req, res) => {
  const { email, password, name, role } = req.body;

  // Check if email already exists
  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    return badRequestResponse(res, 'Email already registered');
  }

  const admin = await Admin.createAdmin({
    email,
    password,
    name,
    role
  }, req.adminId);

  // Log action
  await AdminLog.logAdminAction(req.adminId, ADMIN_ACTIONS.ADMIN_CREATED, admin._id, {
    email,
    role
  }, req);

  logger.info('Admin created', { newAdminId: admin._id, createdBy: req.adminId });

  return successResponse(res, {
    admin: {
      _id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    }
  }, 'Admin created');
});

/**
 * Get all admins (super admin only)
 * GET /api/v1/admin/admins
 */
const getAdmins = asyncHandler(async (req, res) => {
  const admins = await Admin.find()
    .select('-password -refreshTokens')
    .sort({ createdAt: -1 });

  return successResponse(res, { admins });
});

/**
 * Update admin (super admin only)
 * PUT /api/v1/admin/admins/:id
 */
const updateAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, isActive } = req.body;

  // Can't modify self role/status
  if (id === req.adminId.toString() && (role || isActive === false)) {
    return badRequestResponse(res, 'Cannot modify your own role or status');
  }

  const admin = await Admin.findById(id);

  if (!admin) {
    return notFoundResponse(res, 'Admin not found');
  }

  if (name !== undefined) admin.name = name;
  if (role !== undefined) admin.role = role;
  if (isActive !== undefined) admin.isActive = isActive;
  admin.updatedBy = req.adminId;

  await admin.save();

  // Log action
  await AdminLog.logAdminAction(req.adminId, ADMIN_ACTIONS.ADMIN_UPDATED, id, {
    updates: { name, role, isActive }
  }, req);

  return successResponse(res, { admin }, 'Admin updated');
});

/**
 * Create game (admin)
 * POST /api/v1/admin/games
 */
const createGame = asyncHandler(async (req, res) => {
  const { name, slug, icon, genres, isActive } = req.body;

  // Check if name already exists
  const existing = await Game.findOne({ name });
  if (existing) {
    return badRequestResponse(res, 'Game with this name already exists');
  }

  const game = new Game({
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    icon,
    genres,
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.adminId
  });

  await game.save();

  // Log action
  await AdminLog.logGameAction(req.adminId, ADMIN_ACTIONS.GAME_CREATED, game._id, {
    name
  }, req);

  // Invalidate games cache
  await cacheService.del('games:list');

  return successResponse(res, { game }, 'Game created');
});

/**
 * Update game (admin)
 * PUT /api/v1/admin/games/:id
 */
const updateGame = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, icon, genres, isActive } = req.body;

  const game = await Game.findById(id);

  if (!game) {
    return notFoundResponse(res, 'Game not found');
  }

  if (name !== undefined) game.name = name;
  if (icon !== undefined) game.icon = icon;
  if (genres !== undefined) game.genres = genres;
  if (isActive !== undefined) game.isActive = isActive;
  game.updatedBy = req.adminId;

  await game.save();

  // Log action
  await AdminLog.logGameAction(req.adminId, ADMIN_ACTIONS.GAME_UPDATED, id, {
    updates: { name, icon, genres, isActive }
  }, req);

  // Invalidate cache
  await cacheService.del('games:list');
  await cacheService.del(`game:${id}`);

  return successResponse(res, { game }, 'Game updated');
});

module.exports = {
  login,
  logout,
  refreshToken,
  getUsers,
  getUserDetails,
  updateUserStatus,
  getPosts,
  deletePost,
  getPendingKyc,
  approveKyc,
  rejectKyc,
  getLogs,
  getStats,
  createAdmin,
  getAdmins,
  updateAdmin,
  createGame,
  updateGame
};

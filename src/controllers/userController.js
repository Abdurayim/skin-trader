const { User, Post } = require('../models');
const { cacheService, imageService } = require('../services');
const { successResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const { paginateQuery } = require('../utils/pagination');
const logger = require('../utils/logger');

/**
 * Get own profile
 * GET /api/v1/users/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId)
    .select('-refreshTokens -kycDocuments.filePath')
    .lean();

  if (!user) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  return successResponse(res, { user });
});

/**
 * Update profile
 * PUT /api/v1/users/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, email, language, bio, socialMedia } = req.body;

  const updateData = {};

  if (displayName !== undefined) updateData.displayName = displayName;
  if (email !== undefined) updateData.email = email;
  if (language !== undefined) updateData.language = language;
  if (bio !== undefined) updateData.bio = bio;
  if (socialMedia !== undefined) updateData.socialMedia = socialMedia;

  const user = await User.findByIdAndUpdate(
    req.userId,
    updateData,
    { new: true, runValidators: true }
  ).select('-refreshTokens -kycDocuments.filePath');

  // Invalidate cache
  await cacheService.invalidateUserCache(req.userId);

  logger.info('Profile updated', { userId: req.userId });

  return successResponse(res, { user }, req.t('user.profileUpdated'));
});

/**
 * Update profile image
 * PUT /api/v1/users/profile/avatar
 */
const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return badRequestResponse(res, 'Image file is required');
  }

  // Process the image
  const processed = await imageService.processProfileImage(req.file.path);

  if (!processed.success) {
    return badRequestResponse(res, 'Failed to process image');
  }

  // Get old avatar to delete
  const user = await User.findById(req.userId).select('avatarUrl');
  const oldAvatar = user.avatarUrl;

  // Update user
  user.avatarUrl = processed.originalPath;
  await user.save();

  // Delete old avatar if exists
  if (oldAvatar) {
    await imageService.deleteImage(oldAvatar);
  }

  // Invalidate cache
  await cacheService.invalidateUserCache(req.userId);

  return successResponse(res, {
    avatarUrl: processed.originalPath,
    thumbnailUrl: processed.thumbnailPath
  }, req.t('user.avatarUpdated'));
});

/**
 * Update location
 * POST /api/v1/users/location
 */
const updateLocation = asyncHandler(async (req, res) => {
  const { coordinates } = req.body;

  const user = await User.findByIdAndUpdate(
    req.userId,
    {
      location: {
        type: 'Point',
        coordinates: [coordinates.longitude, coordinates.latitude],
        updatedAt: new Date()
      }
    },
    { new: true }
  ).select('location');

  // Invalidate cache
  await cacheService.invalidateUserCache(req.userId);

  return successResponse(res, { location: user.location }, req.t('user.locationUpdated'));
});

/**
 * Get public user profile
 * GET /api/v1/users/:id
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try cache first
  const cached = await cacheService.getCachedUserProfile(id);
  if (cached) {
    return successResponse(res, { user: cached });
  }

  const user = await User.findById(id)
    .select('displayName avatarUrl bio postsCount kycStatus createdAt')
    .lean();

  if (!user) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  // Only show verified badge
  user.isVerified = user.kycStatus === 'verified';
  delete user.kycStatus;

  // Cache the result
  await cacheService.cacheUserProfile(id, user);

  return successResponse(res, { user });
});

/**
 * Get user's posts
 * GET /api/v1/users/:id/posts
 */
const getUserPosts = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit, cursor, sortBy, sortOrder } = req.query;

  // Check if user exists
  const userExists = await User.exists({ _id: id });
  if (!userExists) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  const query = {
    userId: id,
    deletedAt: { $exists: false }
  };

  // If not the owner, only show active posts
  if (!req.user || req.user._id.toString() !== id) {
    query.status = 'active';
  }

  const { documents, pagination } = await paginateQuery(Post, query, {
    limit: parseInt(limit) || 20,
    cursor,
    sortBy: sortBy || 'createdAt',
    sortOrder: sortOrder === 'asc' ? 1 : -1,
    populate: [{ path: 'gameId', select: 'name slug icon' }]
  });

  return successResponse(res, { posts: documents, pagination });
});

/**
 * Delete account
 * DELETE /api/v1/users/account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  // Soft delete posts
  await Post.updateMany(
    { userId: req.userId },
    {
      deletedAt: new Date(),
      deletedBy: req.userId,
      deletedByModel: 'User'
    }
  );

  // Delete Firebase user if exists
  if (user.firebaseUid) {
    await require('../services/firebaseAuthService').deleteUser(user.firebaseUid);
  }

  // Delete user
  await User.findByIdAndDelete(req.userId);

  // Invalidate cache
  await cacheService.invalidateUserCache(req.userId);

  logger.info('Account deleted', { userId: req.userId });

  return successResponse(res, null, req.t('user.accountDeleted'));
});

/**
 * Get nearby users (based on location)
 * GET /api/v1/users/nearby
 */
const getNearbyUsers = asyncHandler(async (req, res) => {
  const { maxDistance = 50000, limit = 20 } = req.query; // Default 50km

  if (!req.user.location || !req.user.location.coordinates) {
    return badRequestResponse(res, 'Please update your location first');
  }

  const users = await User.find({
    _id: { $ne: req.userId },
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: req.user.location.coordinates
        },
        $maxDistance: parseInt(maxDistance)
      }
    },
    status: 'active',
    kycStatus: 'verified'
  })
    .select('displayName avatarUrl location createdAt')
    .limit(parseInt(limit))
    .lean();

  return successResponse(res, { users });
});

module.exports = {
  getProfile,
  updateProfile,
  updateAvatar,
  updateLocation,
  getPublicProfile,
  getUserPosts,
  deleteAccount,
  getNearbyUsers
};

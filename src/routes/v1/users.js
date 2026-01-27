const express = require('express');
const router = express.Router();
const { userController } = require('../../controllers');
const { authenticateUser, optionalAuth } = require('../../middlewares/auth');
const { validateBody, validateObjectId } = require('../../middlewares/validation');
const { profileImageUpload, handleUploadError } = require('../../middlewares/upload');
const { userSchemas, paginationSchema } = require('../../utils/validators');

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get own profile
 * @access  Private
 */
router.get(
  '/profile',
  authenticateUser,
  userController.getProfile
);

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update profile
 * @access  Private
 */
router.put(
  '/profile',
  authenticateUser,
  validateBody(userSchemas.updateProfile),
  userController.updateProfile
);

/**
 * @route   PUT /api/v1/users/profile/avatar
 * @desc    Update profile avatar
 * @access  Private
 */
router.put(
  '/profile/avatar',
  authenticateUser,
  profileImageUpload.single('avatar'),
  handleUploadError,
  userController.updateAvatar
);

/**
 * @route   POST /api/v1/users/location
 * @desc    Update user location
 * @access  Private
 */
router.post(
  '/location',
  authenticateUser,
  validateBody(userSchemas.updateLocation),
  userController.updateLocation
);

/**
 * @route   GET /api/v1/users/nearby
 * @desc    Get nearby users
 * @access  Private
 */
router.get(
  '/nearby',
  authenticateUser,
  userController.getNearbyUsers
);

/**
 * @route   DELETE /api/v1/users/account
 * @desc    Delete own account
 * @access  Private
 */
router.delete(
  '/account',
  authenticateUser,
  userController.deleteAccount
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get public user profile
 * @access  Public
 */
router.get(
  '/:id',
  validateObjectId('id'),
  userController.getPublicProfile
);

/**
 * @route   GET /api/v1/users/:id/posts
 * @desc    Get user's posts
 * @access  Public (with optional auth)
 */
router.get(
  '/:id/posts',
  optionalAuth,
  validateObjectId('id'),
  userController.getUserPosts
);

module.exports = router;

const express = require('express');
const router = express.Router();
const { postController } = require('../../controllers');
const { authenticateUser, optionalAuth, requireKyc, requireActiveSubscription } = require('../../middlewares/auth');
const { validateBody, validateQuery, validateObjectId } = require('../../middlewares/validation');
const { postImageUpload, handleUploadError, requireFiles, cleanupOnError } = require('../../middlewares/upload');
const { uploadRateLimiter, searchRateLimiter } = require('../../middlewares/rateLimiter');
const { postSchemas, paginationSchema } = require('../../utils/validators');

/**
 * @route   GET /api/v1/posts
 * @desc    Get posts list with filters
 * @access  Public
 */
router.get(
  '/',
  validateQuery(postSchemas.search),
  postController.getPosts
);

/**
 * @route   GET /api/v1/posts/search
 * @desc    Search posts
 * @access  Public
 */
router.get(
  '/search',
  searchRateLimiter,
  validateQuery(postSchemas.search),
  postController.searchPosts
);

/**
 * @route   GET /api/v1/posts/my
 * @desc    Get my posts
 * @access  Private
 */
router.get(
  '/my',
  authenticateUser,
  postController.getMyPosts
);

/**
 * @route   POST /api/v1/posts
 * @desc    Create new post
 * @access  Private (KYC and Active Subscription required)
 */
router.post(
  '/',
  authenticateUser,
  requireKyc,
  uploadRateLimiter,
  postImageUpload.array('images', 5),
  handleUploadError,
  cleanupOnError,
  requireActiveSubscription,
  requireFiles('images', 1),
  postController.createPost
);

/**
 * @route   GET /api/v1/posts/:id
 * @desc    Get single post
 * @access  Public (with optional auth for contact info)
 */
router.get(
  '/:id',
  optionalAuth,
  validateObjectId('id'),
  postController.getPost
);

/**
 * @route   PUT /api/v1/posts/:id
 * @desc    Update post
 * @access  Private (owner only)
 */
router.put(
  '/:id',
  authenticateUser,
  validateObjectId('id'),
  validateBody(postSchemas.update),
  postController.updatePost
);

/**
 * @route   PATCH /api/v1/posts/:id/status
 * @desc    Update post status
 * @access  Private (owner only)
 */
router.patch(
  '/:id/status',
  authenticateUser,
  validateObjectId('id'),
  validateBody(postSchemas.updateStatus),
  postController.updatePostStatus
);

/**
 * @route   DELETE /api/v1/posts/:id
 * @desc    Delete post
 * @access  Private (owner only)
 */
router.delete(
  '/:id',
  authenticateUser,
  validateObjectId('id'),
  postController.deletePost
);

/**
 * @route   POST /api/v1/posts/:id/images
 * @desc    Add images to post
 * @access  Private (owner only)
 */
router.post(
  '/:id/images',
  authenticateUser,
  validateObjectId('id'),
  uploadRateLimiter,
  postImageUpload.array('images', 5),
  handleUploadError,
  cleanupOnError,
  requireFiles('images', 1),
  postController.addImages
);

/**
 * @route   DELETE /api/v1/posts/:id/images/:imageId
 * @desc    Remove image from post
 * @access  Private (owner only)
 */
router.delete(
  '/:id/images/:imageId',
  authenticateUser,
  validateObjectId('id'),
  postController.removeImage
);

module.exports = router;

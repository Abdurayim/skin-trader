const { Post, Game, User } = require('../models');
const { cacheService, imageService } = require('../services');
const { successResponse, createdResponse, badRequestResponse, notFoundResponse, forbiddenResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const { paginateQuery, parsePaginationParams } = require('../utils/pagination');
const { POST_STATUS, KYC_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Create new post
 * POST /api/v1/posts
 */
const createPost = asyncHandler(async (req, res) => {
  // Check KYC status
  if (req.user.kycStatus !== KYC_STATUS.VERIFIED) {
    return forbiddenResponse(res, req.t('errors.kycRequired'));
  }

  if (!req.files || req.files.length === 0) {
    return badRequestResponse(res, 'At least one image is required');
  }

  const { title, description, price, currency, gameId, genre, type, contactInfo } = req.body;

  // Verify game exists
  const game = await Game.findById(gameId);
  if (!game || !game.isActive) {
    return badRequestResponse(res, req.t('errors.gameNotFound'));
  }

  // Process images
  const processedImages = await imageService.processPostImages(req.files);

  const failedImages = processedImages.filter(img => !img.success);
  if (failedImages.length === processedImages.length) {
    return badRequestResponse(res, 'Failed to process images');
  }

  // Auto-populate contactInfo from user profile if not provided
  let finalContactInfo = contactInfo
    ? (typeof contactInfo === 'string' ? JSON.parse(contactInfo) : contactInfo)
    : null
  if (!finalContactInfo && req.user.email) {
    finalContactInfo = { email: req.user.email }
  }

  // Create post
  const post = new Post({
    userId: req.userId,
    title,
    description,
    price,
    currency,
    gameId,
    genre: genre || (game.genres[0] || null),
    type,
    contactInfo: finalContactInfo || undefined,
    images: processedImages
      .filter(img => img.success)
      .map(img => ({
        originalPath: img.originalPath,
        thumbnailPath: img.thumbnailPath,
        filename: img.filename,
        size: img.size,
        mimeType: img.mimeType
      }))
  });

  await post.save();

  // Update game post count
  await Game.findByIdAndUpdate(gameId, { $inc: { postsCount: 1 } });

  // Invalidate cache
  await cacheService.invalidatePost(post._id);

  logger.info('Post created', { postId: post._id, userId: req.userId });

  // Populate for response
  const populatedPost = await Post.findById(post._id)
    .populate('gameId', 'name slug icon')
    .lean();

  return createdResponse(res, { post: populatedPost }, req.t('post.created'));
});

/**
 * Get posts list with filters
 * GET /api/v1/posts
 */
const getPosts = asyncHandler(async (req, res) => {
  const { gameId, genre, type, minPrice, maxPrice, currency, status } = req.query;
  const { limit, cursor, sortBy, sortOrder } = parsePaginationParams(req.query);

  const query = {
    deletedAt: { $exists: false },
    status: status || POST_STATUS.ACTIVE
  };

  if (gameId) query.gameId = gameId;
  if (genre) query.genre = genre;
  if (type) query.type = type;
  if (currency) query.currency = currency;

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  const { documents, pagination } = await paginateQuery(Post, query, {
    limit,
    cursor,
    sortBy,
    sortOrder,
    populate: [
      { path: 'gameId', select: 'name slug icon' },
      { path: 'userId', select: 'displayName avatarUrl kycStatus' }
    ]
  });

  return successResponse(res, { posts: documents, pagination });
});

/**
 * Get single post
 * GET /api/v1/posts/:id
 */
const getPost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try cache first
  const cached = await cacheService.getCachedPost(id);
  if (cached) {
    // Increment views async
    Post.findByIdAndUpdate(id, { $inc: { viewsCount: 1 } }).exec();
    return successResponse(res, { post: cached });
  }

  const post = await Post.findOne({
    _id: id,
    deletedAt: { $exists: false }
  })
    .populate('gameId', 'name slug icon genres')
    .populate('userId', 'displayName avatarUrl kycStatus phoneNumber')
    .lean();

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  // Hide contact info if not authenticated
  if (!req.user) {
    delete post.contactInfo;
  }

  // Cache the post
  await cacheService.cachePost(id, post);

  // Increment views
  await Post.findByIdAndUpdate(id, { $inc: { viewsCount: 1 } });

  return successResponse(res, { post });
});

/**
 * Update post
 * PUT /api/v1/posts/:id
 */
const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, price, currency, gameId, genre, type, contactInfo } = req.body;

  const post = await Post.findOne({
    _id: id,
    userId: req.userId,
    deletedAt: { $exists: false }
  });

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  // Verify game exists if changing it
  if (gameId !== undefined && gameId !== post.gameId?.toString()) {
    const game = await Game.findById(gameId);
    if (!game || !game.isActive) {
      return badRequestResponse(res, req.t('errors.gameNotFound'));
    }
  }

  // Update fields
  if (title !== undefined) post.title = title;
  if (description !== undefined) post.description = description;
  if (price !== undefined) post.price = price;
  if (currency !== undefined) post.currency = currency;
  if (gameId !== undefined) post.gameId = gameId;
  if (genre !== undefined) post.genre = genre;
  if (type !== undefined) post.type = type;
  if (contactInfo !== undefined) {
    post.contactInfo = typeof contactInfo === 'string' ? JSON.parse(contactInfo) : contactInfo;
  }

  await post.save();

  // Invalidate cache
  await cacheService.invalidatePost(id);

  logger.info('Post updated', { postId: id, userId: req.userId });

  const updatedPost = await Post.findById(id)
    .populate('gameId', 'name slug icon')
    .lean();

  return successResponse(res, { post: updatedPost }, req.t('post.updated'));
});

/**
 * Update post status (active/sold)
 * PATCH /api/v1/posts/:id/status
 */
const updatePostStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const post = await Post.findOne({
    _id: id,
    userId: req.userId,
    deletedAt: { $exists: false }
  });

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  const oldStatus = post.status;
  post.status = status;
  await post.save();

  // Invalidate cache
  await cacheService.invalidatePost(id);

  logger.info('Post status updated', { postId: id, oldStatus, newStatus: status });

  return successResponse(res, { post: { _id: post._id, status: post.status } }, req.t('post.statusUpdated'));
});

/**
 * Delete post
 * DELETE /api/v1/posts/:id
 */
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const post = await Post.findOne({
    _id: id,
    userId: req.userId,
    deletedAt: { $exists: false }
  });

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  // Soft delete
  post.deletedAt = new Date();
  post.deletedBy = req.userId;
  post.deletedByModel = 'User';
  await post.save();

  // Update game post count
  await Game.findByIdAndUpdate(post.gameId, { $inc: { postsCount: -1 } });

  // Update user post count
  await User.findByIdAndUpdate(req.userId, { $inc: { postsCount: -1 } });

  // Delete images
  await imageService.deleteImages(post.images);

  // Invalidate cache
  await cacheService.invalidatePost(id);

  logger.info('Post deleted', { postId: id, userId: req.userId });

  return successResponse(res, null, req.t('post.deleted'));
});

/**
 * Search posts
 * GET /api/v1/posts/search
 */
const searchPosts = asyncHandler(async (req, res) => {
  const { q, gameId, genre, type, minPrice, maxPrice, currency } = req.query;
  const { limit, cursor, sortBy, sortOrder } = parsePaginationParams(req.query);

  if (!q || q.length < 2) {
    return badRequestResponse(res, 'Search query must be at least 2 characters');
  }

  // Check cache
  const cacheKey = { q, gameId, genre, type, minPrice, maxPrice, currency, cursor };
  const cached = await cacheService.getCachedSearchResults(cacheKey);
  if (cached) {
    return successResponse(res, cached);
  }

  const query = {
    $text: { $search: q },
    status: POST_STATUS.ACTIVE,
    deletedAt: { $exists: false }
  };

  if (gameId) query.gameId = gameId;
  if (genre) query.genre = genre;
  if (type) query.type = type;
  if (currency) query.currency = currency;

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  const { documents, pagination } = await paginateQuery(Post, query, {
    limit,
    cursor,
    sortBy,
    sortOrder,
    populate: [
      { path: 'gameId', select: 'name slug icon' },
      { path: 'userId', select: 'displayName avatarUrl' }
    ]
  });

  const result = { posts: documents, pagination };

  // Cache results
  await cacheService.cacheSearchResults(cacheKey, result);

  return successResponse(res, result);
});

/**
 * Get my posts
 * GET /api/v1/posts/my
 */
const getMyPosts = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { limit, cursor, sortBy, sortOrder } = parsePaginationParams(req.query);

  const query = {
    userId: req.userId,
    deletedAt: { $exists: false }
  };

  if (status) query.status = status;

  const { documents, pagination } = await paginateQuery(Post, query, {
    limit,
    cursor,
    sortBy,
    sortOrder,
    populate: [{ path: 'gameId', select: 'name slug icon' }]
  });

  return successResponse(res, { posts: documents, pagination });
});

/**
 * Add images to existing post
 * POST /api/v1/posts/:id/images
 */
const addImages = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!req.files || req.files.length === 0) {
    return badRequestResponse(res, 'At least one image is required');
  }

  const post = await Post.findOne({
    _id: id,
    userId: req.userId,
    deletedAt: { $exists: false }
  });

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  // Check image limit
  if (post.images.length + req.files.length > 5) {
    return badRequestResponse(res, 'Maximum 5 images allowed per post');
  }

  // Process new images
  const processedImages = await imageService.processPostImages(req.files);

  const newImages = processedImages
    .filter(img => img.success)
    .map(img => ({
      originalPath: img.originalPath,
      thumbnailPath: img.thumbnailPath,
      filename: img.filename,
      size: img.size,
      mimeType: img.mimeType
    }));

  post.images.push(...newImages);
  await post.save();

  // Invalidate cache
  await cacheService.invalidatePost(id);

  return successResponse(res, { images: post.images }, req.t('post.imagesAdded'));
});

/**
 * Remove image from post
 * DELETE /api/v1/posts/:id/images/:imageId
 */
const removeImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const post = await Post.findOne({
    _id: id,
    userId: req.userId,
    deletedAt: { $exists: false }
  });

  if (!post) {
    return notFoundResponse(res, req.t('errors.postNotFound'));
  }

  // Don't allow removing last image
  if (post.images.length <= 1) {
    return badRequestResponse(res, 'Cannot remove the last image');
  }

  const imageIndex = post.images.findIndex(img => img._id.toString() === imageId);

  if (imageIndex === -1) {
    return notFoundResponse(res, 'Image not found');
  }

  const removedImage = post.images[imageIndex];
  post.images.splice(imageIndex, 1);
  await post.save();

  // Delete the image file
  await imageService.deleteImage(removedImage.originalPath);

  // Invalidate cache
  await cacheService.invalidatePost(id);

  return successResponse(res, { images: post.images }, req.t('post.imageRemoved'));
});

module.exports = {
  createPost,
  getPosts,
  getPost,
  updatePost,
  updatePostStatus,
  deletePost,
  searchPosts,
  getMyPosts,
  addImages,
  removeImage
};

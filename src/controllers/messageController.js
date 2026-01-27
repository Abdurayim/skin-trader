const { Message, Conversation, User } = require('../models');
const { successResponse, createdResponse, badRequestResponse, notFoundResponse, forbiddenResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const { paginateQuery } = require('../utils/pagination');
const { KYC_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Send message
 * POST /api/v1/messages/send
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { recipientId, content, postId } = req.body;

  // Check KYC status
  if (req.user.kycStatus !== KYC_STATUS.VERIFIED) {
    return forbiddenResponse(res, req.t('errors.kycRequired'));
  }

  // Can't message yourself
  if (recipientId === req.userId.toString()) {
    return badRequestResponse(res, 'Cannot send message to yourself');
  }

  // Check recipient exists and is verified
  const recipient = await User.findById(recipientId);
  if (!recipient) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  if (recipient.status === 'banned' || recipient.status === 'suspended') {
    return badRequestResponse(res, 'Cannot send message to this user');
  }

  // Find or create conversation
  let conversation = await Conversation.findOrCreate(req.userId, recipientId, postId);

  // Check if conversation was deleted by the user, if so, undelete
  if (conversation.isDeletedFor(req.userId)) {
    conversation.deletedFor = conversation.deletedFor.filter(
      d => d.userId.toString() !== req.userId.toString()
    );
    await conversation.save();
  }

  // Create message
  const message = new Message({
    conversationId: conversation._id,
    senderId: req.userId,
    content,
    postId
  });

  await message.save();

  // Update conversation
  await conversation.updateLastMessage(message);

  // Increment unread count for recipient
  await conversation.incrementUnread(recipientId);

  logger.info('Message sent', {
    messageId: message._id,
    senderId: req.userId,
    recipientId
  });

  // Populate sender info for response
  const populatedMessage = await Message.findById(message._id)
    .populate('senderId', 'displayName avatarUrl')
    .lean();

  return createdResponse(res, { message: populatedMessage }, req.t('message.sent'));
});

/**
 * Get conversations list
 * GET /api/v1/messages/conversations
 */
const getConversations = asyncHandler(async (req, res) => {
  const { limit = 20, cursor } = req.query;

  const conversations = await Conversation.findUserConversations(req.userId, {
    limit: parseInt(limit),
    cursor
  });

  // Add unread count for current user
  const conversationsWithUnread = conversations.map(conv => ({
    ...conv.toObject(),
    unreadCount: conv.getUnreadCount(req.userId),
    otherParticipant: conv.participants.find(
      p => p._id.toString() !== req.userId.toString()
    )
  }));

  // Build pagination
  const hasMore = conversations.length === parseInt(limit);
  const nextCursor = hasMore
    ? conversations[conversations.length - 1].updatedAt.toISOString()
    : null;

  return successResponse(res, {
    conversations: conversationsWithUnread,
    pagination: { hasMore, nextCursor }
  });
});

/**
 * Get conversation messages
 * GET /api/v1/messages/conversations/:id
 */
const getConversationMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, cursor } = req.query;

  // Find conversation and verify access
  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return notFoundResponse(res, req.t('errors.conversationNotFound'));
  }

  // Check if user is participant
  const isParticipant = conversation.participants.some(
    p => p.toString() === req.userId.toString()
  );

  if (!isParticipant) {
    return forbiddenResponse(res, 'Access denied');
  }

  // Check if deleted for user
  if (conversation.isDeletedFor(req.userId)) {
    return notFoundResponse(res, req.t('errors.conversationNotFound'));
  }

  // Get messages
  const messages = await Message.findByConversation(id, {
    limit: parseInt(limit),
    cursor
  });

  // Mark messages as read
  await Message.markConversationAsRead(id, req.userId);
  await conversation.resetUnread(req.userId);

  // Build pagination (cursor is message _id)
  const hasMore = messages.length === parseInt(limit);
  const nextCursor = hasMore ? messages[messages.length - 1]._id.toString() : null;

  return successResponse(res, {
    messages: messages.reverse(), // Return oldest first
    pagination: { hasMore, nextCursor }
  });
});

/**
 * Mark conversation as read
 * PATCH /api/v1/messages/read/:conversationId
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    return notFoundResponse(res, req.t('errors.conversationNotFound'));
  }

  // Check if user is participant
  const isParticipant = conversation.participants.some(
    p => p.toString() === req.userId.toString()
  );

  if (!isParticipant) {
    return forbiddenResponse(res, 'Access denied');
  }

  // Mark all messages as read
  await Message.markConversationAsRead(conversationId, req.userId);
  await conversation.resetUnread(req.userId);

  return successResponse(res, null, req.t('message.markedAsRead'));
});

/**
 * Delete message
 * DELETE /api/v1/messages/:id
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const message = await Message.findById(id);

  if (!message) {
    return notFoundResponse(res, req.t('errors.messageNotFound'));
  }

  // Only sender can delete
  if (message.senderId.toString() !== req.userId.toString()) {
    return forbiddenResponse(res, 'Can only delete your own messages');
  }

  // Soft delete
  await message.softDelete(req.userId);

  return successResponse(res, null, req.t('message.deleted'));
});

/**
 * Delete conversation (soft delete for user)
 * DELETE /api/v1/messages/conversations/:id
 */
const deleteConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const conversation = await Conversation.findById(id);

  if (!conversation) {
    return notFoundResponse(res, req.t('errors.conversationNotFound'));
  }

  // Check if user is participant
  const isParticipant = conversation.participants.some(
    p => p.toString() === req.userId.toString()
  );

  if (!isParticipant) {
    return forbiddenResponse(res, 'Access denied');
  }

  // Soft delete for user
  await conversation.softDeleteFor(req.userId);

  return successResponse(res, null, req.t('message.conversationDeleted'));
});

/**
 * Get unread count
 * GET /api/v1/messages/unread-count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Conversation.getTotalUnreadCount(req.userId);

  return successResponse(res, { unreadCount: count });
});

/**
 * Get or create conversation with user
 * POST /api/v1/messages/conversations/start
 */
const startConversation = asyncHandler(async (req, res) => {
  const { userId, postId } = req.body;

  // Check KYC status
  if (req.user.kycStatus !== KYC_STATUS.VERIFIED) {
    return forbiddenResponse(res, req.t('errors.kycRequired'));
  }

  // Can't message yourself
  if (userId === req.userId.toString()) {
    return badRequestResponse(res, 'Cannot start conversation with yourself');
  }

  // Check user exists
  const targetUser = await User.findById(userId);
  if (!targetUser) {
    return notFoundResponse(res, req.t('errors.userNotFound'));
  }

  // Find or create conversation
  const conversation = await Conversation.findOrCreate(req.userId, userId, postId);

  // Populate for response
  const populatedConversation = await Conversation.findById(conversation._id)
    .populate('participants', 'displayName avatarUrl')
    .populate('initialPostId', 'title images');

  return successResponse(res, { conversation: populatedConversation });
});

module.exports = {
  sendMessage,
  getConversations,
  getConversationMessages,
  markAsRead,
  deleteMessage,
  deleteConversation,
  getUnreadCount,
  startConversation
};

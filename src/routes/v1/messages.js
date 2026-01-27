const express = require('express');
const router = express.Router();
const { messageController } = require('../../controllers');
const { authenticateUser, requireKyc } = require('../../middlewares/auth');
const { validateBody, validateObjectId } = require('../../middlewares/validation');
const { messageRateLimiter } = require('../../middlewares/rateLimiter');
const { messageSchemas } = require('../../utils/validators');

/**
 * @route   POST /api/v1/messages/send
 * @desc    Send a message
 * @access  Private (KYC required)
 */
router.post(
  '/send',
  authenticateUser,
  requireKyc,
  messageRateLimiter,
  validateBody(messageSchemas.send),
  messageController.sendMessage
);

/**
 * @route   GET /api/v1/messages/conversations
 * @desc    Get all conversations
 * @access  Private
 */
router.get(
  '/conversations',
  authenticateUser,
  messageController.getConversations
);

/**
 * @route   POST /api/v1/messages/conversations/start
 * @desc    Start a new conversation
 * @access  Private (KYC required)
 */
router.post(
  '/conversations/start',
  authenticateUser,
  requireKyc,
  messageController.startConversation
);

/**
 * @route   GET /api/v1/messages/conversations/:id
 * @desc    Get conversation messages
 * @access  Private
 */
router.get(
  '/conversations/:id',
  authenticateUser,
  validateObjectId('id'),
  messageController.getConversationMessages
);

/**
 * @route   DELETE /api/v1/messages/conversations/:id
 * @desc    Delete conversation
 * @access  Private
 */
router.delete(
  '/conversations/:id',
  authenticateUser,
  validateObjectId('id'),
  messageController.deleteConversation
);

/**
 * @route   PATCH /api/v1/messages/read/:conversationId
 * @desc    Mark conversation as read
 * @access  Private
 */
router.patch(
  '/read/:conversationId',
  authenticateUser,
  validateObjectId('conversationId'),
  messageController.markAsRead
);

/**
 * @route   DELETE /api/v1/messages/:id
 * @desc    Delete a message
 * @access  Private
 */
router.delete(
  '/:id',
  authenticateUser,
  validateObjectId('id'),
  messageController.deleteMessage
);

/**
 * @route   GET /api/v1/messages/unread-count
 * @desc    Get total unread count
 * @access  Private
 */
router.get(
  '/unread-count',
  authenticateUser,
  messageController.getUnreadCount
);

module.exports = router;

const mongoose = require('mongoose');
const { MESSAGE_STATUS } = require('../utils/constants');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: Object.values(MESSAGE_STATUS),
    default: MESSAGE_STATUS.SENT
  },
  readAt: Date,
  // Optional context - which post they're discussing
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  // For soft delete
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for efficient queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });

// Instance methods
messageSchema.methods.markAsRead = function() {
  if (this.status !== MESSAGE_STATUS.READ) {
    this.status = MESSAGE_STATUS.READ;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.markAsDelivered = function() {
  if (this.status === MESSAGE_STATUS.SENT) {
    this.status = MESSAGE_STATUS.DELIVERED;
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.softDelete = function(userId) {
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Static methods
messageSchema.statics.findByConversation = function(conversationId, options = {}) {
  const { limit = 50, cursor = null } = options;
  const query = {
    conversationId,
    deletedAt: { $exists: false }
  };

  if (cursor) {
    query._id = { $lt: cursor };
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('senderId', 'displayName avatarUrl');
};

messageSchema.statics.markConversationAsRead = async function(conversationId, userId) {
  return this.updateMany(
    {
      conversationId,
      senderId: { $ne: userId },
      status: { $ne: MESSAGE_STATUS.READ }
    },
    {
      status: MESSAGE_STATUS.READ,
      readAt: new Date()
    }
  );
};

messageSchema.statics.getUnreadCount = function(conversationId, userId) {
  return this.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    status: { $ne: MESSAGE_STATUS.READ },
    deletedAt: { $exists: false }
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;

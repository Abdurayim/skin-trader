const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    content: String,
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: Date
  },
  // Track unread counts per participant
  unreadCounts: {
    type: Map,
    of: Number,
    default: {}
  },
  // Optional - initial post that started the conversation
  initialPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  // Soft delete tracking per user
  deletedFor: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedAt: Date
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      // Convert Map to object for JSON
      if (ret.unreadCounts) {
        ret.unreadCounts = Object.fromEntries(ret.unreadCounts);
      }
      return ret;
    }
  }
});

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'lastMessage.createdAt': -1 });
conversationSchema.index({ updatedAt: -1 });

// Ensure exactly 2 participants
conversationSchema.pre('save', function(next) {
  if (this.participants.length !== 2) {
    return next(new Error('Conversation must have exactly 2 participants'));
  }
  next();
});

// Instance methods
conversationSchema.methods.getOtherParticipant = function(userId) {
  return this.participants.find(
    p => p.toString() !== userId.toString()
  );
};

conversationSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    content: message.content.substring(0, 100), // Truncate for preview
    senderId: message.senderId,
    createdAt: message.createdAt
  };
  return this.save();
};

conversationSchema.methods.incrementUnread = function(userId) {
  const currentCount = this.unreadCounts.get(userId.toString()) || 0;
  this.unreadCounts.set(userId.toString(), currentCount + 1);
  return this.save();
};

conversationSchema.methods.resetUnread = function(userId) {
  this.unreadCounts.set(userId.toString(), 0);
  return this.save();
};

conversationSchema.methods.getUnreadCount = function(userId) {
  return this.unreadCounts.get(userId.toString()) || 0;
};

conversationSchema.methods.isDeletedFor = function(userId) {
  return this.deletedFor.some(
    d => d.userId.toString() === userId.toString()
  );
};

conversationSchema.methods.softDeleteFor = function(userId) {
  // Remove if already exists
  this.deletedFor = this.deletedFor.filter(
    d => d.userId.toString() !== userId.toString()
  );
  this.deletedFor.push({
    userId,
    deletedAt: new Date()
  });
  return this.save();
};

// Static methods
conversationSchema.statics.findBetweenUsers = function(userId1, userId2) {
  return this.findOne({
    participants: { $all: [userId1, userId2] }
  });
};

conversationSchema.statics.findOrCreate = async function(userId1, userId2, postId = null) {
  let conversation = await this.findBetweenUsers(userId1, userId2);

  if (!conversation) {
    conversation = new this({
      participants: [userId1, userId2],
      initialPostId: postId
    });
    await conversation.save();
  }

  return conversation;
};

conversationSchema.statics.findUserConversations = function(userId, options = {}) {
  const { limit = 20, cursor = null } = options;

  const query = {
    participants: userId,
    'deletedFor.userId': { $ne: userId }
  };

  if (cursor) {
    query.updatedAt = { $lt: new Date(cursor) };
  }

  return this.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate('participants', 'displayName avatarUrl')
    .populate('initialPostId', 'title images');
};

conversationSchema.statics.getTotalUnreadCount = async function(userId) {
  const conversations = await this.find({
    participants: userId,
    'deletedFor.userId': { $ne: userId }
  });

  return conversations.reduce((total, conv) => {
    return total + (conv.unreadCounts.get(userId.toString()) || 0);
  }, 0);
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;

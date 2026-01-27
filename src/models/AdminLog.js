const mongoose = require('mongoose');
const { ADMIN_ACTIONS } = require('../utils/constants');

const adminLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: Object.values(ADMIN_ACTIONS),
    required: true,
    index: true
  },
  targetType: {
    type: String,
    enum: ['User', 'Post', 'Admin', 'Game', 'System'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetType'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  previousState: mongoose.Schema.Types.Mixed,
  newState: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  // Additional context
  reason: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for efficient querying
adminLogSchema.index({ adminId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1 });
adminLogSchema.index({ createdAt: -1 });

// TTL index - logs older than 90 days will be automatically deleted
// Comment out or adjust if you need longer retention
// adminLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static methods
adminLogSchema.statics.log = async function(data) {
  const log = new this(data);
  return log.save();
};

adminLogSchema.statics.logUserAction = function(adminId, action, userId, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'User',
    targetId: userId,
    details,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.logPostAction = function(adminId, action, postId, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'Post',
    targetId: postId,
    details,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.logAdminAction = function(adminId, action, targetAdminId, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'Admin',
    targetId: targetAdminId,
    details,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.logKycAction = function(adminId, action, userId, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'User',
    targetId: userId,
    details,
    reason: details.reason,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.logGameAction = function(adminId, action, gameId, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'Game',
    targetId: gameId,
    details,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.logAuthAction = function(adminId, action, details = {}, req = null) {
  return this.log({
    adminId,
    action,
    targetType: 'System',
    details,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent')
  });
};

adminLogSchema.statics.getByAdmin = function(adminId, options = {}) {
  const { limit = 50, page = 1 } = options;
  return this.find({ adminId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('adminId', 'name email role');
};

adminLogSchema.statics.getByTarget = function(targetType, targetId, options = {}) {
  const { limit = 50, page = 1 } = options;
  return this.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('adminId', 'name email role');
};

adminLogSchema.statics.getByAction = function(action, options = {}) {
  const { limit = 50, page = 1, startDate, endDate } = options;
  const query = { action };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('adminId', 'name email role');
};

adminLogSchema.statics.getRecentLogs = function(limit = 100) {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('adminId', 'name email role');
};

const AdminLog = mongoose.model('AdminLog', adminLogSchema);

module.exports = AdminLog;

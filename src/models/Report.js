const mongoose = require('mongoose');
const crypto = require('crypto');
const {
  REPORT_TYPE,
  REPORT_CATEGORY,
  REPORT_STATUS,
  REPORT_PRIORITY,
  REPORT_ACTION
} = require('../utils/constants');

const resolutionSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: Object.values(REPORT_ACTION),
    required: true
  },
  notes: {
    type: String,
    maxlength: 2000
  },
  adminNotes: {
    type: String,
    maxlength: 2000
  },
  resolvedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reportType: {
    type: String,
    enum: Object.values(REPORT_TYPE),
    required: true,
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // Dynamic reference - either 'Post' or 'User'
  targetModel: {
    type: String,
    required: true,
    enum: ['Post', 'User']
  },
  category: {
    type: String,
    enum: Object.values(REPORT_CATEGORY),
    required: true,
    index: true
  },
  description: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  status: {
    type: String,
    enum: Object.values(REPORT_STATUS),
    default: REPORT_STATUS.PENDING,
    index: true
  },
  priority: {
    type: String,
    enum: Object.values(REPORT_PRIORITY),
    default: REPORT_PRIORITY.LOW,
    index: true
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  reviewedAt: Date,
  resolution: resolutionSchema,
  // Duplicate prevention - hash of reporterId + targetId + category
  reportHash: {
    type: String,
    unique: true,
    index: true
  },
  // Additional metadata
  ipAddress: String,
  userAgent: String,
  // Tracking
  reportCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ targetId: 1, reportType: 1 });
reportSchema.index({ status: 1, priority: 1, createdAt: -1 });
reportSchema.index({ category: 1, status: 1 });

// Virtual for target population
reportSchema.virtual('target', {
  ref: function() { return this.targetModel; },
  localField: 'targetId',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to generate report hash
reportSchema.pre('save', function(next) {
  if (this.isNew) {
    // Generate hash for duplicate detection
    const hashString = `${this.reporterId}_${this.targetId}_${this.category}`;
    this.reportHash = crypto.createHash('md5').update(hashString).digest('hex');
  }
  next();
});

// Instance methods
reportSchema.methods.isPending = function() {
  return this.status === REPORT_STATUS.PENDING;
};

reportSchema.methods.isResolved = function() {
  return this.status === REPORT_STATUS.RESOLVED;
};

reportSchema.methods.markUnderReview = function(adminId) {
  this.status = REPORT_STATUS.UNDER_REVIEW;
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  return this.save();
};

reportSchema.methods.resolve = function(action, notes, adminNotes, adminId) {
  this.status = REPORT_STATUS.RESOLVED;
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.resolution = {
    action,
    notes,
    adminNotes,
    resolvedAt: new Date()
  };
  return this.save();
};

reportSchema.methods.dismiss = function(reason, adminId) {
  this.status = REPORT_STATUS.DISMISSED;
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.resolution = {
    action: REPORT_ACTION.DISMISS,
    notes: reason,
    resolvedAt: new Date()
  };
  return this.save();
};

reportSchema.methods.escalate = function() {
  if (this.priority === REPORT_PRIORITY.LOW) {
    this.priority = REPORT_PRIORITY.MEDIUM;
  } else if (this.priority === REPORT_PRIORITY.MEDIUM) {
    this.priority = REPORT_PRIORITY.HIGH;
  } else if (this.priority === REPORT_PRIORITY.HIGH) {
    this.priority = REPORT_PRIORITY.CRITICAL;
  }
  return this.save();
};

// Static methods
reportSchema.statics.findByReporter = function(reporterId) {
  return this.find({ reporterId }).sort({ createdAt: -1 });
};

reportSchema.statics.findByTarget = function(targetId, reportType) {
  return this.find({ targetId, reportType }).sort({ createdAt: -1 });
};

reportSchema.statics.findPending = function() {
  return this.find({ status: REPORT_STATUS.PENDING })
    .sort({ priority: -1, createdAt: 1 });
};

reportSchema.statics.checkDuplicate = async function(reporterId, targetId, category) {
  const hashString = `${reporterId}_${targetId}_${category}`;
  const reportHash = crypto.createHash('md5').update(hashString).digest('hex');
  const existing = await this.findOne({ reportHash });
  return existing !== null;
};

reportSchema.statics.countByTarget = async function(targetId, reportType) {
  return this.countDocuments({ targetId, reportType });
};

reportSchema.statics.getReportStats = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          status: '$status',
          category: '$category'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

reportSchema.statics.autoEscalateReports = async function() {
  // Auto-escalate if target has more than 5 reports in 24 hours
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const reportsToEscalate = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: yesterday },
        status: REPORT_STATUS.PENDING
      }
    },
    {
      $group: {
        _id: { targetId: '$targetId', reportType: '$reportType' },
        count: { $sum: 1 },
        reports: { $push: '$_id' }
      }
    },
    {
      $match: {
        count: { $gte: 5 }
      }
    }
  ]);

  for (const group of reportsToEscalate) {
    await this.updateMany(
      { _id: { $in: group.reports } },
      { $set: { priority: REPORT_PRIORITY.HIGH } }
    );
  }

  return reportsToEscalate.length;
};

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;

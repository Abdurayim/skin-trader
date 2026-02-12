const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLAN } = require('../utils/constants');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(SUBSCRIPTION_STATUS),
    default: SUBSCRIPTION_STATUS.PENDING,
    index: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    index: true
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: Object.values(SUBSCRIPTION_PLAN),
    default: SUBSCRIPTION_PLAN.MONTHLY,
    required: true
  },
  lastPaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  // Tracking fields
  gracePeriodStarted: Date,
  cancelledAt: Date,
  cancelReason: String
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });
subscriptionSchema.index({ createdAt: -1 });

// Instance methods
subscriptionSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === SUBSCRIPTION_STATUS.ACTIVE && this.endDate > now;
};

subscriptionSchema.methods.isExpired = function() {
  const now = new Date();
  return this.endDate <= now;
};

subscriptionSchema.methods.daysRemaining = function() {
  const now = new Date();
  const diff = this.endDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

subscriptionSchema.methods.extend = function(days) {
  this.endDate = new Date(this.endDate.getTime() + (days * 24 * 60 * 60 * 1000));
  return this.save();
};

subscriptionSchema.methods.cancel = function(reason) {
  this.autoRenew = false;
  this.cancelledAt = new Date();
  this.cancelReason = reason;
  return this.save();
};

subscriptionSchema.methods.markExpired = function() {
  this.status = SUBSCRIPTION_STATUS.EXPIRED;
  return this.save();
};

// Static methods
subscriptionSchema.statics.findActiveByUser = function(userId) {
  return this.findOne({
    userId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gt: new Date() }
  });
};

subscriptionSchema.statics.findExpiredSubscriptions = function() {
  return this.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $lte: new Date() }
  });
};

subscriptionSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;

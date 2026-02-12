const mongoose = require('mongoose');
const { TRANSACTION_STATUS, PAYMENT_METHOD, CURRENCIES } = require('../utils/constants');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  paymeTransactionId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: Object.values(CURRENCIES),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUS),
    default: TRANSACTION_STATUS.PENDING,
    index: true
  },
  paymentMethod: {
    type: String,
    enum: Object.values(PAYMENT_METHOD),
    default: PAYMENT_METHOD.PAYME,
    required: true
  },
  // PayMe response data
  paymentResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  // Webhook tracking
  webhookReceived: {
    type: Boolean,
    default: false
  },
  webhookReceivedAt: Date,
  // Metadata
  ipAddress: String,
  userAgent: String,
  // Error tracking
  errorMessage: String,
  errorCode: String,
  // Refund tracking
  refundedAt: Date,
  refundReason: String,
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
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

// Indexes
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ subscriptionId: 1 });

// Instance methods
transactionSchema.methods.markAsCompleted = function(paymentResponse) {
  this.status = TRANSACTION_STATUS.COMPLETED;
  this.paymentResponse = paymentResponse;
  this.webhookReceived = true;
  this.webhookReceivedAt = new Date();
  return this.save();
};

transactionSchema.methods.markAsFailed = function(errorMessage, errorCode) {
  this.status = TRANSACTION_STATUS.FAILED;
  this.errorMessage = errorMessage;
  this.errorCode = errorCode;
  return this.save();
};

transactionSchema.methods.markAsRefunded = function(reason, adminId) {
  this.status = TRANSACTION_STATUS.REFUNDED;
  this.refundedAt = new Date();
  this.refundReason = reason;
  this.refundedBy = adminId;
  return this.save();
};

transactionSchema.methods.isCompleted = function() {
  return this.status === TRANSACTION_STATUS.COMPLETED;
};

transactionSchema.methods.isPending = function() {
  return this.status === TRANSACTION_STATUS.PENDING ||
         this.status === TRANSACTION_STATUS.PROCESSING;
};

// Static methods
transactionSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

transactionSchema.statics.findByPaymeTransactionId = function(paymeTransactionId) {
  return this.findOne({ paymeTransactionId });
};

transactionSchema.statics.findPendingTransactions = function() {
  return this.find({
    status: { $in: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.PROCESSING] }
  });
};

transactionSchema.statics.getRevenueStats = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        status: TRANSACTION_STATUS.COMPLETED,
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$currency',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

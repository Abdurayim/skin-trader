const mongoose = require('mongoose');
const { USER_STATUS, KYC_STATUS, LANGUAGES, SOCIAL_PLATFORMS, SUBSCRIPTION_STATUS } = require('../utils/constants');

const socialMediaSchema = new mongoose.Schema({
  platform: {
    type: String,
    enum: SOCIAL_PLATFORMS
  },
  username: {
    type: String,
    maxlength: 100,
    trim: true
  },
  url: {
    type: String,
    trim: true
  }
}, { _id: false });

const kycDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['id_card', 'passport', 'selfie'],
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: Date
}, { _id: false });

const locationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  phoneNumber: {
    type: String,
    sparse: true,
    trim: true
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  bio: {
    type: String,
    maxlength: 500,
    trim: true
  },
  avatarUrl: {
    type: String,
    trim: true
  },
  socialMedia: socialMediaSchema,
  language: {
    type: String,
    enum: Object.values(LANGUAGES),
    default: LANGUAGES.ENGLISH
  },
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.ACTIVE,
    index: true
  },
  statusReason: String,
  // KYC fields
  kycStatus: {
    type: String,
    enum: Object.values(KYC_STATUS),
    default: KYC_STATUS.NOT_SUBMITTED,
    index: true
  },
  kycDocuments: [kycDocumentSchema],
  kycRejectionReason: String,
  kycVerifiedAt: Date,
  kycReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  faceMatchScore: Number,
  // Location
  location: locationSchema,
  // Stats
  postsCount: {
    type: Number,
    default: 0
  },
  // Subscription fields
  subscriptionStatus: {
    type: String,
    enum: Object.values(SUBSCRIPTION_STATUS),
    default: SUBSCRIPTION_STATUS.NONE,
    index: true
  },
  currentSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  subscriptionExpiresAt: Date,
  gracePeriodEndsAt: Date,
  // Report tracking
  reportsReceived: {
    type: Number,
    default: 0
  },
  reportsMade: {
    type: Number,
    default: 0
  },
  // Refresh tokens for multi-device support
  refreshTokens: [{
    token: String,
    deviceInfo: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastLoginAt: Date,
  lastActiveAt: Date
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.refreshTokens;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for search and filtering
// Use 'none' as default_language and override language_override to avoid conflict with user.language field
userSchema.index(
  { displayName: 'text' },
  { default_language: 'none', language_override: 'textSearchLanguage' }
);
userSchema.index({ location: '2dsphere' });
userSchema.index({ createdAt: -1 });
userSchema.index({ kycStatus: 1, createdAt: -1 });

// Instance methods
userSchema.methods.isKycVerified = function() {
  return this.kycStatus === KYC_STATUS.VERIFIED;
};

userSchema.methods.hasActiveSubscription = function() {
  const now = new Date();
  return this.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE &&
         this.subscriptionExpiresAt &&
         this.subscriptionExpiresAt > now;
};

userSchema.methods.isInGracePeriod = function() {
  const now = new Date();
  return this.subscriptionStatus === SUBSCRIPTION_STATUS.GRACE_PERIOD &&
         this.gracePeriodEndsAt &&
         this.gracePeriodEndsAt > now;
};

userSchema.methods.canPost = function() {
  return this.status === USER_STATUS.ACTIVE &&
         this.kycStatus === KYC_STATUS.VERIFIED &&
         (this.hasActiveSubscription() || this.isInGracePeriod());
};

userSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    displayName: this.displayName,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    postsCount: this.postsCount,
    kycStatus: this.kycStatus,
    createdAt: this.createdAt
  };
};

// Static methods
userSchema.statics.findByGoogleId = function(googleId) {
  return this.findOne({ googleId });
};

// Middleware
userSchema.pre('save', function(next) {
  if (this.isModified('location')) {
    this.location.updatedAt = new Date();
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;

const mongoose = require('mongoose');
const { POST_STATUS, POST_TYPE, CURRENCIES, SOCIAL_PLATFORMS } = require('../utils/constants');

const contactInfoSchema = new mongoose.Schema({
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  socialMedia: {
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
  }
}, { _id: false });

const imageSchema = new mongoose.Schema({
  originalPath: {
    type: String,
    required: true
  },
  thumbnailPath: String,
  filename: String,
  size: Number,
  mimeType: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    index: 'text'
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  images: {
    type: [imageSchema],
    validate: [
      {
        validator: function(v) {
          return v.length <= 5;
        },
        message: 'Maximum 5 images allowed'
      },
      {
        validator: function(v) {
          return v.length >= 1;
        },
        message: 'At least 1 image is required'
      }
    ]
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  currency: {
    type: String,
    enum: Object.values(CURRENCIES),
    required: true,
    default: CURRENCIES.UZS
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
    index: true
  },
  genre: {
    type: String,
    trim: true,
    maxlength: 50,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(POST_TYPE),
    required: true,
    index: true
  },
  contactInfo: {
    type: contactInfoSchema
  },
  status: {
    type: String,
    enum: Object.values(POST_STATUS),
    default: POST_STATUS.ACTIVE,
    index: true
  },
  viewsCount: {
    type: Number,
    default: 0
  },
  // Report tracking
  reportsCount: {
    type: Number,
    default: 0,
    index: true
  },
  reportedAt: Date,
  // For soft delete tracking
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'deletedByModel'
  },
  deletedByModel: {
    type: String,
    enum: ['User', 'Admin']
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

// Compound indexes for efficient queries
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ gameId: 1, status: 1, createdAt: -1 });
postSchema.index({ type: 1, status: 1, createdAt: -1 });
postSchema.index({ price: 1, currency: 1 });
postSchema.index({ title: 'text', description: 'text' });

// Virtual for user population
postSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for game population
postSchema.virtual('game', {
  ref: 'Game',
  localField: 'gameId',
  foreignField: '_id',
  justOne: true
});

// Instance methods
postSchema.methods.isActive = function() {
  return this.status === POST_STATUS.ACTIVE && !this.deletedAt;
};

postSchema.methods.markAsSold = function() {
  this.status = POST_STATUS.SOLD;
  return this.save();
};

postSchema.methods.softDelete = function(deletedById, deletedByModel) {
  this.deletedAt = new Date();
  this.deletedBy = deletedById;
  this.deletedByModel = deletedByModel;
  return this.save();
};

postSchema.methods.incrementViews = async function() {
  this.viewsCount += 1;
  return this.save();
};

// Static methods
postSchema.statics.findActive = function(query = {}) {
  return this.find({
    ...query,
    status: POST_STATUS.ACTIVE,
    deletedAt: { $exists: false }
  });
};

postSchema.statics.findByUser = function(userId, includeDeleted = false) {
  const query = { userId };
  if (!includeDeleted) {
    query.deletedAt = { $exists: false };
  }
  return this.find(query).sort({ createdAt: -1 });
};

postSchema.statics.searchPosts = function(searchQuery, filters = {}) {
  const query = {
    $text: { $search: searchQuery },
    status: POST_STATUS.ACTIVE,
    deletedAt: { $exists: false }
  };

  if (filters.gameId) query.gameId = filters.gameId;
  if (filters.type) query.type = filters.type;
  if (filters.genre) query.genre = filters.genre;
  if (filters.minPrice) query.price = { ...query.price, $gte: filters.minPrice };
  if (filters.maxPrice) query.price = { ...query.price, $lte: filters.maxPrice };
  if (filters.currency) query.currency = filters.currency;

  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } });
};

// Middleware - Update user's post count
postSchema.post('save', async function(doc) {
  if (doc.isNew) {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.userId, { $inc: { postsCount: 1 } });
  }
});

postSchema.post('remove', async function(doc) {
  const User = mongoose.model('User');
  await User.findByIdAndUpdate(doc.userId, { $inc: { postsCount: -1 } });
});

const Post = mongoose.model('Post', postSchema);

module.exports = Post;

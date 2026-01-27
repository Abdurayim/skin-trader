const mongoose = require('mongoose');
const { GAME_GENRES } = require('../utils/constants');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
    index: 'text'
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  icon: {
    type: String,
    trim: true
  },
  genres: [{
    type: String,
    enum: GAME_GENRES
  }],
  postsCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
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
gameSchema.index({ name: 'text' });
gameSchema.index({ isActive: 1, name: 1 });
gameSchema.index({ postsCount: -1 });

// Pre-save middleware to generate slug
gameSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Instance methods
gameSchema.methods.incrementPostsCount = function() {
  this.postsCount += 1;
  return this.save();
};

gameSchema.methods.decrementPostsCount = function() {
  if (this.postsCount > 0) {
    this.postsCount -= 1;
  }
  return this.save();
};

// Static methods
gameSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

gameSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

gameSchema.statics.searchByName = function(query) {
  return this.find({
    isActive: true,
    name: { $regex: query, $options: 'i' }
  }).limit(20).sort({ postsCount: -1, name: 1 });
};

gameSchema.statics.getPopularGames = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ postsCount: -1 })
    .limit(limit);
};

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;

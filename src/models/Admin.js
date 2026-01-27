const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ADMIN_ROLES, ROLE_PERMISSIONS } = require('../utils/constants');

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  role: {
    type: String,
    enum: Object.values(ADMIN_ROLES),
    required: true,
    default: ADMIN_ROLES.SUPPORT,
    index: true
  },
  permissions: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastLoginAt: Date,
  lastLoginIp: String,
  // For password reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  // For tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  // Refresh tokens for session management
  refreshTokens: [{
    token: String,
    deviceInfo: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
adminSchema.index({ role: 1, isActive: 1 });
adminSchema.index({ createdAt: -1 });

// Pre-save middleware to hash password and set permissions
adminSchema.pre('save', async function(next) {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Set permissions based on role if role changed or new document
  if (this.isModified('role') || this.isNew) {
    this.permissions = ROLE_PERMISSIONS[this.role] || [];
  }

  next();
});

// Instance methods
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

adminSchema.methods.hasAnyPermission = function(permissions) {
  return permissions.some(permission => this.permissions.includes(permission));
};

adminSchema.methods.hasAllPermissions = function(permissions) {
  return permissions.every(permission => this.permissions.includes(permission));
};

adminSchema.methods.isSuperAdmin = function() {
  return this.role === ADMIN_ROLES.SUPER_ADMIN;
};

adminSchema.methods.updateLastLogin = function(ipAddress) {
  this.lastLoginAt = new Date();
  this.lastLoginIp = ipAddress;
  return this.save();
};

// Static methods
adminSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

adminSchema.statics.findActiveAdmins = function() {
  return this.find({ isActive: true });
};

adminSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

adminSchema.statics.createAdmin = async function(adminData, createdById) {
  const admin = new this({
    ...adminData,
    createdBy: createdById
  });
  return admin.save();
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;

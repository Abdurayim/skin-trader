const Joi = require('joi');
const { CURRENCIES, POST_STATUS, POST_TYPE, LANGUAGES, SOCIAL_PLATFORMS, KYC_DOCUMENT_TYPES } = require('./constants');

/**
 * Common validation schemas
 */

// Phone number - supports international format
const phoneNumberSchema = Joi.string()
  .pattern(/^\+?[1-9]\d{9,14}$/)
  .messages({
    'string.pattern.base': 'Phone number must be valid international format'
  });

// MongoDB ObjectId
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'Invalid ID format'
  });

// Coordinates
const coordinatesSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required()
});

// Pagination
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().allow(null, ''),
  sortBy: Joi.string().valid('createdAt', 'price', 'updatedAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Offset pagination (for admin)
const offsetPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

/**
 * Auth validation schemas
 */
const authSchemas = {
  sendOtp: Joi.object({
    phoneNumber: phoneNumberSchema.required()
  }),

  verifyOtp: Joi.object({
    firebaseToken: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  })
};

/**
 * User validation schemas
 */
const userSchemas = {
  updateProfile: Joi.object({
    displayName: Joi.string().min(2).max(50).trim(),
    email: Joi.string().email(),
    language: Joi.string().valid(...Object.values(LANGUAGES)),
    bio: Joi.string().max(500).trim().allow(''),
    socialMedia: Joi.object({
      platform: Joi.string().valid(...SOCIAL_PLATFORMS),
      username: Joi.string().max(100).trim(),
      url: Joi.string().uri().allow('')
    })
  }).min(1),

  updateLocation: Joi.object({
    coordinates: coordinatesSchema.required()
  }),

  kycUpload: Joi.object({
    documentType: Joi.string().valid(...Object.values(KYC_DOCUMENT_TYPES)).required()
  })
};

/**
 * Post validation schemas
 */
const postSchemas = {
  create: Joi.object({
    title: Joi.string().min(3).max(100).trim().required(),
    description: Joi.string().min(10).max(2000).trim().required(),
    price: Joi.number().min(0).required(),
    currency: Joi.string().valid(...Object.values(CURRENCIES)).required(),
    gameId: objectIdSchema.required(),
    genre: Joi.string().max(50).trim(),
    type: Joi.string().valid(...Object.values(POST_TYPE)).required(),
    contactInfo: Joi.object({
      phone: phoneNumberSchema,
      email: Joi.string().email(),
      socialMedia: Joi.object({
        platform: Joi.string().valid(...SOCIAL_PLATFORMS),
        username: Joi.string().max(100).trim(),
        url: Joi.string().uri().allow('')
      })
    }).or('phone', 'email').required()
  }),

  update: Joi.object({
    title: Joi.string().min(3).max(100).trim(),
    description: Joi.string().min(10).max(2000).trim(),
    price: Joi.number().min(0),
    currency: Joi.string().valid(...Object.values(CURRENCIES)),
    genre: Joi.string().max(50).trim(),
    contactInfo: Joi.object({
      phone: phoneNumberSchema,
      email: Joi.string().email(),
      socialMedia: Joi.object({
        platform: Joi.string().valid(...SOCIAL_PLATFORMS),
        username: Joi.string().max(100).trim(),
        url: Joi.string().uri().allow('')
      })
    }).or('phone', 'email')
  }).min(1),

  updateStatus: Joi.object({
    status: Joi.string().valid(...Object.values(POST_STATUS)).required()
  }),

  search: Joi.object({
    q: Joi.string().min(1).max(100).trim(),
    gameId: objectIdSchema,
    genre: Joi.string().max(50),
    type: Joi.string().valid(...Object.values(POST_TYPE)),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    currency: Joi.string().valid(...Object.values(CURRENCIES)),
    status: Joi.string().valid(...Object.values(POST_STATUS)).default(POST_STATUS.ACTIVE),
    ...paginationSchema.describe().keys
  })
};

/**
 * Message validation schemas
 */
const messageSchemas = {
  send: Joi.object({
    recipientId: objectIdSchema.required(),
    content: Joi.string().min(1).max(1000).trim().required(),
    postId: objectIdSchema // Optional - for context
  }),

  getConversation: Joi.object({
    ...paginationSchema.describe().keys
  })
};

/**
 * Admin validation schemas
 */
const adminSchemas = {
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required()
  }),

  createAdmin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
    name: Joi.string().min(2).max(50).trim().required(),
    role: Joi.string().valid('superadmin', 'moderator', 'support').required()
  }),

  updateAdmin: Joi.object({
    name: Joi.string().min(2).max(50).trim(),
    role: Joi.string().valid('superadmin', 'moderator', 'support'),
    isActive: Joi.boolean()
  }).min(1),

  updateUserStatus: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'banned').required(),
    reason: Joi.string().max(500).when('status', {
      is: Joi.string().valid('suspended', 'banned'),
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }),

  kycAction: Joi.object({
    action: Joi.string().valid('approve', 'reject').required(),
    reason: Joi.string().max(500).when('action', {
      is: 'reject',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  })
};

/**
 * Game validation schemas
 */
const gameSchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).trim().required(),
    slug: Joi.string().min(1).max(100).lowercase().trim(),
    icon: Joi.string().uri().allow(''),
    genres: Joi.array().items(Joi.string().max(50)).max(5),
    isActive: Joi.boolean().default(true)
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100).trim(),
    icon: Joi.string().uri().allow(''),
    genres: Joi.array().items(Joi.string().max(50)).max(5),
    isActive: Joi.boolean()
  }).min(1),

  search: Joi.object({
    q: Joi.string().min(1).max(100).trim()
  })
};

/**
 * Validate function
 */
const validate = (schema, data) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { isValid: false, errors, value: null };
  }

  return { isValid: true, errors: null, value };
};

module.exports = {
  phoneNumberSchema,
  objectIdSchema,
  coordinatesSchema,
  paginationSchema,
  offsetPaginationSchema,
  authSchemas,
  userSchemas,
  postSchemas,
  messageSchemas,
  adminSchemas,
  gameSchemas,
  validate
};

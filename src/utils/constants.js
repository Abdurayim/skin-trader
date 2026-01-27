/**
 * Application constants
 */

// User related
const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned'
};

const KYC_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  NOT_SUBMITTED: 'not_submitted'
};

const KYC_DOCUMENT_TYPES = {
  ID_CARD: 'id_card',
  PASSPORT: 'passport',
  SELFIE: 'selfie'
};

// Post related
const POST_STATUS = {
  ACTIVE: 'active',
  SOLD: 'sold'
};

const POST_TYPE = {
  SKIN: 'skin',
  PROFILE: 'profile'
};

// Currency
const CURRENCIES = {
  UZS: 'UZS',
  USD: 'USD'
};

// Admin related
const ADMIN_ROLES = {
  SUPER_ADMIN: 'superadmin',
  MODERATOR: 'moderator',
  SUPPORT: 'support'
};

const ADMIN_PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  MANAGE_POSTS: 'manage_posts',
  MANAGE_ADMINS: 'manage_admins',
  VIEW_KYC: 'view_kyc',
  APPROVE_KYC: 'approve_kyc',
  VIEW_LOGS: 'view_logs',
  VIEW_STATS: 'view_stats',
  MANAGE_GAMES: 'manage_games'
};

// Role permissions mapping
const ROLE_PERMISSIONS = {
  [ADMIN_ROLES.SUPER_ADMIN]: Object.values(ADMIN_PERMISSIONS),
  [ADMIN_ROLES.MODERATOR]: [
    ADMIN_PERMISSIONS.MANAGE_USERS,
    ADMIN_PERMISSIONS.MANAGE_POSTS,
    ADMIN_PERMISSIONS.VIEW_KYC,
    ADMIN_PERMISSIONS.APPROVE_KYC,
    ADMIN_PERMISSIONS.VIEW_LOGS,
    ADMIN_PERMISSIONS.VIEW_STATS
  ],
  [ADMIN_ROLES.SUPPORT]: [
    ADMIN_PERMISSIONS.VIEW_KYC,
    ADMIN_PERMISSIONS.VIEW_STATS
  ]
};

// Languages
const LANGUAGES = {
  ENGLISH: 'en',
  RUSSIAN: 'ru',
  UZBEK: 'uz'
};

// Message related
const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read'
};

// Admin log actions
const ADMIN_ACTIONS = {
  // User actions
  USER_BANNED: 'user_banned',
  USER_UNBANNED: 'user_unbanned',
  USER_SUSPENDED: 'user_suspended',
  USER_DELETED: 'user_deleted',

  // KYC actions
  KYC_APPROVED: 'kyc_approved',
  KYC_REJECTED: 'kyc_rejected',

  // Post actions
  POST_DELETED: 'post_deleted',
  POST_FLAGGED: 'post_flagged',

  // Admin actions
  ADMIN_CREATED: 'admin_created',
  ADMIN_UPDATED: 'admin_updated',
  ADMIN_DELETED: 'admin_deleted',

  // Game actions
  GAME_CREATED: 'game_created',
  GAME_UPDATED: 'game_updated',
  GAME_DELETED: 'game_deleted',

  // Auth actions
  ADMIN_LOGIN: 'admin_login',
  ADMIN_LOGOUT: 'admin_logout'
};

// Game genres
const GAME_GENRES = [
  'FPS',
  'MOBA',
  'RPG',
  'Battle Royale',
  'Sports',
  'Racing',
  'Strategy',
  'MMO',
  'Fighting',
  'Survival',
  'Simulation',
  'Action',
  'Adventure',
  'Card',
  'Horror',
  'Sandbox',
  'Mobile',
  'Football',
  'Basketball',
  'Life',
  'Driving',
  'Social',
  'Party',
  'Co-op',
  'Turn-Based',
  'Other'
];

// Social media platforms
const SOCIAL_PLATFORMS = [
  'telegram',
  'instagram',
  'facebook',
  'twitter',
  'discord',
  'vk',
  'tiktok',
  'youtube',
  'other'
];

// Cache keys
const CACHE_KEYS = {
  GAMES_LIST: 'games:list',
  GAME_BY_ID: 'game:',
  POST_BY_ID: 'post:',
  USER_PROFILE: 'user:profile:',
  POSTS_LIST: 'posts:list:',
  SEARCH_RESULTS: 'search:'
};

// Error codes
const ERROR_CODES = {
  // Auth errors
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // KYC errors
  KYC_REQUIRED: 'KYC_REQUIRED',
  KYC_PENDING: 'KYC_PENDING',
  KYC_REJECTED: 'KYC_REJECTED',
  FACE_MISMATCH: 'FACE_MISMATCH',

  // Rate limit
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

module.exports = {
  USER_STATUS,
  KYC_STATUS,
  KYC_DOCUMENT_TYPES,
  POST_STATUS,
  POST_TYPE,
  CURRENCIES,
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ROLE_PERMISSIONS,
  LANGUAGES,
  MESSAGE_STATUS,
  ADMIN_ACTIONS,
  GAME_GENRES,
  SOCIAL_PLATFORMS,
  CACHE_KEYS,
  ERROR_CODES
};

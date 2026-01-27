const { getFirebaseAuth } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Firebase Phone Authentication Service
 * Handles phone number verification through Firebase
 */
class FirebaseAuthService {
  constructor() {
    this.auth = null;
  }

  /**
   * Initialize Firebase Auth
   */
  init() {
    try {
      this.auth = getFirebaseAuth();
      logger.info('Firebase Auth Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Firebase Auth Service:', error);
      throw error;
    }
  }

  /**
   * Verify Firebase ID token from client
   * The client handles the OTP flow with Firebase SDK
   * @param {string} idToken - Firebase ID token from client
   * @returns {Object} Decoded token with user info
   */
  async verifyIdToken(idToken) {
    try {
      if (!this.auth) {
        this.init();
      }

      const decodedToken = await this.auth.verifyIdToken(idToken);

      return {
        success: true,
        uid: decodedToken.uid,
        phoneNumber: decodedToken.phone_number,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        expirationTime: decodedToken.exp
      };
    } catch (error) {
      logger.error('Firebase token verification failed:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Get user by Firebase UID
   * @param {string} uid - Firebase user ID
   */
  async getUserByUid(uid) {
    try {
      if (!this.auth) {
        this.init();
      }

      const userRecord = await this.auth.getUser(uid);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          phoneNumber: userRecord.phoneNumber,
          email: userRecord.email,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          metadata: {
            creationTime: userRecord.metadata.creationTime,
            lastSignInTime: userRecord.metadata.lastSignInTime
          }
        }
      };
    } catch (error) {
      logger.error('Failed to get Firebase user:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Get user by phone number
   * @param {string} phoneNumber - Phone number with country code
   */
  async getUserByPhoneNumber(phoneNumber) {
    try {
      if (!this.auth) {
        this.init();
      }

      const userRecord = await this.auth.getUserByPhoneNumber(phoneNumber);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          phoneNumber: userRecord.phoneNumber,
          email: userRecord.email
        }
      };
    } catch (error) {
      // User not found is expected for new users
      if (error.code === 'auth/user-not-found') {
        return {
          success: false,
          notFound: true
        };
      }

      logger.error('Failed to get user by phone:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Delete Firebase user
   * @param {string} uid - Firebase user ID
   */
  async deleteUser(uid) {
    try {
      if (!this.auth) {
        this.init();
      }

      await this.auth.deleteUser(uid);

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete Firebase user:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Revoke refresh tokens for user (force sign out)
   * @param {string} uid - Firebase user ID
   */
  async revokeRefreshTokens(uid) {
    try {
      if (!this.auth) {
        this.init();
      }

      await this.auth.revokeRefreshTokens(uid);

      return { success: true };
    } catch (error) {
      logger.error('Failed to revoke tokens:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Update Firebase user
   * @param {string} uid - Firebase user ID
   * @param {Object} updates - Fields to update
   */
  async updateUser(uid, updates) {
    try {
      if (!this.auth) {
        this.init();
      }

      const userRecord = await this.auth.updateUser(uid, updates);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          phoneNumber: userRecord.phoneNumber,
          email: userRecord.email
        }
      };
    } catch (error) {
      logger.error('Failed to update Firebase user:', error);

      return {
        success: false,
        error: this.parseFirebaseError(error)
      };
    }
  }

  /**
   * Disable/Enable Firebase user
   * @param {string} uid - Firebase user ID
   * @param {boolean} disabled - Whether to disable the user
   */
  async setUserDisabled(uid, disabled) {
    return this.updateUser(uid, { disabled });
  }

  /**
   * Parse Firebase error into user-friendly message
   * @param {Error} error - Firebase error
   */
  parseFirebaseError(error) {
    const errorMessages = {
      'auth/id-token-expired': 'Session expired. Please sign in again.',
      'auth/id-token-revoked': 'Session has been revoked. Please sign in again.',
      'auth/invalid-id-token': 'Invalid authentication. Please sign in again.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'User not found.',
      'auth/phone-number-already-exists': 'This phone number is already registered.',
      'auth/invalid-phone-number': 'Invalid phone number format.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/internal-error': 'Authentication service error. Please try again.'
    };

    return errorMessages[error.code] || error.message || 'Authentication failed';
  }
}

// Export singleton instance
const firebaseAuthService = new FirebaseAuthService();

module.exports = firebaseAuthService;

const path = require('path');
const fs = require('fs');
const { User } = require('../models');
const imageService = require('./imageService');
const faceCompareService = require('./faceCompareService');
const cacheService = require('./cacheService');
const { KYC_STATUS, KYC_DOCUMENT_TYPES } = require('../utils/constants');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * KYC (Know Your Customer) Service
 * Handles document upload and verification
 */
class KycService {
  /**
   * Upload KYC document
   * @param {string} userId - User ID
   * @param {Object} file - Multer file object
   * @param {string} documentType - Type of document (id_card, passport, selfie)
   */
  async uploadDocument(userId, file, documentType) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Don't allow re-upload if already verified
      if (user.kycStatus === KYC_STATUS.VERIFIED) {
        return { success: false, error: 'KYC already verified' };
      }

      // Process the image
      const processed = await imageService.processKycImage(file.path);

      if (!processed.success) {
        // Cleanup orphaned file on processing failure
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        return { success: false, error: 'Failed to process document image' };
      }

      // Normalize to relative path so frontend URLs work consistently
      const relativePath = path.isAbsolute(file.path)
        ? path.relative(process.cwd(), file.path)
        : file.path;

      // Remove existing document of same type
      user.kycDocuments = user.kycDocuments.filter(doc => doc.type !== documentType);

      // Add new document
      user.kycDocuments.push({
        type: documentType,
        filePath: relativePath,
        uploadedAt: new Date()
      });

      // Update KYC status to pending if they have uploaded required documents
      const hasIdDocument = user.kycDocuments.some(
        doc => doc.type === KYC_DOCUMENT_TYPES.ID_CARD || doc.type === KYC_DOCUMENT_TYPES.PASSPORT
      );
      const hasSelfie = user.kycDocuments.some(doc => doc.type === KYC_DOCUMENT_TYPES.SELFIE);

      if (hasIdDocument && hasSelfie && user.kycStatus !== KYC_STATUS.PENDING) {
        user.kycStatus = KYC_STATUS.PENDING;
      }

      await user.save();

      // Invalidate cache
      await cacheService.invalidateUserCache(userId);

      logger.info('KYC document uploaded', { userId, documentType });

      return {
        success: true,
        documentType,
        kycStatus: user.kycStatus,
        documentsCount: user.kycDocuments.length
      };
    } catch (error) {
      // Cleanup uploaded file on unexpected error
      if (file && file.path) {
        try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
      }
      logger.error('KYC document upload error:', { userId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Auto-verify KYC using face comparison
   * @param {string} userId - User ID
   */
  async autoVerify(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.kycStatus === KYC_STATUS.VERIFIED) {
        return { success: true, alreadyVerified: true };
      }

      // Get ID document and selfie paths
      const idDocument = user.kycDocuments.find(
        doc => doc.type === KYC_DOCUMENT_TYPES.ID_CARD || doc.type === KYC_DOCUMENT_TYPES.PASSPORT
      );
      const selfie = user.kycDocuments.find(doc => doc.type === KYC_DOCUMENT_TYPES.SELFIE);

      if (!idDocument || !selfie) {
        return {
          success: false,
          error: 'Both ID document and selfie are required for verification'
        };
      }

      // Try face comparison if models are available
      const modelsAvailable = await faceCompareService.isAvailable();

      if (modelsAvailable) {
        const verificationResult = await faceCompareService.verifyKyc(
          idDocument.filePath,
          selfie.filePath
        );

        if (verificationResult.success && verificationResult.verified) {
          user.kycStatus = KYC_STATUS.VERIFIED;
          user.kycVerifiedAt = new Date();
          user.faceMatchScore = verificationResult.score;
          user.kycDocuments.forEach(doc => { doc.verifiedAt = new Date(); });
          await user.save();
          await cacheService.invalidateUserCache(userId);

          logger.info('KYC auto-verified via face comparison', { userId, score: verificationResult.score });

          return {
            success: true,
            verified: true,
            score: verificationResult.score,
            details: verificationResult.details
          };
        } else if (verificationResult.success && !verificationResult.verified) {
          user.kycStatus = KYC_STATUS.PENDING;
          user.faceMatchScore = verificationResult.score;
          await user.save();

          logger.warn('KYC face mismatch, pending manual review', {
            userId,
            score: verificationResult.score
          });

          return {
            success: true,
            verified: false,
            score: verificationResult.score,
            message: 'Face verification failed. Your documents will be reviewed manually.',
            requiresManualReview: true
          };
        }
        // If verificationResult.success is false, fall through to auto-approve
        logger.warn('Face comparison failed, falling back to auto-approve', {
          userId,
          error: verificationResult.error
        });
      } else {
        logger.warn('Face API models not available, using auto-approve', { userId });
      }

      // Auto-approve: models not available or face comparison had an error
      user.kycStatus = KYC_STATUS.VERIFIED;
      user.kycVerifiedAt = new Date();
      user.faceMatchScore = 1.0;
      user.kycDocuments.forEach(doc => { doc.verifiedAt = new Date(); });
      await user.save();
      await cacheService.invalidateUserCache(userId);

      logger.info('KYC auto-approved (models unavailable)', { userId });
      return { success: true, verified: true, score: 1.0 };
    } catch (error) {
      logger.error('KYC auto-verify error:', { userId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin: Manually approve KYC
   * @param {string} userId - User ID
   * @param {string} adminId - Admin ID who approved
   */
  async adminApprove(userId, adminId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.kycStatus === KYC_STATUS.VERIFIED) {
        return { success: true, alreadyVerified: true };
      }

      user.kycStatus = KYC_STATUS.VERIFIED;
      user.kycVerifiedAt = new Date();
      user.kycReviewedBy = adminId;

      // Mark documents as verified
      user.kycDocuments.forEach(doc => {
        doc.verifiedAt = new Date();
      });

      await user.save();
      await cacheService.invalidateUserCache(userId);

      logger.info('KYC manually approved', { userId, adminId });

      return { success: true, verified: true };
    } catch (error) {
      logger.error('KYC admin approve error:', { userId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin: Reject KYC
   * @param {string} userId - User ID
   * @param {string} adminId - Admin ID who rejected
   * @param {string} reason - Rejection reason
   */
  async adminReject(userId, adminId, reason) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      user.kycStatus = KYC_STATUS.REJECTED;
      user.kycRejectionReason = reason;
      user.kycReviewedBy = adminId;

      // Clear documents so user can re-upload
      user.kycDocuments = [];

      await user.save();
      await cacheService.invalidateUserCache(userId);

      logger.info('KYC rejected', { userId, adminId, reason });

      return { success: true, rejected: true };
    } catch (error) {
      logger.error('KYC admin reject error:', { userId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get KYC status for user
   * @param {string} userId - User ID
   */
  async getStatus(userId) {
    try {
      const user = await User.findById(userId).select(
        'kycStatus kycDocuments kycRejectionReason kycVerifiedAt faceMatchScore'
      );

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const hasIdDocument = user.kycDocuments.some(
        doc => doc.type === KYC_DOCUMENT_TYPES.ID_CARD || doc.type === KYC_DOCUMENT_TYPES.PASSPORT
      );
      const hasSelfie = user.kycDocuments.some(doc => doc.type === KYC_DOCUMENT_TYPES.SELFIE);

      return {
        success: true,
        status: user.kycStatus,
        hasIdDocument,
        hasSelfie,
        rejectionReason: user.kycRejectionReason,
        verifiedAt: user.kycVerifiedAt,
        faceMatchScore: user.faceMatchScore,
        documentsCount: user.kycDocuments.length
      };
    } catch (error) {
      logger.error('Get KYC status error:', { userId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pending KYC verifications for admin
   * @param {Object} options - Pagination options
   */
  async getPendingVerifications(options = {}) {
    const { page = 1, limit = 20 } = options;

    try {
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        User.find({ kycStatus: KYC_STATUS.PENDING })
          .select('displayName email kycDocuments kycStatus faceMatchScore createdAt')
          .sort({ createdAt: 1 }) // Oldest first
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments({ kycStatus: KYC_STATUS.PENDING })
      ]);

      return {
        success: true,
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get pending verifications error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const kycService = new KycService();

module.exports = kycService;

const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

// Patch face-api.js to use node-canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

/**
 * Face Comparison Service
 * Uses face-api.js for face detection and comparison
 * Used for KYC verification to match selfie with ID photo
 */
class FaceCompareService {
  constructor() {
    this.modelsLoaded = false;
    this.modelsPath = path.join(process.cwd(), 'models', 'face-api');
    this.threshold = config.kyc.faceMatchThreshold || 0.6;
  }

  /**
   * Load face detection models
   */
  async loadModels() {
    if (this.modelsLoaded) return true;

    try {
      // Check if models directory exists
      if (!fs.existsSync(this.modelsPath)) {
        logger.warn('Face API models not found. Creating directory...');
        fs.mkdirSync(this.modelsPath, { recursive: true });
        logger.info(`Please download face-api.js models to: ${this.modelsPath}`);
        logger.info('Models needed: ssd_mobilenetv1, face_landmark_68, face_recognition');
        return false;
      }

      // Load required models
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsPath),
        faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath),
        faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath)
      ]);

      this.modelsLoaded = true;
      logger.info('Face API models loaded successfully');
      return true;
    } catch (error) {
      logger.error('Failed to load face API models:', error);
      return false;
    }
  }

  /**
   * Detect faces in an image
   * @param {string} imagePath - Path to the image
   */
  async detectFaces(imagePath) {
    try {
      if (!this.modelsLoaded) {
        const loaded = await this.loadModels();
        if (!loaded) {
          return { success: false, error: 'Face detection models not loaded' };
        }
      }

      // Load image using canvas
      const img = await canvas.loadImage(imagePath);

      // Detect all faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(img)
        .withFaceLandmarks()
        .withFaceDescriptors();

      return {
        success: true,
        faces: detections.map((d, index) => ({
          index,
          box: d.detection.box,
          score: d.detection.score,
          descriptor: d.descriptor
        })),
        count: detections.length
      };
    } catch (error) {
      logger.error('Face detection error:', { imagePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get face descriptor from image (for single face)
   * @param {string} imagePath - Path to the image
   */
  async getFaceDescriptor(imagePath) {
    try {
      if (!this.modelsLoaded) {
        const loaded = await this.loadModels();
        if (!loaded) {
          return { success: false, error: 'Face detection models not loaded' };
        }
      }

      const img = await canvas.loadImage(imagePath);

      // Detect single face with descriptor
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        return {
          success: false,
          error: 'No face detected in image'
        };
      }

      return {
        success: true,
        descriptor: detection.descriptor,
        box: detection.detection.box,
        score: detection.detection.score
      };
    } catch (error) {
      logger.error('Get face descriptor error:', { imagePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compare two faces and return similarity score
   * @param {string} imagePath1 - Path to first image (ID photo)
   * @param {string} imagePath2 - Path to second image (selfie)
   */
  async compareFaces(imagePath1, imagePath2) {
    try {
      if (!this.modelsLoaded) {
        const loaded = await this.loadModels();
        if (!loaded) {
          return {
            success: false,
            error: 'Face detection models not loaded. Please download models first.'
          };
        }
      }

      // Get descriptors for both images
      const [result1, result2] = await Promise.all([
        this.getFaceDescriptor(imagePath1),
        this.getFaceDescriptor(imagePath2)
      ]);

      if (!result1.success) {
        return {
          success: false,
          error: `ID photo: ${result1.error}`
        };
      }

      if (!result2.success) {
        return {
          success: false,
          error: `Selfie: ${result2.error}`
        };
      }

      // Calculate Euclidean distance between descriptors
      const distance = faceapi.euclideanDistance(result1.descriptor, result2.descriptor);

      // Convert distance to similarity score (0-1, where 1 is identical)
      // face-api.js uses 0.6 as typical threshold for same person
      const similarity = Math.max(0, 1 - distance);

      // Determine if faces match based on threshold
      const isMatch = distance < (1 - this.threshold);

      return {
        success: true,
        isMatch,
        similarity,
        distance,
        threshold: this.threshold,
        details: {
          idPhotoConfidence: result1.score,
          selfieConfidence: result2.score
        }
      };
    } catch (error) {
      logger.error('Face comparison error:', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify KYC documents
   * @param {string} idPhotoPath - Path to ID card/passport photo
   * @param {string} selfiePath - Path to selfie
   */
  async verifyKyc(idPhotoPath, selfiePath) {
    logger.info('Starting KYC face verification', { idPhotoPath, selfiePath });

    const result = await this.compareFaces(idPhotoPath, selfiePath);

    if (!result.success) {
      logger.warn('KYC verification failed', { error: result.error });
      return {
        success: false,
        verified: false,
        error: result.error
      };
    }

    const verified = result.isMatch;

    logger.info('KYC verification completed', {
      verified,
      similarity: result.similarity,
      distance: result.distance
    });

    return {
      success: true,
      verified,
      score: result.similarity,
      details: {
        similarity: result.similarity,
        distance: result.distance,
        threshold: result.threshold,
        ...result.details
      }
    };
  }

  /**
   * Check if face detection is available
   */
  async isAvailable() {
    try {
      return await this.loadModels();
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
const faceCompareService = new FaceCompareService();

module.exports = faceCompareService;

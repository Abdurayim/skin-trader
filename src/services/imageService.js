const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Image Processing Service
 * Handles image compression, resizing, and thumbnail generation
 */
class ImageService {
  constructor() {
    this.thumbnailDir = path.join(config.upload.uploadDir, 'thumbnails');
    this.maxWidth = 1920;
    this.maxHeight = 1080;
    this.thumbnailWidth = 300;
    this.thumbnailHeight = 300;
    this.quality = 80;
  }

  /**
   * Process uploaded image - compress and resize
   * @param {string} filePath - Path to the uploaded file
   * @param {Object} options - Processing options
   */
  async processImage(filePath, options = {}) {
    const {
      maxWidth = this.maxWidth,
      maxHeight = this.maxHeight,
      quality = this.quality,
      format = 'jpeg'
    } = options;

    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();

      // Determine if resize is needed
      let needsResize = false;
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        needsResize = true;
      }

      // Build processing pipeline
      let pipeline = image;

      if (needsResize) {
        pipeline = pipeline.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Apply format-specific compression
      if (format === 'jpeg' || metadata.format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      } else if (format === 'png') {
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
      } else if (format === 'webp') {
        pipeline = pipeline.webp({ quality });
      }

      // Process in place (overwrite)
      const buffer = await pipeline.toBuffer();
      await fs.writeFile(filePath, buffer);

      // Get new file stats
      const stats = await fs.stat(filePath);

      return {
        success: true,
        path: filePath,
        size: stats.size,
        width: metadata.width > maxWidth ? maxWidth : metadata.width,
        height: metadata.height > maxHeight ? maxHeight : metadata.height,
        format: format
      };
    } catch (error) {
      logger.error('Image processing error:', { filePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate thumbnail for image
   * @param {string} filePath - Path to the original image
   * @param {Object} options - Thumbnail options
   */
  async generateThumbnail(filePath, options = {}) {
    const {
      width = this.thumbnailWidth,
      height = this.thumbnailHeight,
      fit = 'cover'
    } = options;

    try {
      const filename = path.basename(filePath);
      const thumbnailPath = path.join(this.thumbnailDir, `thumb_${filename}`);

      await sharp(filePath)
        .resize(width, height, {
          fit,
          position: 'center'
        })
        .jpeg({ quality: 70 })
        .toFile(thumbnailPath);

      return {
        success: true,
        path: thumbnailPath,
        relativePath: path.relative(process.cwd(), thumbnailPath)
      };
    } catch (error) {
      logger.error('Thumbnail generation error:', { filePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process multiple images (for post uploads)
   * @param {Array} files - Array of multer file objects
   */
  async processPostImages(files) {
    const results = [];

    for (const file of files) {
      // Process original
      const processed = await this.processImage(file.path);

      if (!processed.success) {
        results.push({
          success: false,
          originalPath: file.path,
          error: processed.error
        });
        continue;
      }

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail(file.path);

      results.push({
        success: true,
        originalPath: file.path,
        thumbnailPath: thumbnail.success ? thumbnail.relativePath : null,
        filename: file.filename,
        size: processed.size,
        mimeType: file.mimetype
      });
    }

    return results;
  }

  /**
   * Process KYC document image
   * @param {string} filePath - Path to the KYC document
   */
  async processKycImage(filePath) {
    try {
      // For KYC, we want higher quality but still reasonable size
      const result = await this.processImage(filePath, {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 90
      });

      return result;
    } catch (error) {
      logger.error('KYC image processing error:', { filePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process profile image
   * @param {string} filePath - Path to the profile image
   */
  async processProfileImage(filePath) {
    try {
      // Profile images are smaller
      const result = await this.processImage(filePath, {
        maxWidth: 500,
        maxHeight: 500,
        quality: 85
      });

      // Generate avatar-sized thumbnail
      const thumbnail = await this.generateThumbnail(filePath, {
        width: 150,
        height: 150
      });

      return {
        success: true,
        originalPath: filePath,
        thumbnailPath: thumbnail.success ? thumbnail.relativePath : null
      };
    } catch (error) {
      logger.error('Profile image processing error:', { filePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get image metadata
   * @param {string} filePath - Path to the image
   */
  async getMetadata(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        success: true,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        hasAlpha: metadata.hasAlpha
      };
    } catch (error) {
      logger.error('Get metadata error:', { filePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete image and its thumbnail
   * @param {string} imagePath - Path to the image
   */
  async deleteImage(imagePath) {
    try {
      // Delete original
      await fs.unlink(imagePath);

      // Try to delete thumbnail
      const filename = path.basename(imagePath);
      const thumbnailPath = path.join(this.thumbnailDir, `thumb_${filename}`);

      try {
        await fs.unlink(thumbnailPath);
      } catch (e) {
        // Thumbnail might not exist
      }

      return { success: true };
    } catch (error) {
      logger.error('Delete image error:', { imagePath, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete multiple images
   * @param {Array} images - Array of image objects with originalPath
   */
  async deleteImages(images) {
    const results = [];

    for (const image of images) {
      const result = await this.deleteImage(image.originalPath);
      results.push(result);
    }

    return results;
  }

  /**
   * Convert image to buffer for face detection
   * @param {string} filePath - Path to the image
   */
  async toBuffer(filePath) {
    try {
      const buffer = await sharp(filePath)
        .jpeg()
        .toBuffer();
      return { success: true, buffer };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const imageService = new ImageService();

module.exports = imageService;

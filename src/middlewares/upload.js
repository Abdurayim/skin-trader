const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { badRequestResponse } = require('../utils/response');

// Ensure upload directories exist
const createUploadDirs = () => {
  const dirs = [
    path.join(config.upload.uploadDir, 'posts'),
    path.join(config.upload.uploadDir, 'kyc'),
    path.join(config.upload.uploadDir, 'profiles'),
    path.join(config.upload.uploadDir, 'thumbnails')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

/**
 * Storage configuration for different upload types
 */
const createStorage = (subDir) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(config.upload.uploadDir, subDir);
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueId = uuidv4();
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${uniqueId}${ext}`;
      cb(null, filename);
    }
  });
};

/**
 * File filter for images only
 */
const imageFilter = (req, file, cb) => {
  const allowedMimes = config.upload.allowedMimeTypes;

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${allowedMimes.join(', ')}`), false);
  }
};

/**
 * File filter for KYC documents (images only — sharp cannot process PDFs)
 */
const kycDocumentFilter = (req, file, cb) => {
  const allowedMimes = config.upload.allowedMimeTypes;

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for KYC document. Accepted: ${allowedMimes.join(', ')}`), false);
  }
};

/**
 * Post images uploader (max 5 images)
 */
const postImageUpload = multer({
  storage: createStorage('posts'),
  fileFilter: imageFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: config.upload.maxFiles
  }
});

/**
 * KYC document uploader
 */
const kycDocumentUpload = multer({
  storage: createStorage('kyc'),
  fileFilter: kycDocumentFilter,
  limits: {
    fileSize: config.kyc.maxIdSize,
    files: 1
  }
});

/**
 * Profile image uploader
 */
const profileImageUpload = multer({
  storage: createStorage('profiles'),
  fileFilter: imageFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1
  }
});

/**
 * Error handling middleware for multer
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return badRequestResponse(res, `File too large. Maximum size: ${config.upload.maxFileSize / (1024 * 1024)}MB`);
      case 'LIMIT_FILE_COUNT':
        return badRequestResponse(res, `Too many files. Maximum: ${config.upload.maxFiles} files`);
      case 'LIMIT_UNEXPECTED_FILE':
        return badRequestResponse(res, 'Unexpected file field');
      default:
        return badRequestResponse(res, `Upload error: ${err.message}`);
    }
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return badRequestResponse(res, err.message);
  }

  next(err);
};

/**
 * Middleware to ensure at least one file is uploaded
 */
const requireFiles = (fieldName = 'images', minFiles = 1) => {
  return (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length < minFiles) {
      return badRequestResponse(res, `At least ${minFiles} file(s) required`);
    }

    next();
  };
};

/**
 * Cleanup uploaded files on error
 */
const cleanupOnError = (req, res, next) => {
  const originalEnd = res.end;

  res.end = function(...args) {
    // If response is error status, cleanup files
    if (res.statusCode >= 400) {
      const files = req.files || (req.file ? [req.file] : []);
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlink(file.path, () => {});
        }
      });
    }
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Delete file utility
 */
const deleteFile = (filePath) => {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve(false);
      return;
    }

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    fs.unlink(fullPath, (err) => {
      resolve(!err);
    });
  });
};

/**
 * Delete multiple files
 */
const deleteFiles = async (filePaths) => {
  const results = await Promise.all(filePaths.map(deleteFile));
  return results.every(r => r);
};

module.exports = {
  postImageUpload,
  kycDocumentUpload,
  profileImageUpload,
  handleUploadError,
  requireFiles,
  cleanupOnError,
  deleteFile,
  deleteFiles,
  createUploadDirs
};

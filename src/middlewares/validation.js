const { validationErrorResponse, badRequestResponse } = require('../utils/response');
const { validate } = require('../utils/validators');

/**
 * Create validation middleware from Joi schema
 * @param {Object} schema - Joi validation schema
 * @param {string} source - Request property to validate ('body', 'query', 'params')
 */
const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[source];
    const { isValid, errors, value } = validate(schema, dataToValidate);

    if (!isValid) {
      return validationErrorResponse(res, errors);
    }

    // Replace with validated and sanitized data
    req[source] = value;
    next();
  };
};

/**
 * Validate request body
 */
const validateBody = (schema) => validateRequest(schema, 'body');

/**
 * Validate query parameters
 */
const validateQuery = (schema) => validateRequest(schema, 'query');

/**
 * Validate URL parameters
 */
const validateParams = (schema) => validateRequest(schema, 'params');

/**
 * Validate multiple sources
 */
const validateMultiple = (schemas) => {
  return (req, res, next) => {
    const allErrors = [];

    for (const [source, schema] of Object.entries(schemas)) {
      const { isValid, errors } = validate(schema, req[source]);

      if (!isValid) {
        allErrors.push(...errors.map(err => ({
          ...err,
          source
        })));
      }
    }

    if (allErrors.length > 0) {
      return validationErrorResponse(res, allErrors);
    }

    next();
  };
};

/**
 * Validate MongoDB ObjectId in params
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return badRequestResponse(res, `Invalid ${paramName} format`);
    }

    next();
  };
};

/**
 * Sanitize string fields to prevent XSS
 */
const sanitizeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Middleware to sanitize all string fields in body
 */
const sanitizeBody = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return sanitizeHtml(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }

  next();
};

module.exports = {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateMultiple,
  validateObjectId,
  sanitizeHtml,
  sanitizeBody
};

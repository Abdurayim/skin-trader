const config = require('../config');
const translations = require('../locales');

/**
 * Language detection and translation middleware
 */
const languageMiddleware = (req, res, next) => {
  // Priority: query param > header > user preference > default
  let lang = req.query.lang ||
             req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
             config.defaultLanguage;

  // Validate language
  if (!config.languages.includes(lang)) {
    lang = config.defaultLanguage;
  }

  req.language = lang;

  // Add translation helper to request
  req.t = (key, params = {}) => {
    return translate(key, lang, params);
  };

  // Add translation helper to response
  res.locals.t = req.t;
  res.locals.language = lang;

  next();
};

/**
 * Get translation by key
 * Supports nested keys with dot notation: 'errors.notFound'
 */
const translate = (key, lang = config.defaultLanguage, params = {}) => {
  const langTranslations = translations[lang] || translations[config.defaultLanguage];

  // Handle nested keys
  const keys = key.split('.');
  let value = langTranslations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to default language
      value = getNestedValue(translations[config.defaultLanguage], keys);
      break;
    }
  }

  // If still not found, return the key itself
  if (typeof value !== 'string') {
    return key;
  }

  // Replace parameters
  return interpolate(value, params);
};

/**
 * Get nested value from object
 */
const getNestedValue = (obj, keys) => {
  let value = obj;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return null;
    }
  }
  return value;
};

/**
 * Interpolate parameters in string
 * Supports: {{paramName}}
 */
const interpolate = (str, params) => {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
};

/**
 * Middleware to set language from user profile
 */
const userLanguageMiddleware = (req, res, next) => {
  if (req.user && req.user.language) {
    req.language = req.user.language;
    req.t = (key, params = {}) => translate(key, req.user.language, params);
    res.locals.t = req.t;
    res.locals.language = req.user.language;
  }
  next();
};

/**
 * Get all available languages
 */
const getAvailableLanguages = () => {
  return config.languages.map(lang => ({
    code: lang,
    name: translations[lang]?.languageName || lang
  }));
};

module.exports = {
  languageMiddleware,
  userLanguageMiddleware,
  translate,
  getAvailableLanguages
};

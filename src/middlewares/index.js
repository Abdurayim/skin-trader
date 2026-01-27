const auth = require('./auth');
const validation = require('./validation');
const rateLimiter = require('./rateLimiter');
const upload = require('./upload');
const language = require('./language');
const errorHandler = require('./errorHandler');

module.exports = {
  ...auth,
  ...validation,
  ...rateLimiter,
  ...upload,
  ...language,
  ...errorHandler
};

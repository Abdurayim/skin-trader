const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

const client = new OAuth2Client(config.google.clientId);

/**
 * Verify a Google ID token and extract user info
 * @param {string} idToken - Google ID token from frontend
 * @returns {{ googleId, email, displayName, avatarUrl }}
 */
async function verifyIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.google.clientId
  });

  const payload = ticket.getPayload();

  if (!payload.email_verified) {
    throw new Error('Google email not verified');
  }

  logger.info('Google token verified', { email: payload.email });

  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null
  };
}

module.exports = { verifyIdToken };

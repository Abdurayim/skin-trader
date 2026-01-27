const express = require('express');
const router = express.Router();
const { gameController } = require('../../controllers');
const { validateQuery } = require('../../middlewares/validation');
const { searchRateLimiter } = require('../../middlewares/rateLimiter');
const { gameSchemas } = require('../../utils/validators');

/**
 * @route   GET /api/v1/games
 * @desc    Get all active games
 * @access  Public
 */
router.get(
  '/',
  gameController.getGames
);

/**
 * @route   GET /api/v1/games/search
 * @desc    Search games by name
 * @access  Public
 */
router.get(
  '/search',
  searchRateLimiter,
  validateQuery(gameSchemas.search),
  gameController.searchGames
);

/**
 * @route   GET /api/v1/games/popular
 * @desc    Get popular games
 * @access  Public
 */
router.get(
  '/popular',
  gameController.getPopularGames
);

/**
 * @route   GET /api/v1/games/genres
 * @desc    Get all available genres
 * @access  Public
 */
router.get(
  '/genres',
  gameController.getGenres
);

/**
 * @route   GET /api/v1/games/genre/:genre
 * @desc    Get games by genre
 * @access  Public
 */
router.get(
  '/genre/:genre',
  gameController.getGamesByGenre
);

/**
 * @route   GET /api/v1/games/:identifier
 * @desc    Get game by ID or slug
 * @access  Public
 */
router.get(
  '/:identifier',
  gameController.getGame
);

module.exports = router;

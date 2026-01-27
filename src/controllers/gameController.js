const { Game } = require('../models');
const { cacheService } = require('../services');
const { successResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Get all active games
 * GET /api/v1/games
 */
const getGames = asyncHandler(async (req, res) => {
  // Try cache first
  const cached = await cacheService.getCachedGamesList();
  if (cached) {
    return successResponse(res, { games: cached });
  }

  const games = await Game.find({ isActive: true })
    .sort({ postsCount: -1, name: 1 })
    .lean();

  // Cache the result
  await cacheService.cacheGamesList(games);

  return successResponse(res, { games });
});

/**
 * Search games by name
 * GET /api/v1/games/search
 */
const searchGames = asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 1) {
    // Return popular games if no query
    const games = await Game.getPopularGames(20);
    return successResponse(res, { games });
  }

  const games = await Game.searchByName(q);

  return successResponse(res, { games });
});

/**
 * Get single game by ID or slug
 * GET /api/v1/games/:identifier
 */
const getGame = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  // Try cache first (by ID)
  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    const cached = await cacheService.getCachedGame(identifier);
    if (cached) {
      return successResponse(res, { game: cached });
    }
  }

  // Find by ID or slug
  const query = /^[0-9a-fA-F]{24}$/.test(identifier)
    ? { _id: identifier, isActive: true }
    : { slug: identifier, isActive: true };

  const game = await Game.findOne(query).lean();

  if (!game) {
    return notFoundResponse(res, req.t('errors.gameNotFound'));
  }

  // Cache the result
  await cacheService.cacheGame(game._id.toString(), game);

  return successResponse(res, { game });
});

/**
 * Get popular games
 * GET /api/v1/games/popular
 */
const getPopularGames = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const games = await Game.getPopularGames(parseInt(limit));

  return successResponse(res, { games });
});

/**
 * Get games by genre
 * GET /api/v1/games/genre/:genre
 */
const getGamesByGenre = asyncHandler(async (req, res) => {
  const { genre } = req.params;

  const games = await Game.find({
    isActive: true,
    genres: genre
  })
    .sort({ postsCount: -1, name: 1 })
    .lean();

  return successResponse(res, { games });
});

/**
 * Get all available genres
 * GET /api/v1/games/genres
 */
const getGenres = asyncHandler(async (req, res) => {
  const { GAME_GENRES } = require('../utils/constants');

  return successResponse(res, { genres: GAME_GENRES });
});

module.exports = {
  getGames,
  searchGames,
  getGame,
  getPopularGames,
  getGamesByGenre,
  getGenres
};

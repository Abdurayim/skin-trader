const config = require('../config');

/**
 * Cursor-based pagination utility
 * More efficient than offset-based pagination for large datasets
 */

const parsePaginationParams = (query) => {
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || config.pagination.defaultLimit, 1),
    config.pagination.maxLimit
  );

  const cursor = query.cursor || null;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  return { limit, cursor, sortBy, sortOrder };
};

/**
 * Build cursor query for MongoDB
 */
const buildCursorQuery = (cursor, sortBy, sortOrder, baseQuery = {}) => {
  if (!cursor) {
    return baseQuery;
  }

  try {
    const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    const operator = sortOrder === 1 ? '$gt' : '$lt';

    return {
      ...baseQuery,
      $or: [
        { [sortBy]: { [operator]: decodedCursor.value } },
        {
          [sortBy]: decodedCursor.value,
          _id: { [operator]: decodedCursor.id }
        }
      ]
    };
  } catch (error) {
    return baseQuery;
  }
};

/**
 * Generate next cursor from the last document
 */
const generateCursor = (document, sortBy) => {
  if (!document) {
    return null;
  }

  const cursorData = {
    value: document[sortBy],
    id: document._id.toString()
  };

  return Buffer.from(JSON.stringify(cursorData)).toString('base64');
};

/**
 * Build pagination metadata
 */
const buildPaginationMeta = (documents, limit, sortBy) => {
  const hasMore = documents.length === limit;
  const nextCursor = hasMore ? generateCursor(documents[documents.length - 1], sortBy) : null;

  return {
    limit,
    hasMore,
    nextCursor,
    count: documents.length
  };
};

/**
 * Execute paginated query
 */
const paginateQuery = async (Model, query, options = {}) => {
  const {
    limit = config.pagination.defaultLimit,
    cursor = null,
    sortBy = 'createdAt',
    sortOrder = -1,
    populate = [],
    select = '',
    lean = true
  } = options;

  const cursorQuery = buildCursorQuery(cursor, sortBy, sortOrder, query);
  const sort = { [sortBy]: sortOrder, _id: sortOrder };

  let queryBuilder = Model.find(cursorQuery)
    .sort(sort)
    .limit(limit);

  if (select) {
    queryBuilder = queryBuilder.select(select);
  }

  if (populate.length > 0) {
    populate.forEach(pop => {
      queryBuilder = queryBuilder.populate(pop);
    });
  }

  if (lean) {
    queryBuilder = queryBuilder.lean();
  }

  const documents = await queryBuilder.exec();
  const pagination = buildPaginationMeta(documents, limit, sortBy);

  return { documents, pagination };
};

/**
 * Offset-based pagination (for admin panel where page numbers are needed)
 */
const offsetPaginate = async (Model, query, options = {}) => {
  const {
    page = 1,
    limit = config.pagination.defaultLimit,
    sortBy = 'createdAt',
    sortOrder = -1,
    populate = [],
    select = '',
    lean = true
  } = options;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder };

  let queryBuilder = Model.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  if (select) {
    queryBuilder = queryBuilder.select(select);
  }

  if (populate.length > 0) {
    populate.forEach(pop => {
      queryBuilder = queryBuilder.populate(pop);
    });
  }

  if (lean) {
    queryBuilder = queryBuilder.lean();
  }

  const [documents, total] = await Promise.all([
    queryBuilder.exec(),
    Model.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

module.exports = {
  parsePaginationParams,
  buildCursorQuery,
  generateCursor,
  buildPaginationMeta,
  paginateQuery,
  offsetPaginate
};

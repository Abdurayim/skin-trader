const { User, Post, Report, AdminLog } = require('../models');
const {
  REPORT_STATUS,
  REPORT_ACTION,
  REPORT_PRIORITY,
  USER_STATUS,
  ADMIN_ACTIONS
} = require('../utils/constants');
const { successResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Get all reports with filters
 * GET /api/v1/admin/reports
 */
const getAllReports = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    reportType,
    category,
    priority,
    sortBy = 'createdAt',
    order = 'desc'
  } = req.query;

  const query = {};
  if (status) query.status = status;
  if (reportType) query.reportType = reportType;
  if (category) query.category = category;
  if (priority) query.priority = priority;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: order === 'desc' ? -1 : 1 };

  const reports = await Report.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('reporterId', 'displayName email')
    .populate('targetId') // Dynamically populated based on targetModel
    .populate('reviewedBy', 'name email');

  const total = await Report.countDocuments(query);

  // Get pending count for badge
  const pendingCount = await Report.countDocuments({ status: REPORT_STATUS.PENDING });

  return successResponse(res, {
    reports,
    pendingCount,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  }, 'Reports retrieved');
});

/**
 * Get report details
 * GET /api/v1/admin/reports/:id
 */
const getReportDetails = asyncHandler(async (req, res) => {
  const { id: reportId } = req.params;

  const report = await Report.findById(reportId)
    .populate('reporterId', 'displayName email kycStatus reportsReceived reportsMade')
    .populate('targetId')
    .populate('reviewedBy', 'name email role');

  if (!report) {
    return notFoundResponse(res, 'Report not found');
  }

  // Get previous reports on same target
  const relatedReports = await Report.find({
    targetId: report.targetId,
    _id: { $ne: report._id }
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('reporterId', 'displayName')
    .select('category status createdAt');

  // Get reporter history
  const reporterHistory = await Report.countDocuments({
    reporterId: report.reporterId,
    status: { $in: [REPORT_STATUS.RESOLVED, REPORT_STATUS.DISMISSED] }
  });

  return successResponse(res, {
    report,
    relatedReports,
    reporterStats: {
      totalReports: report.reporterId.reportsMade,
      resolvedReports: reporterHistory
    }
  }, 'Report details retrieved');
});

/**
 * Update report status
 * PATCH /api/v1/admin/reports/:id/status
 */
const updateReportStatus = asyncHandler(async (req, res) => {
  const { id: reportId } = req.params;
  const { status } = req.body;
  const adminId = req.adminId;

  if (!Object.values(REPORT_STATUS).includes(status)) {
    return badRequestResponse(res, 'Invalid status');
  }

  const report = await Report.findById(reportId);
  if (!report) {
    return notFoundResponse(res, 'Report not found');
  }

  const oldStatus = report.status;
  report.status = status;

  if (status === REPORT_STATUS.UNDER_REVIEW) {
    report.reviewedBy = adminId;
    report.reviewedAt = new Date();
  }

  await report.save();

  // Log action
  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.REPORT_RESOLVED,
    targetModel: 'Report',
    targetId: report._id,
    details: { oldStatus, newStatus: status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.info(`Admin ${adminId} updated report ${reportId} status to ${status}`);

  return successResponse(res, { report }, 'Report status updated');
});

/**
 * Resolve report with action
 * POST /api/v1/admin/reports/:id/resolve
 */
const resolveReport = asyncHandler(async (req, res) => {
  const { id: reportId } = req.params;
  const { action, notes, adminNotes } = req.body;
  const adminId = req.adminId;

  if (!Object.values(REPORT_ACTION).includes(action)) {
    return badRequestResponse(res, 'Invalid action');
  }

  const report = await Report.findById(reportId).populate('targetId');
  if (!report) {
    return notFoundResponse(res, 'Report not found');
  }

  if (report.status === REPORT_STATUS.RESOLVED) {
    return badRequestResponse(res, 'Report already resolved');
  }

  // Execute the action
  let actionResult;
  switch (action) {
    case REPORT_ACTION.DELETE_POST:
      actionResult = await deleteReportedPost(report, adminId, req);
      break;

    case REPORT_ACTION.WARN_USER:
      actionResult = await warnUser(report, adminId, notes, req);
      break;

    case REPORT_ACTION.SUSPEND_USER:
      actionResult = await suspendUser(report, adminId, notes, req);
      break;

    case REPORT_ACTION.BAN_USER:
      actionResult = await banUser(report, adminId, notes, req);
      break;

    case REPORT_ACTION.DELETE_USER:
      actionResult = await deleteUser(report, adminId, notes, req);
      break;

    case REPORT_ACTION.DISMISS:
      actionResult = { success: true, message: 'Report dismissed' };
      break;

    default:
      return badRequestResponse(res, 'Unknown action');
  }

  if (!actionResult.success) {
    return badRequestResponse(res, actionResult.error || 'Action failed');
  }

  // Mark report as resolved
  await report.resolve(action, notes, adminNotes, adminId);

  // Log action
  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.REPORT_RESOLVED,
    targetModel: 'Report',
    targetId: report._id,
    details: {
      reportAction: action,
      targetType: report.reportType,
      targetId: report.targetId,
      notes
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.info(`Admin ${adminId} resolved report ${reportId} with action ${action}`);

  return successResponse(res, {
    report,
    actionResult
  }, `Report resolved: ${actionResult.message}`);
});

/**
 * Dismiss report
 * POST /api/v1/admin/reports/:id/dismiss
 */
const dismissReport = asyncHandler(async (req, res) => {
  const { id: reportId } = req.params;
  const { reason } = req.body;
  const adminId = req.adminId;

  const report = await Report.findById(reportId);
  if (!report) {
    return notFoundResponse(res, 'Report not found');
  }

  await report.dismiss(reason, adminId);

  // Log action
  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.REPORT_DISMISSED,
    targetModel: 'Report',
    targetId: report._id,
    details: { reason },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  logger.info(`Admin ${adminId} dismissed report ${reportId}`);

  return successResponse(res, { report }, 'Report dismissed');
});

/**
 * Get report statistics
 * GET /api/v1/admin/reports/stats
 */
const getReportStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
    if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
  }

  // Reports by status
  const byStatus = await Report.aggregate([
    { $match: dateFilter },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  // Reports by category
  const byCategory = await Report.aggregate([
    { $match: dateFilter },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  // Reports by priority
  const byPriority = await Report.aggregate([
    { $match: dateFilter },
    { $group: { _id: '$priority', count: { $sum: 1 } } }
  ]);

  // Average resolution time
  const resolutionTime = await Report.aggregate([
    {
      $match: {
        status: REPORT_STATUS.RESOLVED,
        reviewedAt: { $exists: true },
        ...dateFilter
      }
    },
    {
      $project: {
        resolutionTime: { $subtract: ['$reviewedAt', '$createdAt'] }
      }
    },
    {
      $group: {
        _id: null,
        avgResolutionTime: { $avg: '$resolutionTime' }
      }
    }
  ]);

  const avgResolutionHours = resolutionTime.length > 0
    ? (resolutionTime[0].avgResolutionTime / (1000 * 60 * 60)).toFixed(2)
    : 0;

  // Convert byStatus array to flat object for frontend
  const statusCounts = {};
  byStatus.forEach(item => {
    // Convert snake_case status to camelCase (e.g., under_review → underReview)
    const key = item._id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    statusCounts[key] = item.count;
  });

  return successResponse(res, {
    ...statusCounts,
    byCategory,
    byPriority,
    avgResolutionHours: parseFloat(avgResolutionHours)
  }, 'Report statistics retrieved');
});

// Helper functions for actions

async function deleteReportedPost(report, adminId, req) {
  if (report.reportType !== 'post') {
    return { success: false, error: 'Target is not a post' };
  }

  const post = await Post.findById(report.targetId);
  if (!post) {
    return { success: false, error: 'Post not found' };
  }

  await post.softDelete(adminId, 'Admin');

  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.POST_DELETED,
    targetModel: 'Post',
    targetId: post._id,
    details: { reason: 'Reported content', reportId: report._id },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  return { success: true, message: 'Post deleted' };
}

async function warnUser(report, adminId, notes, req) {
  const userId = report.reportType === 'user' ? report.targetId : report.targetId.userId;
  const user = await User.findById(userId);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.USER_WARNED,
    targetModel: 'User',
    targetId: user._id,
    details: { reason: notes, reportId: report._id },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  return { success: true, message: 'User warned' };
}

async function suspendUser(report, adminId, notes, req) {
  const userId = report.reportType === 'user' ? report.targetId : report.targetId.userId;
  const user = await User.findById(userId);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  user.status = USER_STATUS.SUSPENDED;
  user.statusReason = notes || 'Violated platform rules';
  await user.save();

  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.USER_SUSPENDED,
    targetModel: 'User',
    targetId: user._id,
    details: { reason: notes, reportId: report._id },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  return { success: true, message: 'User suspended' };
}

async function banUser(report, adminId, notes, req) {
  const userId = report.reportType === 'user' ? report.targetId : report.targetId.userId;
  const user = await User.findById(userId);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  user.status = USER_STATUS.BANNED;
  user.statusReason = notes || 'Permanently banned';
  await user.save();

  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.USER_BANNED,
    targetModel: 'User',
    targetId: user._id,
    details: { reason: notes, reportId: report._id },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  return { success: true, message: 'User banned' };
}

async function deleteUser(report, adminId, notes, req) {
  const userId = report.reportType === 'user' ? report.targetId : report.targetId.userId;
  const user = await User.findById(userId);

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Soft delete user's posts
  await Post.updateMany(
    { userId: user._id },
    {
      $set: {
        deletedAt: new Date(),
        deletedBy: adminId,
        deletedByModel: 'Admin'
      }
    }
  );

  // Mark user as deleted
  user.status = USER_STATUS.BANNED;
  user.statusReason = 'Account deleted';
  await user.save();

  await AdminLog.create({
    adminId,
    action: ADMIN_ACTIONS.USER_DELETED,
    targetModel: 'User',
    targetId: user._id,
    details: { reason: notes, reportId: report._id },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  return { success: true, message: 'User deleted' };
}

module.exports = {
  getAllReports,
  getReportDetails,
  updateReportStatus,
  resolveReport,
  dismissReport,
  getReportStats
};

const { User, Post, Report } = require('../models');
const { REPORT_TYPE, REPORT_STATUS, REPORT_PRIORITY, REPORT_CATEGORY } = require('../utils/constants');
const { successResponse, createdResponse, badRequestResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Create a new report
 * POST /api/v1/reports
 */
const createReport = asyncHandler(async (req, res) => {
  const reporterId = req.user._id;
  const { reportType, targetId, category, description } = req.body;

  // Validate report type
  if (!Object.values(REPORT_TYPE).includes(reportType)) {
    return badRequestResponse(res, 'Invalid report type. Use "post" or "user"');
  }

  // Validate category
  if (!Object.values(REPORT_CATEGORY).includes(category)) {
    return badRequestResponse(res, 'Invalid report category');
  }

  // Check if target exists
  let target, targetModel;
  if (reportType === REPORT_TYPE.POST) {
    target = await Post.findById(targetId);
    targetModel = 'Post';
  } else if (reportType === REPORT_TYPE.USER) {
    target = await User.findById(targetId);
    targetModel = 'User';
  }

  if (!target) {
    return notFoundResponse(res, `${reportType} not found`);
  }

  // Prevent self-reporting for users
  if (reportType === REPORT_TYPE.USER && targetId.toString() === reporterId.toString()) {
    return badRequestResponse(res, 'You cannot report yourself');
  }

  // Prevent reporting own posts
  if (reportType === REPORT_TYPE.POST && target.userId.toString() === reporterId.toString()) {
    return badRequestResponse(res, 'You cannot report your own post');
  }

  // Check for duplicate report
  const isDuplicate = await Report.checkDuplicate(reporterId, targetId, category);
  if (isDuplicate) {
    return badRequestResponse(res, 'You have already submitted this report', {
      code: 'DUPLICATE_REPORT'
    });
  }

  // Check report limit (10 reports per day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reportsToday = await Report.countDocuments({
    reporterId,
    createdAt: { $gte: today }
  });

  if (reportsToday >= 10) {
    return badRequestResponse(res, 'Report limit exceeded. Maximum 10 reports per day', {
      code: 'REPORT_LIMIT_EXCEEDED'
    });
  }

  // Determine priority based on category
  let priority = REPORT_PRIORITY.LOW;
  if ([REPORT_CATEGORY.SCAM, REPORT_CATEGORY.FRAUD, REPORT_CATEGORY.HARASSMENT].includes(category)) {
    priority = REPORT_PRIORITY.MEDIUM;
  }

  // Create report
  const report = new Report({
    reporterId,
    reportType,
    targetId,
    targetModel,
    category,
    description: description?.trim(),
    priority,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  await report.save();

  // Update report counts
  if (reportType === REPORT_TYPE.POST) {
    await Post.findByIdAndUpdate(targetId, {
      $inc: { reportsCount: 1 },
      $set: { reportedAt: report.reportsCount === 1 ? new Date() : undefined }
    });
  } else if (reportType === REPORT_TYPE.USER) {
    await User.findByIdAndUpdate(targetId, { $inc: { reportsReceived: 1 } });
  }

  // Update reporter's count
  await User.findByIdAndUpdate(reporterId, { $inc: { reportsMade: 1 } });

  // Auto-escalate if needed
  await Report.autoEscalateReports();

  logger.info(`Report created: ${report._id} by user ${reporterId} for ${reportType} ${targetId}`);

  return createdResponse(res, {
    report: {
      _id: report._id,
      reportType: report.reportType,
      category: report.category,
      status: report.status,
      priority: report.priority,
      createdAt: report.createdAt
    }
  }, 'Report submitted successfully. Our team will review it shortly.');
});

/**
 * Get user's submitted reports
 * GET /api/v1/reports/my
 */
const getMyReports = asyncHandler(async (req, res) => {
  const reporterId = req.user._id;
  const { page = 1, limit = 10, status, reportType } = req.query;

  const query = { reporterId };
  if (status) query.status = status;
  if (reportType) query.reportType = reportType;

  const skip = (page - 1) * limit;

  const reports = await Report.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('targetId', 'title displayName avatarUrl') // Populate based on targetModel
    .populate('reviewedBy', 'username');

  const total = await Report.countDocuments(query);

  return successResponse(res, {
    reports,
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
 * GET /api/v1/reports/:id
 */
const getReportById = asyncHandler(async (req, res) => {
  const reporterId = req.user._id;
  const reportId = req.params.id;

  const report = await Report.findOne({ _id: reportId, reporterId })
    .populate('targetId')
    .populate('reviewedBy', 'username email');

  if (!report) {
    return notFoundResponse(res, 'Report not found');
  }

  return successResponse(res, { report }, 'Report details retrieved');
});

module.exports = {
  createReport,
  getMyReports,
  getReportById
};

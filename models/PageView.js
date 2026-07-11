const mongoose = require('mongoose');

/**
 * Page View Schema
 * Tracks page visits with daily aggregation for efficient storage
 */
const pageViewSchema = new mongoose.Schema({
  // Page identifier (path or type)
  page: {
    type: String,
    required: true,
    index: true
  },

  // Page type for easier querying
  pageType: {
    type: String,
    enum: ['homepage', 'lecture', 'series', 'sheikh', 'browse', 'other'],
    default: 'other',
    index: true
  },

  // Reference to specific resource (if applicable)
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
    sparse: true
  },

  // Date (day granularity for aggregation)
  date: {
    type: Date,
    required: true,
    index: true
  },

  // View count for this page on this date
  count: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Compound index for efficient upserts
pageViewSchema.index({ page: 1, date: 1 }, { unique: true });

/**
 * Record a page view - uses upsert for daily aggregation
 */
pageViewSchema.statics.recordView = async function(pagePath, pageType = 'other', resourceId = null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const update = {
    $inc: { count: 1 },
    $setOnInsert: {
      page: pagePath,
      pageType: pageType,
      resourceId: resourceId,
      date: today
    }
  };

  await this.findOneAndUpdate(
    { page: pagePath, date: today },
    update,
    { upsert: true, new: true }
  );
};

/**
 * Get total views for a specific page
 */
pageViewSchema.statics.getTotalViews = async function(pagePath) {
  const result = await this.aggregate([
    { $match: { page: pagePath } },
    { $group: { _id: null, total: { $sum: '$count' } } }
  ]);
  return result[0]?.total || 0;
};

/**
 * Get total views by page type
 */
pageViewSchema.statics.getViewsByType = async function(pageType) {
  const result = await this.aggregate([
    { $match: { pageType: pageType } },
    { $group: { _id: null, total: { $sum: '$count' } } }
  ]);
  return result[0]?.total || 0;
};

/**
 * Get views for date range
 */
pageViewSchema.statics.getViewsInRange = async function(startDate, endDate, pageType = null) {
  const match = {
    date: { $gte: startDate, $lte: endDate }
  };
  if (pageType) {
    match.pageType = pageType;
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        views: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  return result;
};

/**
 * Get top pages by views
 */
pageViewSchema.statics.getTopPages = async function(limit = 10, pageType = null) {
  const match = pageType ? { pageType } : {};

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$page',
        pageType: { $first: '$pageType' },
        resourceId: { $first: '$resourceId' },
        totalViews: { $sum: '$count' }
      }
    },
    { $sort: { totalViews: -1 } },
    { $limit: limit }
  ]);
};

/**
 * Get summary stats
 */
pageViewSchema.statics.getSummary = async function() {
  const [total, byType, last7Days, last30Days] = await Promise.all([
    this.aggregate([
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]),
    this.aggregate([
      { $group: { _id: '$pageType', total: { $sum: '$count' } } }
    ]),
    this.aggregate([
      {
        $match: {
          date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]),
    this.aggregate([
      {
        $match: {
          date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      { $group: { _id: null, total: { $sum: '$count' } } }
    ])
  ]);

  return {
    total: total[0]?.total || 0,
    byType: byType.reduce((acc, item) => {
      acc[item._id] = item.total;
      return acc;
    }, {}),
    last7Days: last7Days[0]?.total || 0,
    last30Days: last30Days[0]?.total || 0
  };
};

module.exports = mongoose.model('PageView', pageViewSchema);

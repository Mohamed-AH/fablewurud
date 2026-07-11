const mongoose = require('mongoose');

// TTL in days (default 30)
const SEARCH_LOG_TTL_DAYS = parseInt(process.env.SEARCH_LOG_TTL_DAYS, 10) || 30;

const searchLogSchema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now,
    index: { expires: SEARCH_LOG_TTL_DAYS * 86400 } // TTL index
  },
  query: {
    type: String,
    required: true
  },
  normalizedQuery: {
    type: String
  },
  tokens: {
    type: [String],
    default: []
  },
  minShouldMatch: {
    type: Number
  },
  resultCount: {
    type: Number,
    default: 0
  },
  topLectureIds: {
    type: [String],
    default: []
  },
  searchMode: {
    type: String,
    enum: ['local', 'atlas'],
    default: 'atlas'
  },
  // Feedback fields
  relevant: {
    type: Boolean,
    default: null
  },
  relevantAt: {
    type: Date
  },
  comment: {
    type: String,
    maxlength: 300
  }
});

// Index for querying recent searches
searchLogSchema.index({ query: 1, createdAt: -1 });

// Export schema for use with separate connection
module.exports = { searchLogSchema };

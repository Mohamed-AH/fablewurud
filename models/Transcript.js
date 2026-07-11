const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
  lectureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true,
    index: true
  },
  shortId: {
    type: Number,
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true
  },
  speaker: {
    type: String,
    trim: true
  },
  startTimeSec: {
    type: Number,
    required: true
  },
  startTimeMs: {
    type: Number
  },
  endTimeMs: {
    type: Number
  },
  sourceCsv: {
    type: String,
    trim: true
  }
}, {
  timestamps: false
});

// Compound index for context queries (fetch surrounding lines)
transcriptSchema.index({ lectureId: 1, startTimeSec: 1 });

// Text index for local search fallback
transcriptSchema.index({ text: 'text' });

// Export schema for use with separate connection
module.exports = { transcriptSchema };

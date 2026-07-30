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
  },

  // ---- Denormalized lecture metadata (set at import from the matched lecture) ----
  // Stable join / re-key key: the audio file the transcript was produced from.
  // Survives lecture _id regeneration (re-imports) — see docs/plans/transcript-import-and-search-filters.md.
  audioFileName: {
    type: String,
    trim: true,
    index: true
  },
  // Realm word derived from the lecture's sheikh (najmi | hasan). Filter/facet field.
  realm: {
    type: String,
    enum: ['najmi', 'hasan'],
    index: true
  },
  sheikhId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sheikh',
    index: true
  },
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    index: true
  },
  seriesTitle: {
    type: String,
    trim: true
  },
  dateRecorded: {
    type: Date
  },
  dateRecordedHijri: {
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

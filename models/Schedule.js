const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  dayOfWeek: {
    type: String,
    required: true,
    enum: ['يومي', 'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    index: true
  },
  dayOfWeekEnglish: {
    type: String,
    enum: ['Daily', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  },
  time: {
    type: String,
    required: true,
    trim: true
  },
  timeEnglish: {
    type: String,
    trim: true
  },
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
    index: true
  },
  location: {
    type: String,
    trim: true,
    default: 'جامع الورود'
  },
  locationEnglish: {
    type: String,
    trim: true,
    default: 'Masjid Al-Wurud'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Sort by day order then by sortOrder
scheduleSchema.index({ isActive: 1, sortOrder: 1 });

// Helper to get day number for sorting (Saturday = 0 in Islamic week)
scheduleSchema.statics.getDayOrder = function(day) {
  const days = ['يومي', 'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  return days.indexOf(day);
};

module.exports = mongoose.model('Schedule', scheduleSchema);

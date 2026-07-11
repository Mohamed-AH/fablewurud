const mongoose = require('mongoose');
const Counter = require('./Counter');
const { generateSlugEn, generateSlugAr } = require('../utils/slugify');

const seriesSchema = new mongoose.Schema({
  shortId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  titleArabic: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  titleEnglish: {
    type: String,
    trim: true,
    index: true
  },
  descriptionArabic: {
    type: String,
    trim: true
  },
  descriptionEnglish: {
    type: String,
    trim: true
  },
  sheikhId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sheikh',
    required: true,
    index: true
  },
  // Parent series for nested mini-series (e.g., Khutba sub-series)
  parentSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    default: null,
    index: true
  },
  category: {
    type: String,
    enum: ['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'],
    default: 'Other',
    index: true
  },
  tags: {
    type: [String],
    default: [],
    index: true
  },
  bookTitle: {
    type: String,
    trim: true
  },
  bookAuthor: {
    type: String,
    trim: true
  },
  lectureCount: {
    type: Number,
    default: 0
  },
  thumbnailUrl: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    index: true
  },
  slug_en: {
    type: String,
    trim: true,
    index: true
  },
  slug_ar: {
    type: String,
    trim: true,
    index: true
  },
  isVisible: {
    type: Boolean,
    default: true,
    index: true
  },
  // Section assignment for homepage organization
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section',
    default: null,
    index: true
  },
  // Order within the assigned section
  sectionOrder: {
    type: Number,
    default: 0
  },
  // Search/Filter display options (controlled from admin panel)
  displayOptions: {
    // Enable/disable search bar on series page
    showSearch: {
      type: Boolean,
      default: true
    },
    // Enable/disable filter by Hijri year
    showYearFilter: {
      type: Boolean,
      default: true
    },
    // Enable/disable sort options
    showSortOptions: {
      type: Boolean,
      default: true
    },
    // Minimum lectures required to show search/filter (0 = always show, based on settings)
    minLecturesForSearch: {
      type: Number,
      default: 15
    },
    // Minimum lectures required to show year filter
    minLecturesForYearFilter: {
      type: Number,
      default: 15
    },
    // Default sort order for lectures (oldest = chronological, newest = reverse)
    defaultSortOrder: {
      type: String,
      enum: ['oldest', 'newest'],
      default: 'oldest'
    }
  }
}, {
  timestamps: true
});

// Compound index for sheikh + title (to prevent duplicates)
seriesSchema.index({ sheikhId: 1, titleArabic: 1 }, { unique: true });

// Text index for search
seriesSchema.index({ titleArabic: 'text', titleEnglish: 'text' });

// Pre-save middleware for auto-generating shortId and slugs
seriesSchema.pre('save', async function() {
  // Auto-assign shortId using atomic counter increment
  if (this.isNew && !this.shortId) {
    this.shortId = await Counter.getNextSequence('series');
  }

  // Auto-generate slug_en if missing
  if (!this.slug_en) {
    if (this.titleEnglish) {
      this.slug_en = generateSlugEn(this.titleEnglish);
    } else if (this.titleArabic) {
      this.slug_en = generateSlugEn(this.titleArabic);
    }
    if (!this.slug_en && this.shortId) {
      this.slug_en = `series-${this.shortId}`;
    }
  }

  // Auto-generate slug_ar if missing
  if (!this.slug_ar && this.titleArabic) {
    this.slug_ar = generateSlugAr(this.titleArabic);
  }
});

module.exports = mongoose.model('Series', seriesSchema);

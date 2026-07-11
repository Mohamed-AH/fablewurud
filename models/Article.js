const mongoose = require('mongoose');
const Counter = require('./Counter');
const { generateSlugEn, generateSlugAr } = require('../utils/slugify');

const articleSchema = new mongoose.Schema({
  shortId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  type: {
    type: String,
    enum: ['Asdaa', 'TelegramArticle'],
    required: true,
    index: true
  },
  publishedAt: {
    type: Date,
    required: true,
    index: true
  },
  sourceUrl: {
    type: String,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  summary: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    index: true
  },
  slug_ar: {
    type: String,
    trim: true,
    index: true
  },
  isPublished: {
    type: Boolean,
    default: true,
    index: true
  },
  // Edit history tracking
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    editedAt: {
      type: Date,
      default: Date.now
    },
    fieldsChanged: [String],
    changes: [{
      field: String,
      oldValue: String,
      newValue: String
    }],
    changeDescription: String
  }],
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastEditedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Text index for search
articleSchema.index({ title: 'text', summary: 'text' });

// Pre-save middleware for auto-generating shortId and slugs
articleSchema.pre('save', async function() {
  // Auto-assign shortId using atomic counter increment
  if (this.isNew && !this.shortId) {
    this.shortId = await Counter.getNextSequence('article');
  }

  // Auto-generate slug (transliterated English) if missing
  if (!this.slug && this.title) {
    this.slug = generateSlugEn(this.title);
    // Ensure uniqueness by appending shortId if slug exists
    if (this.shortId) {
      this.slug = `${this.slug}-${this.shortId}`;
    }
  }

  // Auto-generate slug_ar if missing
  if (!this.slug_ar && this.title) {
    this.slug_ar = generateSlugAr(this.title);
  }
});

module.exports = mongoose.model('Article', articleSchema);

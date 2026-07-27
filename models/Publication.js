const mongoose = require('mongoose');
const Counter = require('./Counter');
const { generateSlugEn, generateSlugAr } = require('../utils/slugify');

/**
 * Publication — a downloadable PDF document (book, commentary, letter, biography)
 * authored by or about a Sheikh. Files are stored on Cloudflare R2 and the full
 * public URL is kept in `fileUrl`, so the storage bucket is transparent to the app.
 */
const publicationSchema = new mongoose.Schema({
  shortId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  sheikhId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sheikh',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  titleEnglish: {
    type: String,
    trim: true
  },
  // Arabic library categories (from the source catalog):
  //   الكتب (books), التعليقات (commentaries),
  //   الرسائل (correspondence), من السيرة الذاتية (biography)
  category: {
    type: String,
    required: true,
    index: true,
    default: 'الكتب'
  },
  fileUrl: {
    type: String,
    trim: true,
    required: true
  },
  fileName: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  pageCount: {
    type: Number,
    default: 0
  },
  volumeCount: {
    type: Number,
    default: 1
  },
  sourceUrl: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Optional gradient hue for the generated cover art (falls back to realm teal)
  coverColor: {
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
  slug_ar: {
    type: String,
    trim: true,
    index: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Text index for search
publicationSchema.index({ title: 'text', titleEnglish: 'text', description: 'text' });
// Common query: publications for a sheikh, filtered by category
publicationSchema.index({ sheikhId: 1, category: 1, isPublished: 1 });

// Pre-save: auto-assign shortId and slugs
publicationSchema.pre('save', async function () {
  if (this.isNew && !this.shortId) {
    this.shortId = await Counter.getNextSequence('publication');
  }

  if (!this.slug && this.title) {
    this.slug = generateSlugEn(this.title);
    if (this.shortId) {
      this.slug = `${this.slug}-${this.shortId}`;
    }
  }

  if (!this.slug_ar && this.title) {
    this.slug_ar = generateSlugAr(this.title);
  }
});

module.exports = mongoose.model('Publication', publicationSchema);

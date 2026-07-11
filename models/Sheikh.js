const mongoose = require('mongoose');
const Counter = require('./Counter');
const { generateSlugEn, generateSlugAr } = require('../utils/slugify');

const sheikhSchema = new mongoose.Schema({
  shortId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  nameArabic: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  nameEnglish: {
    type: String,
    trim: true,
    index: true
  },
  honorific: {
    type: String,
    default: 'حفظه الله',
    trim: true
  },
  bioArabic: {
    type: String,
    trim: true
  },
  bioEnglish: {
    type: String,
    trim: true
  },
  photoUrl: {
    type: String,
    trim: true
  },
  lectureCount: {
    type: Number,
    default: 0
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
  }
}, {
  timestamps: true
});

// Indexes for search
sheikhSchema.index({ nameArabic: 'text', nameEnglish: 'text' });

// Virtual for full Arabic name with honorific
sheikhSchema.virtual('fullNameArabic').get(function() {
  return this.honorific ? `${this.nameArabic} ${this.honorific}` : this.nameArabic;
});

// Ensure virtuals are included in JSON
sheikhSchema.set('toJSON', { virtuals: true });
sheikhSchema.set('toObject', { virtuals: true });

// Pre-save middleware for auto-generating shortId and slugs
sheikhSchema.pre('save', async function() {
  // Auto-assign shortId using atomic counter increment
  if (this.isNew && !this.shortId) {
    this.shortId = await Counter.getNextSequence('sheikh');
  }

  // Auto-generate slug_en if missing (remove honorifics for cleaner URLs)
  if (!this.slug_en) {
    const cleanName = (this.nameEnglish || this.nameArabic || '')
      .replace(/الشيخ\s*/g, '')
      .replace(/حفظه الله/g, '')
      .replace(/رحمه الله/g, '')
      .trim();

    if (cleanName) {
      this.slug_en = generateSlugEn(cleanName);
    }
    if (!this.slug_en && this.shortId) {
      this.slug_en = `sheikh-${this.shortId}`;
    }
  }

  // Auto-generate slug_ar if missing (remove honorifics)
  if (!this.slug_ar && this.nameArabic) {
    const cleanNameAr = this.nameArabic
      .replace(/الشيخ\s*/g, '')
      .replace(/حفظه الله/g, '')
      .replace(/رحمه الله/g, '')
      .trim();

    if (cleanNameAr) {
      this.slug_ar = generateSlugAr(cleanNameAr);
    }
  }
});

module.exports = mongoose.model('Sheikh', sheikhSchema);

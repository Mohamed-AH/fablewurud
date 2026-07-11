const mongoose = require('mongoose');

/**
 * Section Schema
 * Represents a homepage section that groups series together
 * (e.g., Featured, Active, Completed, Archive, Ramadan)
 */
const sectionSchema = new mongoose.Schema({
  title: {
    ar: {
      type: String,
      required: true,
      trim: true
    },
    en: {
      type: String,
      required: true,
      trim: true
    }
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  description: {
    ar: {
      type: String,
      trim: true
    },
    en: {
      type: String,
      trim: true
    }
  },
  icon: {
    type: String,
    default: '📚',
    trim: true
  },
  displayOrder: {
    type: Number,
    default: 0,
    index: true
  },
  isVisible: {
    type: Boolean,
    default: true,
    index: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  collapsedByDefault: {
    type: Boolean,
    default: false
  },
  maxVisible: {
    type: Number,
    default: 5,
    min: 1,
    max: 50
  }
}, {
  timestamps: true
});

// Generate slug from English title if not provided
sectionSchema.pre('validate', function(next) {
  if (!this.slug && this.title.en) {
    this.slug = this.title.en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

/**
 * Get all sections ordered by displayOrder
 */
sectionSchema.statics.getOrderedSections = async function(includeHidden = false) {
  const query = includeHidden ? {} : { isVisible: true };
  return this.find(query).sort({ displayOrder: 1 }).lean();
};

/**
 * Get section by slug
 */
sectionSchema.statics.getBySlug = async function(slug) {
  return this.findOne({ slug }).lean();
};

/**
 * Reorder sections - update displayOrder for multiple sections
 * @param {Array} orderArray - Array of { id, order } objects
 */
sectionSchema.statics.reorder = async function(orderArray) {
  const bulkOps = orderArray.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { displayOrder: order } }
    }
  }));
  return this.bulkWrite(bulkOps);
};

/**
 * Get the "Active" section (fallback for unassigned series)
 */
sectionSchema.statics.getActiveSection = async function() {
  let section = await this.findOne({ slug: 'active' });
  if (!section) {
    // Create default active section if it doesn't exist
    section = await this.create({
      title: { ar: 'السلاسل الجارية', en: 'Active Series' },
      slug: 'active',
      icon: '📖',
      displayOrder: 1,
      isDefault: true
    });
  }
  return section;
};

module.exports = mongoose.model('Section', sectionSchema);

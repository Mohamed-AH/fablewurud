const mongoose = require('mongoose');

/**
 * Site Settings Schema
 * Stores global settings for the site including analytics visibility
 */
const siteSettingsSchema = new mongoose.Schema({
  // Singleton identifier - only one document should exist
  key: {
    type: String,
    default: 'global',
    unique: true,
    immutable: true
  },

  // Analytics visibility settings
  analytics: {
    // Whether to show stats publicly on the site
    showPublicStats: {
      type: Boolean,
      default: false
    },
    // Minimum total plays before showing stats publicly
    minPlaysToDisplay: {
      type: Number,
      default: 1000
    },
    // Minimum total downloads before showing stats publicly
    minDownloadsToDisplay: {
      type: Number,
      default: 500
    },
    // Minimum page views before showing stats publicly
    minPageViewsToDisplay: {
      type: Number,
      default: 5000
    }
  },

  // Homepage configuration
  homepage: {
    showSchedule: {
      type: Boolean,
      default: true
    },
    // Schedule layout: 'cards' (new) or 'table' (classic)
    scheduleLayout: {
      type: String,
      enum: ['cards', 'table'],
      default: 'cards'
    },
    showSeriesTab: {
      type: Boolean,
      default: true
    },
    showStandaloneTab: {
      type: Boolean,
      default: true
    },
    showKhutbasTab: {
      type: Boolean,
      default: true
    },
    // Per-realm config for the Sheikh Ahmed Al-Najmi archive homepage (/najmi).
    // Tailored to an archive: no weekly schedule, no standalone/khutba tabs.
    najmi: {
      showFeaturedSeries: { type: Boolean, default: true },
      featuredSeriesCount: { type: Number, default: 6, min: 2, max: 12 },
      showLibrary: { type: Boolean, default: true },
      showSections: { type: Boolean, default: true }, // admin-curated realm sections
      // Order of the configurable blocks below the hero
      blockOrder: { type: [String], default: ['sections', 'featuredSeries', 'library'] }
    }
  },

  // Article editor configuration
  articleEditor: {
    // Whether to show login link in footer
    showLoginLink: {
      type: Boolean,
      default: true
    }
  },

  // Series detail page stats configuration
  seriesStats: {
    // Minimum plays before showing play count (hide if below threshold)
    minPlaysToShow: {
      type: Number,
      default: 100
    },
    // Whether to show the duration stat card
    showDuration: {
      type: Boolean,
      default: false
    }
  },

  // Notice banner configuration
  noticeBanner: {
    // Whether the notice banner is enabled
    enabled: {
      type: Boolean,
      default: true
    },
    // Arabic message
    messageAr: {
      type: String,
      default: 'تنبيه: تأثر سيرفر الموقع بالأعطال التقنية، والمحتوى المتاح حالياً هو حتى ٢٢ رمضان. العمل جارٍ على استعادة البيانات، وجميع الدروس متوفرة الآن عبر قناتنا في'
    },
    // English message
    messageEn: {
      type: String,
      default: 'Notice: The site server was affected by technical issues and is being restored. Data currently available is up to 22 Ramadan. All recent and past audio remain available on our'
    },
    // Link URL (optional)
    linkUrl: {
      type: String,
      default: 'https://t.me/daririhasan'
    },
    // Arabic link text
    linkTextAr: {
      type: String,
      default: 'تيليجرام'
    },
    // English link text
    linkTextEn: {
      type: String,
      default: 'Telegram channel'
    }
  },

  // Full-page maintenance mode configuration
  maintenanceMode: {
    // Whether maintenance mode is enabled (shows full-page overlay)
    enabled: {
      type: Boolean,
      default: false
    },
    // Arabic title
    titleAr: {
      type: String,
      default: 'الموقع تحت الصيانة'
    },
    // English title
    titleEn: {
      type: String,
      default: 'Site Under Maintenance'
    },
    // Arabic message
    messageAr: {
      type: String,
      default: 'نعمل حالياً على تحسين الموقع. يرجى العودة قريباً.'
    },
    // English message
    messageEn: {
      type: String,
      default: 'We are currently improving the site. Please check back soon.'
    },
    // Telegram link URL
    telegramUrl: {
      type: String,
      default: 'https://t.me/daririhasan'
    },
    // Arabic Telegram text
    telegramTextAr: {
      type: String,
      default: 'تابعنا على تيليجرام للتحديثات'
    },
    // English Telegram text
    telegramTextEn: {
      type: String,
      default: 'Follow us on Telegram for updates'
    }
  },

  // Cached aggregate stats (updated periodically)
  cachedStats: {
    totalPlays: {
      type: Number,
      default: 0
    },
    totalDownloads: {
      type: Number,
      default: 0
    },
    totalPageViews: {
      type: Number,
      default: 0
    },
    totalLectures: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

/**
 * Get or create the singleton settings document (atomic operation)
 */
siteSettingsSchema.statics.getSettings = async function() {
  // Use findOneAndUpdate with upsert to avoid race conditions
  const settings = await this.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return settings;
};

/**
 * Update cached stats from database
 */
siteSettingsSchema.statics.updateCachedStats = async function() {
  const Lecture = require('./Lecture');
  const PageView = require('./PageView');

  const [playStats, pageViewStats, lectureCount] = await Promise.all([
    Lecture.aggregate([
      { $match: { published: true } },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: '$playCount' },
          totalDownloads: { $sum: '$downloadCount' }
        }
      }
    ]),
    PageView.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$count' } } }
    ]),
    Lecture.countDocuments({ published: true })
  ]);

  const stats = {
    totalPlays: playStats[0]?.totalPlays || 0,
    totalDownloads: playStats[0]?.totalDownloads || 0,
    totalPageViews: pageViewStats[0]?.totalViews || 0,
    totalLectures: lectureCount,
    lastUpdated: new Date()
  };

  await this.findOneAndUpdate(
    { key: 'global' },
    { $set: { cachedStats: stats } },
    { upsert: true }
  );

  return stats;
};

/**
 * Check if stats should be shown publicly based on thresholds
 */
siteSettingsSchema.methods.shouldShowPublicStats = function() {
  if (this.analytics.showPublicStats) {
    return true; // Manual override
  }

  // Check if all thresholds are met
  const stats = this.cachedStats;
  return (
    stats.totalPlays >= this.analytics.minPlaysToDisplay &&
    stats.totalDownloads >= this.analytics.minDownloadsToDisplay &&
    stats.totalPageViews >= this.analytics.minPageViewsToDisplay
  );
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);

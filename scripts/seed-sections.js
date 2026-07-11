/**
 * Seed default homepage sections
 *
 * Usage:
 *   node scripts/seed-sections.js
 *
 * This script:
 * 1. Creates default sections if they don't exist
 * 2. Does NOT delete existing sections
 * 3. Safe to run multiple times (idempotent)
 */

require('dotenv').config();
const connectDB = require('../config/database');
const { Section } = require('../models');

const defaultSections = [
  {
    title: { ar: 'مميز', en: 'Featured' },
    slug: 'featured',
    icon: '⭐',
    displayOrder: 0,
    isVisible: true,
    isDefault: true,
    collapsedByDefault: false,
    maxVisible: 5
  },
  {
    title: { ar: 'السلاسل الجارية', en: 'Active Series' },
    slug: 'active',
    icon: '📖',
    displayOrder: 1,
    isVisible: true,
    isDefault: true,
    collapsedByDefault: false,
    maxVisible: 10
  },
  {
    title: { ar: 'السلاسل المكتملة', en: 'Completed Series' },
    slug: 'completed',
    icon: '✅',
    displayOrder: 2,
    isVisible: true,
    isDefault: true,
    collapsedByDefault: false,
    maxVisible: 5
  },
  {
    title: { ar: 'الأرشيف', en: 'Archive' },
    slug: 'archive',
    icon: '📁',
    displayOrder: 3,
    isVisible: true,
    isDefault: true,
    collapsedByDefault: true,
    maxVisible: 5
  },
  {
    title: { ar: 'أرشيف رمضان', en: 'Ramadan Archive' },
    slug: 'ramadan',
    icon: '🌙',
    displayOrder: 4,
    isVisible: true,
    isDefault: true,
    collapsedByDefault: true,
    maxVisible: 5
  }
];

async function seedSections() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('Seeding default sections...\n');

    let created = 0;
    let skipped = 0;

    for (const sectionData of defaultSections) {
      const existing = await Section.findOne({ slug: sectionData.slug });

      if (existing) {
        console.log(`  [skip] "${sectionData.title.en}" (slug: ${sectionData.slug}) - already exists`);
        skipped++;
      } else {
        await Section.create(sectionData);
        console.log(`  [created] ${sectionData.icon} "${sectionData.title.en}" (slug: ${sectionData.slug})`);
        created++;
      }
    }

    console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
    console.log('\nNext steps:');
    console.log('  1. Go to /admin/sections to manage sections');
    console.log('  2. Assign series to sections at /admin/sections/:id/series');
    console.log('  3. Configure homepage at /admin/homepage-config');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedSections();

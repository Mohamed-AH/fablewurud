/**
 * Unit Tests for Section Model
 */

const mongoose = require('mongoose');
const Section = require('../../../models/Section');
const testDb = require('../../helpers/testDb');

describe('Section Model', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  afterEach(async () => {
    await Section.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid section with required fields', async () => {
      const section = await Section.create({
        title: {
          ar: 'القسم الرئيسي',
          en: 'Main Section'
        },
        slug: 'main-section'
      });

      expect(section.title.ar).toBe('القسم الرئيسي');
      expect(section.title.en).toBe('Main Section');
      expect(section.slug).toBe('main-section');
    });

    it('should fail validation without Arabic title', async () => {
      const section = new Section({
        title: {
          en: 'Main Section'
        },
        slug: 'main-section'
      });

      await expect(section.save()).rejects.toThrow();
    });

    it('should fail validation without English title', async () => {
      const section = new Section({
        title: {
          ar: 'القسم الرئيسي'
        },
        slug: 'main-section'
      });

      await expect(section.save()).rejects.toThrow();
    });

    it('should auto-generate slug from English title if not provided', async () => {
      const section = new Section({
        title: {
          ar: 'القسم',
          en: 'Section'
        }
      });

      await section.validate();
      expect(section.slug).toBe('section');
    });

    it('should enforce unique slug', async () => {
      await Section.create({
        title: { ar: 'القسم الأول', en: 'First Section' },
        slug: 'unique-slug'
      });

      const duplicateSection = new Section({
        title: { ar: 'القسم الثاني', en: 'Second Section' },
        slug: 'unique-slug'
      });

      await expect(duplicateSection.save()).rejects.toThrow();
    });
  });

  describe('Default Values', () => {
    it('should default icon to book emoji', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.icon).toBe('📚');
    });

    it('should default displayOrder to 0', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.displayOrder).toBe(0);
    });

    it('should default isVisible to true', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.isVisible).toBe(true);
    });

    it('should default isDefault to false', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.isDefault).toBe(false);
    });

    it('should default collapsedByDefault to false', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.collapsedByDefault).toBe(false);
    });

    it('should default maxVisible to 5', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.maxVisible).toBe(5);
    });
  });

  describe('Optional Fields', () => {
    it('should accept optional description', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section',
        description: {
          ar: 'وصف القسم',
          en: 'Section description'
        }
      });

      expect(section.description.ar).toBe('وصف القسم');
      expect(section.description.en).toBe('Section description');
    });

    it('should accept custom icon', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section',
        icon: '🎓'
      });

      expect(section.icon).toBe('🎓');
    });

    it('should accept custom displayOrder', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section',
        displayOrder: 5
      });

      expect(section.displayOrder).toBe(5);
    });
  });

  describe('Pre-validate Hook', () => {
    it('should generate slug from English title if not provided', async () => {
      const section = new Section({
        title: { ar: 'القسم', en: 'Test Section Name' }
      });

      await section.validate();
      expect(section.slug).toBe('test-section-name');
    });

    it('should not override existing slug', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Test Section Name' },
        slug: 'custom-slug'
      });

      expect(section.slug).toBe('custom-slug');
    });

    it('should lowercase and slugify English title', async () => {
      const section = new Section({
        title: { ar: 'القسم', en: 'My Special Section!!!' }
      });

      await section.validate();
      expect(section.slug).toBe('my-special-section');
    });
  });

  describe('Static Methods', () => {
    describe('getOrderedSections', () => {
      it('should return empty array when no sections exist', async () => {
        const sections = await Section.getOrderedSections();
        expect(sections).toEqual([]);
      });

      it('should return sections ordered by displayOrder', async () => {
        await Section.create({
          title: { ar: 'قسم 3', en: 'Section 3' },
          slug: 'section-3',
          displayOrder: 3
        });

        await Section.create({
          title: { ar: 'قسم 1', en: 'Section 1' },
          slug: 'section-1',
          displayOrder: 1
        });

        await Section.create({
          title: { ar: 'قسم 2', en: 'Section 2' },
          slug: 'section-2',
          displayOrder: 2
        });

        const sections = await Section.getOrderedSections();
        expect(sections).toHaveLength(3);
        expect(sections[0].slug).toBe('section-1');
        expect(sections[1].slug).toBe('section-2');
        expect(sections[2].slug).toBe('section-3');
      });

      it('should exclude hidden sections by default', async () => {
        await Section.create({
          title: { ar: 'قسم ظاهر', en: 'Visible Section' },
          slug: 'visible',
          isVisible: true
        });

        await Section.create({
          title: { ar: 'قسم مخفي', en: 'Hidden Section' },
          slug: 'hidden',
          isVisible: false
        });

        const sections = await Section.getOrderedSections();
        expect(sections).toHaveLength(1);
        expect(sections[0].slug).toBe('visible');
      });

      it('should include hidden sections when includeHidden is true', async () => {
        await Section.create({
          title: { ar: 'قسم ظاهر', en: 'Visible Section' },
          slug: 'visible',
          isVisible: true
        });

        await Section.create({
          title: { ar: 'قسم مخفي', en: 'Hidden Section' },
          slug: 'hidden',
          isVisible: false
        });

        const sections = await Section.getOrderedSections(true);
        expect(sections).toHaveLength(2);
      });
    });

    describe('getBySlug', () => {
      it('should return null for non-existent slug', async () => {
        const section = await Section.getBySlug('nonexistent');
        expect(section).toBeNull();
      });

      it('should return section by slug', async () => {
        await Section.create({
          title: { ar: 'القسم', en: 'Section' },
          slug: 'my-section'
        });

        const section = await Section.getBySlug('my-section');
        expect(section).not.toBeNull();
        expect(section.slug).toBe('my-section');
      });
    });

    describe('reorder', () => {
      it('should reorder sections', async () => {
        const section1 = await Section.create({
          title: { ar: 'قسم 1', en: 'Section 1' },
          slug: 'section-1',
          displayOrder: 1
        });

        const section2 = await Section.create({
          title: { ar: 'قسم 2', en: 'Section 2' },
          slug: 'section-2',
          displayOrder: 2
        });

        await Section.reorder([
          { id: section1._id, order: 2 },
          { id: section2._id, order: 1 }
        ]);

        const updatedSection1 = await Section.findById(section1._id);
        const updatedSection2 = await Section.findById(section2._id);

        expect(updatedSection1.displayOrder).toBe(2);
        expect(updatedSection2.displayOrder).toBe(1);
      });
    });

    describe('getActiveSection', () => {
      it('should create active section if it does not exist', async () => {
        const section = await Section.getActiveSection();

        expect(section).not.toBeNull();
        expect(section.slug).toBe('active');
        expect(section.isDefault).toBe(true);
      });

      it('should return existing active section', async () => {
        await Section.create({
          title: { ar: 'السلاسل الجارية', en: 'Active Series' },
          slug: 'active',
          isDefault: true
        });

        const section = await Section.getActiveSection();
        expect(section.slug).toBe('active');
      });
    });
  });

  describe('Timestamps', () => {
    it('should automatically add createdAt and updatedAt', async () => {
      const section = await Section.create({
        title: { ar: 'القسم', en: 'Section' },
        slug: 'test-section'
      });

      expect(section.createdAt).toBeInstanceOf(Date);
      expect(section.updatedAt).toBeInstanceOf(Date);
    });
  });
});

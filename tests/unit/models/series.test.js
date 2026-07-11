/**
 * Unit Tests for Series Model
 */

const mongoose = require('mongoose');
const Series = require('../../../models/Series');
const Sheikh = require('../../../models/Sheikh');
const testDb = require('../../helpers/testDb');

describe('Series Model', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  afterEach(async () => {
    await Series.deleteMany({});
    await Sheikh.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid series with required fields', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'شرح كتاب التوحيد',
        sheikhId: sheikh._id
      });

      expect(series.titleArabic).toBe('شرح كتاب التوحيد');
      expect(series.sheikhId.toString()).toBe(sheikh._id.toString());
      expect(series.category).toBe('Other'); // Default value
    });

    it('should fail validation without required titleArabic', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = new Series({
        sheikhId: sheikh._id
      });

      await expect(series.save()).rejects.toThrow();
    });

    it('should fail validation without required sheikhId', async () => {
      const series = new Series({
        titleArabic: 'Test Series'
      });

      await expect(series.save()).rejects.toThrow();
    });
  });

  describe('Optional Fields', () => {
    it('should accept optional descriptionArabic', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'شرح كتاب التوحيد',
        sheikhId: sheikh._id,
        descriptionArabic: 'شرح مفصل لكتاب التوحيد'
      });

      expect(series.descriptionArabic).toBe('شرح مفصل لكتاب التوحيد');
    });

    it('should accept optional category', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'Test Series',
        sheikhId: sheikh._id,
        category: 'Aqeedah'
      });

      expect(series.category).toBe('Aqeedah');
    });

    it('should accept optional thumbnailUrl', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'Test Series',
        sheikhId: sheikh._id,
        thumbnailUrl: '/uploads/series-cover.jpg'
      });

      expect(series.thumbnailUrl).toBe('/uploads/series-cover.jpg');
    });

    it('should accept optional bookTitle and bookAuthor', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'شرح كتاب التوحيد',
        sheikhId: sheikh._id,
        bookTitle: 'كتاب التوحيد',
        bookAuthor: 'محمد بن عبد الوهاب'
      });

      expect(series.bookTitle).toBe('كتاب التوحيد');
      expect(series.bookAuthor).toBe('محمد بن عبد الوهاب');
    });

    it('should default lectureCount to 0', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'Test Series',
        sheikhId: sheikh._id
      });

      expect(series.lectureCount).toBe(0);
    });
  });

  describe('Timestamps', () => {
    it('should automatically add createdAt and updatedAt', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'Test Series',
        sheikhId: sheikh._id
      });

      expect(series.createdAt).toBeInstanceOf(Date);
      expect(series.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Category Enum', () => {
    it('should accept valid category values', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const categories = ['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'];
      
      for (const category of categories) {
        const series = await Series.create({
          titleArabic: `Series ${category}`,
          sheikhId: sheikh._id,
          category
        });
        expect(series.category).toBe(category);
      }
    });

    it('should reject invalid category values', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = new Series({
        titleArabic: 'Test Series',
        sheikhId: sheikh._id,
        category: 'InvalidCategory'
      });

      await expect(series.save()).rejects.toThrow();
    });
  });
});

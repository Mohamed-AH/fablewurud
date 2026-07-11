/**
 * Unit Tests for Sheikh Model
 */

const Sheikh = require('../../../models/Sheikh');
const testDb = require('../../helpers/testDb');

describe('Sheikh Model', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  afterEach(async () => {
    await Sheikh.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid sheikh with required fields', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد بن عبد الوهاب'
      });

      expect(sheikh.nameArabic).toBe('الشيخ محمد بن عبد الوهاب');
      expect(sheikh.honorific).toBe('حفظه الله'); // Default value
    });

    it('should fail validation without required nameArabic', async () => {
      const sheikh = new Sheikh({
        nameEnglish: 'Test Sheikh'
      });

      await expect(sheikh.save()).rejects.toThrow();
    });

    it('should create sheikh with English name (optional)', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmad'
      });

      expect(sheikh.nameArabic).toBe('الشيخ أحمد');
      expect(sheikh.nameEnglish).toBe('Sheikh Ahmad');
    });
  });

  describe('Optional Fields', () => {
    it('should accept optional bioArabic', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد',
        bioArabic: 'عالم جليل من نجد'
      });

      expect(sheikh.bioArabic).toBe('عالم جليل من نجد');
    });

    it('should accept optional photoUrl', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد',
        photoUrl: '/uploads/sheikh.jpg'
      });

      expect(sheikh.photoUrl).toBe('/uploads/sheikh.jpg');
    });

    it('should default lectureCount to 0', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      expect(sheikh.lectureCount).toBe(0);
    });
  });

  describe('Timestamps', () => {
    it('should automatically add createdAt and updatedAt', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      expect(sheikh.createdAt).toBeInstanceOf(Date);
      expect(sheikh.updatedAt).toBeInstanceOf(Date);
    });
  });
});

const express = require('express');
const router = express.Router();
const { Sheikh } = require('../../models');
const { isAdminAPI } = require('../../middleware/auth');
const { isValidObjectId } = require('../../utils/validators');

const isProduction = process.env.NODE_ENV === 'production';

// @route   GET /api/sheikhs
// @desc    Get all sheikhs
// @access  Public
router.get('/', async (req, res) => {
  try {
    const sheikhs = await Sheikh.find()
      .sort({ nameArabic: 1 })
      .lean();

    res.json({
      success: true,
      sheikhs: sheikhs
    });
  } catch (error) {
    console.error('Get sheikhs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sheikhs',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   POST /api/sheikhs
// @desc    Create new sheikh
// @access  Private (Admin only)
router.post('/', isAdminAPI, async (req, res) => {
  try {
    const { nameArabic, nameEnglish, honorific, bioArabic, bioEnglish } = req.body;

    if (!nameArabic) {
      return res.status(400).json({
        success: false,
        message: 'Arabic name is required'
      });
    }

    const sheikh = await Sheikh.create({
      nameArabic,
      nameEnglish: nameEnglish || '',
      honorific: honorific || 'حفظه الله',
      bioArabic: bioArabic || '',
      bioEnglish: bioEnglish || ''
    });

    res.status(201).json({
      success: true,
      message: 'Sheikh created successfully',
      sheikh: sheikh
    });
  } catch (error) {
    console.error('Create sheikh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sheikh',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   PUT /api/sheikhs/:id
// @desc    Update sheikh
// @access  Private (Admin only)
router.put('/:id', isAdminAPI, async (req, res) => {
  try {
    // Validate ID format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sheikh ID format'
      });
    }

    const { nameArabic, nameEnglish, honorific, bioArabic, bioEnglish } = req.body;

    const sheikh = await Sheikh.findByIdAndUpdate(
      req.params.id,
      {
        nameArabic,
        nameEnglish,
        honorific,
        bioArabic,
        bioEnglish
      },
      { new: true, runValidators: true }
    );

    if (!sheikh) {
      return res.status(404).json({
        success: false,
        message: 'Sheikh not found'
      });
    }

    res.json({
      success: true,
      message: 'Sheikh updated successfully',
      sheikh: sheikh
    });
  } catch (error) {
    console.error('Update sheikh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sheikh',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   DELETE /api/sheikhs/:id
// @desc    Delete sheikh
// @access  Private (Admin only)
router.delete('/:id', isAdminAPI, async (req, res) => {
  try {
    // Validate ID format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sheikh ID format'
      });
    }

    const { Lecture } = require('../../models');

    // Check if sheikh has lectures
    const lectureCount = await Lecture.countDocuments({ sheikhId: req.params.id });

    if (lectureCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete sheikh with ${lectureCount} lectures. Delete lectures first.`
      });
    }

    const sheikh = await Sheikh.findByIdAndDelete(req.params.id);

    if (!sheikh) {
      return res.status(404).json({
        success: false,
        message: 'Sheikh not found'
      });
    }

    res.json({
      success: true,
      message: 'Sheikh deleted successfully'
    });
  } catch (error) {
    console.error('Delete sheikh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sheikh',
      error: isProduction ? undefined : error.message
    });
  }
});

module.exports = router;

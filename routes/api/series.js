const express = require('express');
const router = express.Router();
const { Series } = require('../../models');
const { isAdminAPI } = require('../../middleware/auth');
const { isValidObjectId } = require('../../utils/validators');

const isProduction = process.env.NODE_ENV === 'production';

// @route   GET /api/series/export
// @desc    Export all series to CSV
// @access  Public (can be restricted to admin if needed)
router.get('/export', async (req, res) => {
  try {
    const series = await Series.find()
      .sort({ titleArabic: 1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .lean();

    // Create CSV content
    const headers = ['ID', 'Title (Arabic)', 'Title (English)', 'Description (Arabic)', 'Description (English)', 'Sheikh (Arabic)', 'Sheikh (English)', 'Category', 'Book Title', 'Book Author', 'Created At'];
    const rows = series.map(s => [
      s._id.toString(),
      `"${(s.titleArabic || '').replace(/"/g, '""')}"`,
      `"${(s.titleEnglish || '').replace(/"/g, '""')}"`,
      `"${(s.descriptionArabic || '').replace(/"/g, '""')}"`,
      `"${(s.descriptionEnglish || '').replace(/"/g, '""')}"`,
      `"${(s.sheikhId?.nameArabic || '').replace(/"/g, '""')}"`,
      `"${(s.sheikhId?.nameEnglish || '').replace(/"/g, '""')}"`,
      `"${(s.category || '').replace(/"/g, '""')}"`,
      `"${(s.bookTitle || '').replace(/"/g, '""')}"`,
      `"${(s.bookAuthor || '').replace(/"/g, '""')}"`,
      new Date(s.createdAt).toISOString()
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=series-export-${new Date().toISOString().split('T')[0]}.csv`);

    // Add BOM for proper UTF-8 encoding in Excel
    res.write('\uFEFF');
    res.end(csv);
  } catch (error) {
    console.error('Export series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export series',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   GET /api/series
// @desc    Get all series
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { sheikhId } = req.query;
    const query = {};

    if (sheikhId) {
      query.sheikhId = sheikhId;
    }

    const series = await Series.find(query)
      .sort({ titleArabic: 1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .lean();

    res.json({
      success: true,
      series: series
    });
  } catch (error) {
    console.error('Get series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch series',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   GET /api/series/parents
// @desc    Get available parent series (top-level only, for dropdown)
// @access  Private (Admin only)
router.get('/parents', isAdminAPI, async (req, res) => {
  try {
    // Only return top-level series (no parent) that can be parents
    const parentSeries = await Series.find({
      parentSeriesId: null
    }).select('_id titleArabic titleEnglish shortId').sort({ titleArabic: 1 }).lean();

    res.json({
      success: true,
      series: parentSeries
    });
  } catch (error) {
    console.error('Get parent series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parent series'
    });
  }
});

// @route   POST /api/series
// @desc    Create new series
// @access  Private (Admin only)
router.post('/', isAdminAPI, async (req, res) => {
  try {
    const {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      sheikhId,
      category,
      bookTitle,
      bookAuthor,
      parentSeriesId
    } = req.body;

    if (!titleArabic) {
      return res.status(400).json({
        success: false,
        message: 'Arabic title is required'
      });
    }

    if (!sheikhId) {
      return res.status(400).json({
        success: false,
        message: 'Sheikh is required'
      });
    }

    // Validate parentSeriesId if provided
    if (parentSeriesId) {
      const parentSeries = await Series.findById(parentSeriesId);
      if (!parentSeries) {
        return res.status(400).json({
          success: false,
          message: 'Parent series not found'
        });
      }
      if (parentSeries.parentSeriesId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot nest under a child series'
        });
      }
    }

    const series = await Series.create({
      titleArabic,
      titleEnglish: titleEnglish || '',
      descriptionArabic: descriptionArabic || '',
      descriptionEnglish: descriptionEnglish || '',
      sheikhId,
      category: category || 'Other',
      bookTitle: bookTitle || '',
      bookAuthor: bookAuthor || '',
      parentSeriesId: parentSeriesId || null
    });

    await series.populate('sheikhId', 'nameArabic nameEnglish');

    res.status(201).json({
      success: true,
      message: 'Series created successfully',
      series: series
    });
  } catch (error) {
    console.error('Create series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create series',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   PUT /api/series/:id
// @desc    Update series
// @access  Private (Admin only)
router.put('/:id', isAdminAPI, async (req, res) => {
  try {
    // Validate ID format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid series ID format'
      });
    }

    const {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      category,
      bookTitle,
      bookAuthor,
      parentSeriesId,
      displayOptions
    } = req.body;

    // Prevent self-reference for parentSeriesId
    if (parentSeriesId && parentSeriesId === req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'A series cannot be its own parent'
      });
    }

    // Validate parentSeriesId exists and is a top-level series
    if (parentSeriesId) {
      const parentSeries = await Series.findById(parentSeriesId);
      if (!parentSeries) {
        return res.status(400).json({
          success: false,
          message: 'Parent series not found'
        });
      }
      if (parentSeries.parentSeriesId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot nest under a child series. Select a top-level parent.'
        });
      }
    }

    const updateData = {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      category,
      bookTitle,
      bookAuthor
    };

    // Handle parentSeriesId (null to clear, ObjectId to set)
    if (parentSeriesId !== undefined) {
      updateData.parentSeriesId = parentSeriesId || null;
    }

    // Handle displayOptions updates
    if (displayOptions) {
      if (displayOptions.defaultSortOrder !== undefined) {
        updateData['displayOptions.defaultSortOrder'] = displayOptions.defaultSortOrder;
      }
      if (displayOptions.showSearch !== undefined) {
        updateData['displayOptions.showSearch'] = displayOptions.showSearch;
      }
      if (displayOptions.showYearFilter !== undefined) {
        updateData['displayOptions.showYearFilter'] = displayOptions.showYearFilter;
      }
      if (displayOptions.showSortOptions !== undefined) {
        updateData['displayOptions.showSortOptions'] = displayOptions.showSortOptions;
      }
    }

    const series = await Series.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('sheikhId', 'nameArabic nameEnglish');

    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    res.json({
      success: true,
      message: 'Series updated successfully',
      series: series
    });
  } catch (error) {
    console.error('Update series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update series',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   DELETE /api/series/:id
// @desc    Delete series
// @access  Private (Admin only)
router.delete('/:id', isAdminAPI, async (req, res) => {
  try {
    // Validate ID format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid series ID format'
      });
    }

    const { Lecture } = require('../../models');

    // Check if series has lectures
    const lectureCount = await Lecture.countDocuments({ seriesId: req.params.id });

    if (lectureCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete series with ${lectureCount} lectures. Delete lectures first.`
      });
    }

    const series = await Series.findByIdAndDelete(req.params.id);

    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    res.json({
      success: true,
      message: 'Series deleted successfully'
    });
  } catch (error) {
    console.error('Delete series error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete series',
      error: isProduction ? undefined : error.message
    });
  }
});

module.exports = router;

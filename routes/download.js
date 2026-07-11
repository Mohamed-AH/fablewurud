const express = require('express');
const router = express.Router();
const { downloadAudio } = require('../controllers/streamController');

// @route   GET /download/:id
// @desc    Download audio file
// @access  Public
router.get('/:id', downloadAudio);

module.exports = router;

const express = require('express');
const router = express.Router();
const { streamAudio, downloadAudio, getStreamInfo } = require('../controllers/streamController');

// @route   GET /stream/:id
// @desc    Stream audio file with Range request support
// @access  Public
router.get('/:id', streamAudio);

// @route   GET /stream/:id/info
// @desc    Get streaming information
// @access  Public
router.get('/:id/info', getStreamInfo);

module.exports = router;

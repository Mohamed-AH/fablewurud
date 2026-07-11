/**
 * Integration Tests for Stream and Download Routes
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const testDb = require('../../helpers/testDb');

// Mock the stream controller
jest.mock('../../../controllers/streamController', () => ({
  streamAudio: jest.fn((req, res) => {
    res.json({ success: true, action: 'stream', id: req.params.id });
  }),
  downloadAudio: jest.fn((req, res) => {
    res.json({ success: true, action: 'download', id: req.params.id });
  }),
  getStreamInfo: jest.fn((req, res) => {
    res.json({ success: true, action: 'info', id: req.params.id });
  })
}));

const { streamAudio, downloadAudio, getStreamInfo } = require('../../../controllers/streamController');

let streamApp;
let downloadApp;

describe('Stream and Download Routes', () => {
  beforeAll(async () => {
    await testDb.connect();

    // Create app for stream routes
    streamApp = express();
    streamApp.use(express.json());
    const streamRoutes = require('../../../routes/stream');
    streamApp.use('/stream', streamRoutes);

    // Create app for download routes
    downloadApp = express();
    downloadApp.use(express.json());
    const downloadRoutes = require('../../../routes/download');
    downloadApp.use('/download', downloadRoutes);
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Stream Routes', () => {
    describe('GET /stream/:id', () => {
      it('should route to streamAudio controller', async () => {
        const lectureId = new mongoose.Types.ObjectId().toString();

        const response = await request(streamApp)
          .get(`/stream/${lectureId}`)
          .expect(200);

        expect(streamAudio).toHaveBeenCalled();
        expect(response.body.action).toBe('stream');
        expect(response.body.id).toBe(lectureId);
      });

      it('should pass correct params to controller', async () => {
        const lectureId = '507f1f77bcf86cd799439011';

        await request(streamApp)
          .get(`/stream/${lectureId}`)
          .expect(200);

        expect(streamAudio).toHaveBeenCalled();
        const callArgs = streamAudio.mock.calls[0];
        expect(callArgs[0].params.id).toBe(lectureId);
      });
    });

    describe('GET /stream/:id/info', () => {
      it('should route to getStreamInfo controller', async () => {
        const lectureId = new mongoose.Types.ObjectId().toString();

        const response = await request(streamApp)
          .get(`/stream/${lectureId}/info`)
          .expect(200);

        expect(getStreamInfo).toHaveBeenCalled();
        expect(response.body.action).toBe('info');
        expect(response.body.id).toBe(lectureId);
      });
    });
  });

  describe('Download Routes', () => {
    describe('GET /download/:id', () => {
      it('should route to downloadAudio controller', async () => {
        const lectureId = new mongoose.Types.ObjectId().toString();

        const response = await request(downloadApp)
          .get(`/download/${lectureId}`)
          .expect(200);

        expect(downloadAudio).toHaveBeenCalled();
        expect(response.body.action).toBe('download');
        expect(response.body.id).toBe(lectureId);
      });

      it('should pass correct params to controller', async () => {
        const lectureId = '507f1f77bcf86cd799439011';

        await request(downloadApp)
          .get(`/download/${lectureId}`)
          .expect(200);

        expect(downloadAudio).toHaveBeenCalled();
        const callArgs = downloadAudio.mock.calls[0];
        expect(callArgs[0].params.id).toBe(lectureId);
      });
    });
  });
});

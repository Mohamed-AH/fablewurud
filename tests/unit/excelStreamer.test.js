/**
 * Unit Tests for Excel Streaming Utility
 */

const EventEmitter = require('events');

describe('Excel Streamer Utility', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.unmock('fs');
    jest.unmock('xlsx-stream-reader');
  });

  describe('streamExcel', () => {
    it('should reject if file does not exist', async () => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(false),
        createReadStream: jest.fn()
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {};
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      await expect(streamFn('/non/existent/file.xlsx', () => {}))
        .rejects.toThrow('File not found: /non/existent/file.xlsx');
    });

    it('should process worksheets and rows correctly', async () => {
      const mockRows = [
        { values: [null, 'Header1', 'Header2', 'Header3'] },
        { values: [null, 'Value1', 'Value2', 'Value3'] },
        { values: [null, 'Data1', 'Data2', 'Data3'] }
      ];

      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              const worksheetReader = new EventEmitter();
              worksheetReader.skip = jest.fn();
              worksheetReader.process = jest.fn().mockImplementation(() => {
                mockRows.forEach(row => {
                  worksheetReader.emit('row', row);
                });
                worksheetReader.emit('end');
              });

              this.emit('worksheet', worksheetReader);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      const processedRows = [];
      const result = await streamFn('/test/file.xlsx', (row, index) => {
        processedRows.push({ row, index });
      }, { hasHeader: true });

      expect(result.rowCount).toBe(2);
      expect(result.headers).toEqual(['Header1', 'Header2', 'Header3']);
      expect(processedRows).toHaveLength(2);
      expect(processedRows[0].row).toEqual({
        Header1: 'Value1',
        Header2: 'Value2',
        Header3: 'Value3'
      });
    });

    it('should skip sheets other than sheetIndex', async () => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      let skipCalled = false;

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              // First sheet (index 0) - should be skipped when sheetIndex=1
              const worksheetReader1 = new EventEmitter();
              worksheetReader1.skip = jest.fn().mockImplementation(() => {
                skipCalled = true;
              });
              worksheetReader1.process = jest.fn();

              this.emit('worksheet', worksheetReader1);

              // Second sheet (index 1) - should be processed
              const worksheetReader2 = new EventEmitter();
              worksheetReader2.skip = jest.fn();
              worksheetReader2.process = jest.fn().mockImplementation(() => {
                worksheetReader2.emit('row', { values: [null, 'Data'] });
                worksheetReader2.emit('end');
              });

              this.emit('worksheet', worksheetReader2);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      const processedRows = [];
      await streamFn('/test/file.xlsx', (row) => {
        processedRows.push(row);
      }, { sheetIndex: 1, hasHeader: false });

      expect(skipCalled).toBe(true);
      expect(processedRows).toHaveLength(1);
    });

    it('should process rows without headers when hasHeader is false', async () => {
      const mockRows = [
        { values: [null, 'Data1', 'Data2'] },
        { values: [null, 'Data3', 'Data4'] }
      ];

      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              const worksheetReader = new EventEmitter();
              worksheetReader.skip = jest.fn();
              worksheetReader.process = jest.fn().mockImplementation(() => {
                mockRows.forEach(row => {
                  worksheetReader.emit('row', row);
                });
                worksheetReader.emit('end');
              });

              this.emit('worksheet', worksheetReader);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      const processedRows = [];
      const result = await streamFn('/test/file.xlsx', (row, index) => {
        processedRows.push(row);
      }, { hasHeader: false });

      expect(result.rowCount).toBe(2);
      expect(result.headers).toEqual([]);
      expect(processedRows[0]).toEqual(['Data1', 'Data2']);
    });

    it('should handle headers with empty/null values', async () => {
      const mockRows = [
        { values: [null, 'Header1', null, 'Header3'] },
        { values: [null, 'Value1', 'Value2', 'Value3'] }
      ];

      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              const worksheetReader = new EventEmitter();
              worksheetReader.skip = jest.fn();
              worksheetReader.process = jest.fn().mockImplementation(() => {
                mockRows.forEach(row => {
                  worksheetReader.emit('row', row);
                });
                worksheetReader.emit('end');
              });

              this.emit('worksheet', worksheetReader);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      const processedRows = [];
      const result = await streamFn('/test/file.xlsx', (row) => {
        processedRows.push(row);
      });

      expect(result.headers).toContain('Header1');
      expect(result.headers).toContain('Header3');
      expect(processedRows[0]).toHaveProperty('Header1', 'Value1');
      expect(processedRows[0]).toHaveProperty('Header3', 'Value3');
      // Empty header column should not be included
      expect(processedRows[0]).not.toHaveProperty('');
    });

    // Error test placed at end to avoid mock interference
    it('should handle error events from stream reader', async () => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              this.emit('error', new Error('Stream error'));
            });
          }
        };
      });

      jest.resetModules();
      const { streamExcel: streamFn } = require('../../utils/excelStreamer');

      await expect(streamFn('/test/file.xlsx', () => {}))
        .rejects.toThrow('Stream error');
    });
  });

  describe('readExcelStreaming', () => {
    it('should return all rows as an array', async () => {
      const mockRows = [
        { values: [null, 'Name', 'Age'] },
        { values: [null, 'John', '30'] },
        { values: [null, 'Jane', '25'] }
      ];

      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              const worksheetReader = new EventEmitter();
              worksheetReader.skip = jest.fn();
              worksheetReader.process = jest.fn().mockImplementation(() => {
                mockRows.forEach(row => {
                  worksheetReader.emit('row', row);
                });
                worksheetReader.emit('end');
              });

              this.emit('worksheet', worksheetReader);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { readExcelStreaming: readFn } = require('../../utils/excelStreamer');

      const result = await readFn('/test/file.xlsx');

      expect(result.rows).toHaveLength(2);
      expect(result.headers).toEqual(['Name', 'Age']);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({ Name: 'John', Age: '30' });
      expect(result.rows[1]).toEqual({ Name: 'Jane', Age: '25' });
    });

    it('should pass options to streamExcel', async () => {
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        createReadStream: jest.fn().mockReturnValue({
          pipe: jest.fn().mockImplementation(function(target) {
            return target;
          })
        })
      }));

      let skipCallCount = 0;

      jest.doMock('xlsx-stream-reader', () => {
        return class extends EventEmitter {
          constructor() {
            super();
            setImmediate(() => {
              // First sheet
              const ws1 = new EventEmitter();
              ws1.skip = jest.fn(() => skipCallCount++);
              ws1.process = jest.fn();
              this.emit('worksheet', ws1);

              // Second sheet (sheetIndex=1)
              const ws2 = new EventEmitter();
              ws2.skip = jest.fn();
              ws2.process = jest.fn().mockImplementation(() => {
                ws2.emit('row', { values: [null, 'Test'] });
                ws2.emit('end');
              });
              this.emit('worksheet', ws2);

              setImmediate(() => {
                this.emit('end');
              });
            });
          }
        };
      });

      jest.resetModules();
      const { readExcelStreaming: readFn } = require('../../utils/excelStreamer');

      const result = await readFn('/test/file.xlsx', {
        sheetIndex: 1,
        hasHeader: false
      });

      expect(skipCallCount).toBe(1);
      expect(result.rows[0]).toEqual(['Test']);
    });
  });
});

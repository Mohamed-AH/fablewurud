/**
 * Unit Tests for cache utility
 * Tests in-memory caching with TTL
 */

// Import the cache module - we need to test a fresh instance
const MemoryCache = require('../../utils/cache').constructor;

describe('MemoryCache Utility', () => {
  let cache;

  beforeEach(() => {
    // Create a new cache instance for each test
    cache = new MemoryCache();
  });

  afterEach(() => {
    // Clean up
    cache.clear();
  });

  describe('get() and set()', () => {
    it('should store and retrieve a value', () => {
      cache.set('testKey', 'testValue');
      expect(cache.get('testKey')).toBe('testValue');
    });

    it('should store different data types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);
      cache.set('object', { foo: 'bar' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('boolean')).toBe(true);
      expect(cache.get('object')).toEqual({ foo: 'bar' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonExistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      cache.set('key', 'value1');
      cache.set('key', 'value2');

      expect(cache.get('key')).toBe('value2');
    });

    it('should expire values after TTL', async () => {
      cache.set('expiring', 'value', 0.1); // 100ms TTL

      expect(cache.get('expiring')).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('expiring')).toBeUndefined();
    });

    it('should use default TTL when not specified', () => {
      expect(cache.defaultTTL).toBe(300);

      cache.set('defaultTTL', 'value');
      expect(cache.get('defaultTTL')).toBe('value');
    });
  });

  describe('has()', () => {
    it('should return true for existing keys', () => {
      cache.set('exists', 'value');
      expect(cache.has('exists')).toBe(true);
    });

    it('should return false for non-existing keys', () => {
      expect(cache.has('notExists')).toBe(false);
    });
  });

  describe('del()', () => {
    it('should delete a key', () => {
      cache.set('toDelete', 'value');
      expect(cache.get('toDelete')).toBe('value');

      cache.del('toDelete');
      expect(cache.get('toDelete')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', () => {
      expect(() => cache.del('nonExistent')).not.toThrow();
    });

    it('should clear the expiration timer', async () => {
      cache.set('timerTest', 'value', 0.1);
      cache.del('timerTest');

      // Wait for what would have been expiration time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should not throw or cause issues
      expect(cache.has('timerTest')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all cached values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeUndefined();
    });

    it('should clear all timers', () => {
      cache.set('timer1', 'value1', 1);
      cache.set('timer2', 'value2', 1);

      cache.clear();

      expect(cache.keys()).toHaveLength(0);
    });
  });

  describe('getOrSet()', () => {
    it('should return cached value if exists', async () => {
      cache.set('existing', 'cachedValue');

      const fetchFn = jest.fn().mockResolvedValue('newValue');
      const result = await cache.getOrSet('existing', fetchFn);

      expect(result).toBe('cachedValue');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should compute and cache value if not exists', async () => {
      const fetchFn = jest.fn().mockResolvedValue('computedValue');
      const result = await cache.getOrSet('newKey', fetchFn);

      expect(result).toBe('computedValue');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(cache.get('newKey')).toBe('computedValue');
    });

    it('should use custom TTL for new values', async () => {
      const fetchFn = jest.fn().mockResolvedValue('value');
      await cache.getOrSet('ttlKey', fetchFn, 0.1);

      expect(cache.get('ttlKey')).toBe('value');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('ttlKey')).toBeUndefined();
    });

    it('should handle async functions', async () => {
      const asyncFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'asyncResult';
      };

      const result = await cache.getOrSet('asyncKey', asyncFn);
      expect(result).toBe('asyncResult');
    });
  });

  describe('invalidatePattern()', () => {
    it('should invalidate keys matching pattern', () => {
      cache.set('homepage:series', 'value1');
      cache.set('homepage:lectures', 'value2');
      cache.set('api:data', 'value3');

      const deleted = cache.invalidatePattern('homepage:*');

      expect(deleted).toBe(2);
      expect(cache.get('homepage:series')).toBeUndefined();
      expect(cache.get('homepage:lectures')).toBeUndefined();
      expect(cache.get('api:data')).toBe('value3');
    });

    it('should handle wildcard at end', () => {
      cache.set('user:123:profile', 'value1');
      cache.set('user:123:settings', 'value2');
      cache.set('user:456:profile', 'value3');

      const deleted = cache.invalidatePattern('user:123:*');

      expect(deleted).toBe(2);
      expect(cache.get('user:456:profile')).toBe('value3');
    });

    it('should handle exact matches (no wildcard)', () => {
      cache.set('exactKey', 'value');
      cache.set('exactKeyExtra', 'value2');

      const deleted = cache.invalidatePattern('exactKey');

      expect(deleted).toBe(1);
      expect(cache.get('exactKey')).toBeUndefined();
      expect(cache.get('exactKeyExtra')).toBe('value2');
    });

    it('should return 0 when no keys match', () => {
      cache.set('key1', 'value1');

      const deleted = cache.invalidatePattern('noMatch:*');

      expect(deleted).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should track hits and misses', () => {
      cache.set('hit', 'value');

      cache.get('hit'); // hit
      cache.get('hit'); // hit
      cache.get('miss1'); // miss
      cache.get('miss2'); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should track sets', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const stats = cache.getStats();
      expect(stats.sets).toBe(3);
    });

    it('should calculate hit rate', () => {
      cache.set('key', 'value');

      // 3 hits, 1 miss = 75% hit rate
      cache.get('key');
      cache.get('key');
      cache.get('key');
      cache.get('missing');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('75.0%');
    });

    it('should return N/A for hit rate when no accesses', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('N/A');
    });

    it('should report cache size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('keys()', () => {
    it('should return all cache keys', () => {
      cache.set('alpha', 1);
      cache.set('beta', 2);
      cache.set('gamma', 3);

      const keys = cache.keys();

      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
      expect(keys).toHaveLength(3);
    });

    it('should return empty array when cache is empty', () => {
      expect(cache.keys()).toEqual([]);
    });
  });
});

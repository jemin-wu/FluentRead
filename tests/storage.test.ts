import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  djb2,
  loadCache,
  getFromCache,
  saveToCache,
  flushCache,
  getCacheStats,
  _resetCache,
} from '../src/utils/storage';

const storageStore: Record<string, unknown> = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        if (typeof key === 'string') {
          return { [key]: storageStore[key] };
        }
        return {};
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(storageStore, obj);
      }),
    },
  },
} as any;

describe('storage', () => {
  beforeEach(() => {
    _resetCache();
    Object.keys(storageStore).forEach((k) => delete storageStore[k]);
    vi.clearAllMocks();
  });

  describe('djb2', () => {
    it('returns a deterministic hash string', () => {
      const h1 = djb2('hello');
      const h2 = djb2('hello');
      expect(h1).toBe(h2);
      expect(typeof h1).toBe('string');
    });

    it('produces different hashes for different inputs', () => {
      expect(djb2('hello')).not.toBe(djb2('world'));
    });
  });

  describe('loadCache', () => {
    it('initializes empty cache when storage is empty', async () => {
      await loadCache('example.com');
      expect(getCacheStats().entries).toBe(0);
      expect(getCacheStats().domain).toBe('example.com');
    });

    it('loads stored entries from chrome.storage', async () => {
      storageStore['fluentread_cache_test.com'] = {
        somekey: { translation: 'hello', ts: Date.now() },
      };
      await loadCache('test.com');
      expect(getCacheStats().entries).toBe(1);
    });

    it('filters out expired entries on load', async () => {
      const expiredTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
      storageStore['fluentread_cache_test.com'] = {
        oldkey: { translation: 'old', ts: expiredTs },
      };
      await loadCache('test.com');
      expect(getCacheStats().entries).toBe(0);
    });
  });

  describe('getFromCache / saveToCache', () => {
    beforeEach(async () => {
      await loadCache('example.com');
    });

    it('returns null for cache miss', () => {
      expect(getFromCache('unknown text', 'zh')).toBeNull();
    });

    it('saves and retrieves translation', () => {
      saveToCache('hello world', 'zh', '你好世界');
      expect(getFromCache('hello world', 'zh')).toBe('你好世界');
    });

    it('returns null for different language', () => {
      saveToCache('hello', 'zh', '你好');
      expect(getFromCache('hello', 'ja')).toBeNull();
    });

    it('returns null for expired entry', () => {
      saveToCache('test', 'zh', '测试');
      // Fast-forward time to force cache expiry
      const original = Date.now;
      Date.now = () => original() + 8 * 24 * 60 * 60 * 1000;
      expect(getFromCache('test', 'zh')).toBeNull();
      Date.now = original;
    });
  });

  describe('FIFO eviction', () => {
    beforeEach(async () => {
      await loadCache('example.com');
    });

    it('evicts oldest entries when exceeding 500', () => {
      for (let i = 0; i < 510; i++) {
        saveToCache(`text-${i}`, 'zh', `translated-${i}`);
      }
      expect(getCacheStats().entries).toBe(500);
      expect(getFromCache('text-0', 'zh')).toBeNull();
      expect(getFromCache('text-509', 'zh')).toBe('translated-509');
    });
  });

  describe('flushCache', () => {
    it('writes cache to chrome.storage.local', async () => {
      await loadCache('example.com');
      saveToCache('hello', 'zh', '你好');
      await flushCache();
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const call = (chrome.storage.local.set as any).mock.calls[0][0];
      expect(call).toHaveProperty('fluentread_cache_example.com');
    });
  });

  describe('getCacheStats', () => {
    it('returns domain, entries, and estimatedBytes', async () => {
      await loadCache('stats.com');
      saveToCache('hi', 'zh', '嗨');
      const stats = getCacheStats();
      expect(stats.domain).toBe('stats.com');
      expect(stats.entries).toBe(1);
      expect(stats.estimatedBytes).toBeGreaterThan(0);
    });
  });
});

/**
 * Translation cache: in-memory Map backed by chrome.storage.local.
 * Key = djb2(text + targetLang), FIFO eviction per domain.
 */

const MAX_ENTRIES_PER_DOMAIN = 500;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MB
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STORAGE_KEY = 'fluentread_cache';

interface CacheEntry {
  translation: string;
  ts: number;
}

let cache = new Map<string, CacheEntry>();
let currentDomain = '';

export function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function cacheKey(text: string, lang: string): string {
  return djb2(text + lang);
}

export async function loadCache(domain?: string) {
  currentDomain = domain || (typeof location !== 'undefined' ? location.hostname : '');
  const storageKey = `${STORAGE_KEY}_${currentDomain}`;
  try {
    const result = await chrome.storage.local.get(storageKey);
    const stored = result[storageKey];
    if (stored && typeof stored === 'object') {
      const now = Date.now();
      cache = new Map();
      for (const [k, v] of Object.entries(stored) as [string, CacheEntry][]) {
        if (now - v.ts < TTL_MS) {
          cache.set(k, v);
        }
      }
    } else {
      cache = new Map();
    }
  } catch {
    cache = new Map();
  }
}

export function getFromCache(text: string, lang: string): string | null {
  const key = cacheKey(text, lang);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.translation;
}

export function saveToCache(text: string, lang: string, translation: string) {
  const key = cacheKey(text, lang);
  cache.set(key, { translation, ts: Date.now() });
  evictIfNeeded();
}

function evictIfNeeded() {
  if (cache.size > MAX_ENTRIES_PER_DOMAIN) {
    const excess = cache.size - MAX_ENTRIES_PER_DOMAIN;
    const keys = cache.keys();
    for (let i = 0; i < excess; i++) {
      cache.delete(keys.next().value!);
    }
  }
  const estimatedSize = JSON.stringify(Object.fromEntries(cache)).length * 2;
  if (estimatedSize > MAX_TOTAL_BYTES) {
    const toRemove = Math.ceil(cache.size * 0.2);
    const keys = cache.keys();
    for (let i = 0; i < toRemove; i++) {
      cache.delete(keys.next().value!);
    }
  }
}

export async function flushCache() {
  const storageKey = `${STORAGE_KEY}_${currentDomain}`;
  const obj = Object.fromEntries(cache);
  await chrome.storage.local.set({ [storageKey]: obj });
}

export function getCacheStats() {
  return {
    domain: currentDomain,
    entries: cache.size,
    estimatedBytes: JSON.stringify(Object.fromEntries(cache)).length * 2,
  };
}

export function _resetCache() {
  cache = new Map();
  currentDomain = '';
}

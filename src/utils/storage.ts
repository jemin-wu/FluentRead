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
let estimatedBytes = 0;

function entrySize(key: string, entry: CacheEntry): number {
  // Rough estimate: key length + translation length + timestamp overhead, × 2 for UTF-16
  return (key.length + entry.translation.length + 20) * 2;
}

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
    estimatedBytes = 0;
    for (const [k, v] of cache) {
      estimatedBytes += entrySize(k, v);
    }
  } catch {
    cache = new Map();
    estimatedBytes = 0;
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
  const entry = { translation, ts: Date.now() };
  const oldEntry = cache.get(key);
  if (oldEntry) {
    estimatedBytes -= entrySize(key, oldEntry);
  }
  cache.set(key, entry);
  estimatedBytes += entrySize(key, entry);
  evictIfNeeded();
}

function evictIfNeeded() {
  if (cache.size > MAX_ENTRIES_PER_DOMAIN) {
    const excess = cache.size - MAX_ENTRIES_PER_DOMAIN;
    const keys = cache.keys();
    for (let i = 0; i < excess; i++) {
      const key = keys.next().value!;
      const entry = cache.get(key);
      if (entry) estimatedBytes -= entrySize(key, entry);
      cache.delete(key);
    }
  }
  if (estimatedBytes > MAX_TOTAL_BYTES) {
    const toRemove = Math.ceil(cache.size * 0.2);
    const keys = cache.keys();
    for (let i = 0; i < toRemove; i++) {
      const key = keys.next().value!;
      const entry = cache.get(key);
      if (entry) estimatedBytes -= entrySize(key, entry);
      cache.delete(key);
    }
  }
}

export async function flushCache() {
  if (!currentDomain || cache.size === 0) return;
  const storageKey = `${STORAGE_KEY}_${currentDomain}`;
  const obj = Object.fromEntries(cache);
  await chrome.storage.local.set({ [storageKey]: obj });
}

export function getCacheStats() {
  return {
    domain: currentDomain,
    entries: cache.size,
    estimatedBytes,
  };
}

export function _resetCache() {
  cache = new Map();
  currentDomain = '';
  estimatedBytes = 0;
}

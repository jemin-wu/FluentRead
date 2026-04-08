/**
 * Options page script for FluentRead.
 */

import './style.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${val} ${units[i]}`;
}

async function loadDefaultLang() {
  const select = document.getElementById('default-lang') as HTMLSelectElement;
  const result = await chrome.storage.sync.get('defaultLang');
  if (result.defaultLang) {
    select.value = result.defaultLang as string;
  }
  select.addEventListener('change', () => {
    chrome.storage.sync.set({ defaultLang: select.value });
  });
}

async function loadSiteList() {
  const container = document.getElementById('site-list')!;
  const result = await chrome.storage.sync.get('autoTranslateSites');
  const sites = result.autoTranslateSites || {};
  const domains = Object.entries(sites)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (domains.length === 0) {
    container.textContent = '';
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = '暂无已配置站点';
    container.appendChild(emptyMsg);
    return;
  }

  container.textContent = '';
  for (const domain of domains) {
    const item = document.createElement('div');
    item.className = 'site-item';
    const span = document.createElement('span');
    span.className = 'site-domain';
    span.textContent = domain;
    const btn = document.createElement('button');
    btn.className = 'site-remove';
    btn.dataset.domain = domain;
    btn.textContent = '删除';
    item.append(span, btn);
    container.appendChild(item);
  }
}

function initSiteListClickHandler() {
  const container = document.getElementById('site-list')!;
  container.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.site-remove');
    if (!btn) return;
    const domain = btn.dataset.domain!;
    const current = await chrome.storage.sync.get('autoTranslateSites');
    const currentSites = (current.autoTranslateSites || {}) as Record<string, boolean>;
    delete currentSites[domain];
    await chrome.storage.sync.set({ autoTranslateSites: currentSites });
    loadSiteList();
  });
}

async function loadCacheStats() {
  const el = document.getElementById('cache-size')!;
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    el.textContent = `${formatBytes(bytesInUse)} / 8 MB`;
  } catch {
    el.textContent = '-- / 8 MB';
  }
}

function initClearCache() {
  const btn = document.getElementById('clear-cache') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(all).filter((k) => k.startsWith('fluentread_cache'));
    if (cacheKeys.length > 0) {
      await chrome.storage.local.remove(cacheKeys);
    }
    btn.textContent = '已清空';
    btn.style.color = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
    setTimeout(() => {
      btn.textContent = '清空翻译缓存';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 1500);
    loadCacheStats();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadDefaultLang();
  initSiteListClickHandler();
  loadSiteList();
  loadCacheStats();
  initClearCache();
});

/**
 * Background Service Worker for FluentRead.
 * Handles keyboard shortcuts, popup messages, and auto-translate.
 */

/** Tab translation state: 'loading' = in progress, 'done' = finished */
type TabState = 'loading' | 'done';
const TAB_STATES_KEY = 'tabStates';

// 内存缓存 + chrome.storage.session 双写，确保 SW 重启后状态不丢失
let tabStates = new Map<number, TabState>();

// Microtask-debounced: rapid mutations within the same tick coalesce into one write
let persistScheduled = false;
function persistTabStates() {
  if (persistScheduled) return;
  persistScheduled = true;
  queueMicrotask(() => {
    persistScheduled = false;
    const obj = Object.fromEntries(tabStates);
    chrome.storage.session.set({ [TAB_STATES_KEY]: obj }).catch(() => {});
  });
}

async function restoreTabStates() {
  try {
    const result = await chrome.storage.session.get(TAB_STATES_KEY);
    const stored = result[TAB_STATES_KEY];
    if (stored && typeof stored === 'object') {
      tabStates = new Map(Object.entries(stored).map(([k, v]) => [Number(k), v as TabState]));
    }
  } catch {
    // session storage not available, use empty map
  }
}

export default defineBackground(() => {
  restoreTabStates().then(() => {
    setupCommandListener();
    setupMessageListener();
    setupTabListener();
  });
});

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function isAutoTranslateEnabled(domain: string): Promise<boolean> {
  const result = await chrome.storage.sync.get('autoTranslateSites');
  const sites = (result.autoTranslateSites || {}) as Record<string, boolean>;
  return !!sites[domain];
}

async function sendToTab(tabId: number, message: Record<string, unknown>) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may not be ready yet — ignore
  }
}

export function setupCommandListener() {
  chrome.commands.onCommand.addListener(async (command) => {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    if (command === 'toggle-translate') {
      const state = tabStates.get(tabId);
      if (state === 'loading') return; // Don't interrupt active translation
      if (state === 'done') {
        // Tab already translated — cancel and reset
        tabStates.delete(tabId);
        persistTabStates();
        await sendToTab(tabId, { type: 'cancel' });
      } else {
        // No translation — start one
        tabStates.set(tabId, 'loading');
        persistTabStates();
        await sendToTab(tabId, { type: 'translate' });
      }
    } else if (command === 'toggle-mode') {
      if (tabStates.get(tabId) === 'loading') return;
      await sendToTab(tabId, { type: 'switchMode' });
    }
  });
}

export function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender.tab?.id)
      .then(sendResponse)
      .catch(() => sendResponse({ error: 'internal error' }));
    return true;
  });
}

async function handleMessage(message: Record<string, unknown>, senderTabId?: number) {
  const { type, tabId: requestTabId } = message;
  const tabId = (requestTabId as number) ?? senderTabId ?? (await getActiveTabId());
  if (!tabId) return { error: 'No active tab' };

  switch (type) {
    case 'translate':
      tabStates.set(tabId, 'loading');
      persistTabStates();
      await sendToTab(tabId, message);
      return { success: true };

    case 'translateComplete':
      if (tabStates.has(tabId)) {
        tabStates.set(tabId, 'done');
        persistTabStates();
      }
      return { success: true };

    case 'cancel':
      tabStates.delete(tabId);
      persistTabStates();
      await sendToTab(tabId, message);
      return { success: true };

    case 'switchMode':
      await sendToTab(tabId, message);
      return { success: true };

    case 'toggleSelection':
      await sendToTab(tabId, message);
      return { success: true };

    case 'getTranslateState':
      return {
        translating: tabStates.has(tabId),
        loading: tabStates.get(tabId) === 'loading',
      };

    case 'toggleAutoTranslate': {
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url) return { error: 'No tab URL' };
      const domain = new URL(tab.url).hostname;
      const result = await chrome.storage.sync.get('autoTranslateSites');
      const sites = (result.autoTranslateSites || {}) as Record<string, boolean>;
      sites[domain] = !sites[domain];
      await chrome.storage.sync.set({ autoTranslateSites: sites });
      return { success: true, enabled: sites[domain] };
    }

    case 'getAutoTranslateState': {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url) return { enabled: false };
        const domain = new URL(tab.url).hostname;
        const result = await chrome.storage.sync.get('autoTranslateSites');
        const sites = (result.autoTranslateSites || {}) as Record<string, boolean>;
        return { enabled: !!sites[domain] };
      } catch {
        return { enabled: false };
      }
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

export function setupTabListener() {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return;

    // Page navigation resets translation state
    tabStates.delete(tabId);

    try {
      const domain = new URL(tab.url).hostname;
      if (await isAutoTranslateEnabled(domain)) {
        tabStates.set(tabId, 'loading');
        await sendToTab(tabId, { type: 'translate' });
      }
    } catch {
      // Ignore invalid URLs (chrome://, etc.)
    }
    persistTabStates();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
    persistTabStates();
  });
}

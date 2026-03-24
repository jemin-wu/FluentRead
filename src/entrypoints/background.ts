/**
 * Background Service Worker for FluentRead.
 * Handles keyboard shortcuts, popup messages, and auto-translate.
 */

const translatingTabs = new Set<number>();

export default defineBackground(() => {
  setupCommandListener();
  setupMessageListener();
  setupTabListener();
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
      await sendToTab(tabId, { type: 'translate' });
    } else if (command === 'toggle-mode') {
      await sendToTab(tabId, { type: 'switchMode' });
    }
  });
}

export function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch(() => sendResponse({ error: 'internal error' }));
    return true;
  });
}

async function handleMessage(message: Record<string, unknown>) {
  const { type, tabId: requestTabId } = message;
  const tabId = (requestTabId as number) || (await getActiveTabId());
  if (!tabId) return { error: 'No active tab' };

  switch (type) {
    case 'translate':
      translatingTabs.add(tabId);
      await sendToTab(tabId, message);
      return { success: true };

    case 'cancel':
      translatingTabs.delete(tabId);
      await sendToTab(tabId, message);
      return { success: true };

    case 'switchMode':
      await sendToTab(tabId, message);
      return { success: true };

    case 'getTranslateState':
      return { translating: translatingTabs.has(tabId) };

    case 'toggleAutoTranslate': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return { error: 'No active tab URL' };
      const domain = new URL(tab.url).hostname;
      const result = await chrome.storage.sync.get('autoTranslateSites');
      const sites = (result.autoTranslateSites || {}) as Record<string, boolean>;
      sites[domain] = !sites[domain];
      await chrome.storage.sync.set({ autoTranslateSites: sites });
      return { success: true, enabled: sites[domain] };
    }

    case 'getAutoTranslateState': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return { enabled: false };
      try {
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
    translatingTabs.delete(tabId);

    try {
      const domain = new URL(tab.url).hostname;
      if (await isAutoTranslateEnabled(domain)) {
        translatingTabs.add(tabId);
        await sendToTab(tabId, { type: 'translate' });
      }
    } catch {
      // Ignore invalid URLs (chrome://, etc.)
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    translatingTabs.delete(tabId);
  });
}

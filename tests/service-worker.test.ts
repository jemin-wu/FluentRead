import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock WXT global
(globalThis as any).defineBackground = vi.fn((fn: () => void) => fn);

const mockTabsQuery = vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com/page' }]);
const mockTabsSendMessage = vi.fn().mockResolvedValue(undefined);
const mockStorageSyncGet = vi.fn().mockResolvedValue({});
const mockStorageSyncSet = vi.fn().mockResolvedValue(undefined);

let onCommandCallback: ((command: string) => Promise<void>) | null = null;
let onMessageCallback: ((message: any, sender: any, sendResponse: any) => boolean) | null = null;
let onUpdatedCallback: ((tabId: number, changeInfo: any, tab: any) => Promise<void>) | null = null;

(globalThis as any).chrome = {
  tabs: {
    query: mockTabsQuery,
    sendMessage: mockTabsSendMessage,
    onUpdated: {
      addListener: vi.fn((cb: any) => {
        onUpdatedCallback = cb;
      }),
    },
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn((cb: any) => {
        onMessageCallback = cb;
      }),
    },
  },
  commands: {
    onCommand: {
      addListener: vi.fn((cb: any) => {
        onCommandCallback = cb;
      }),
    },
  },
  storage: {
    sync: {
      get: mockStorageSyncGet,
      set: mockStorageSyncSet,
    },
  },
};

const { setupCommandListener, setupMessageListener, setupTabListener } =
  await import('../src/entrypoints/background');

describe('service-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTabsQuery.mockResolvedValue([{ id: 1, url: 'https://example.com/page' }]);
    mockTabsSendMessage.mockResolvedValue(undefined);
    mockStorageSyncGet.mockResolvedValue({});
  });

  describe('command listener', () => {
    it('registers onCommand listener', () => {
      setupCommandListener();
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalled();
    });

    it('sends translate message on toggle-translate command', async () => {
      setupCommandListener();
      await onCommandCallback!('toggle-translate');
      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'translate' });
    });

    it('sends switchMode message on toggle-mode command', async () => {
      setupCommandListener();
      await onCommandCallback!('toggle-mode');
      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'switchMode' });
    });

    it('does nothing when no active tab', async () => {
      mockTabsQuery.mockResolvedValue([]);
      setupCommandListener();
      await onCommandCallback!('toggle-translate');
      expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    it('blocks toggle-mode command when tab is in loading state', async () => {
      setupMessageListener();
      setupCommandListener();

      // Put tab 1 into loading state via translate message
      const sr = vi.fn();
      onMessageCallback!({ type: 'translate' }, { tab: { id: 1 } }, sr);
      await new Promise((r) => setTimeout(r, 10));
      mockTabsSendMessage.mockClear();

      // toggle-mode should be blocked
      await onCommandCallback!('toggle-mode');
      expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    it('allows toggle-mode command when tab is in done state', async () => {
      setupMessageListener();
      setupCommandListener();

      // Put tab 1 into loading, then done
      const sr1 = vi.fn();
      const sr2 = vi.fn();
      onMessageCallback!({ type: 'translate' }, { tab: { id: 1 } }, sr1);
      await new Promise((r) => setTimeout(r, 10));
      onMessageCallback!({ type: 'translateComplete' }, { tab: { id: 1 } }, sr2);
      await new Promise((r) => setTimeout(r, 10));
      mockTabsSendMessage.mockClear();

      // toggle-mode should be allowed
      await onCommandCallback!('toggle-mode');
      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'switchMode' });
    });
  });

  describe('message listener', () => {
    it('registers onMessage listener', () => {
      setupMessageListener();
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('forwards translate message to active tab', async () => {
      setupMessageListener();
      const sendResponse = vi.fn();
      const result = onMessageCallback!({ type: 'translate' }, {}, sendResponse);
      expect(result).toBe(true);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'translate' }),
      );
    });

    it('forwards cancel message to active tab', async () => {
      setupMessageListener();
      const sendResponse = vi.fn();
      onMessageCallback!({ type: 'cancel' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'cancel' }),
      );
    });

    it('forwards switchMode message to active tab', async () => {
      setupMessageListener();
      const sendResponse = vi.fn();
      onMessageCallback!({ type: 'switchMode' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'switchMode' }),
      );
    });

    it('toggles auto-translate for current domain', async () => {
      mockStorageSyncGet.mockResolvedValue({ autoTranslateSites: {} });
      setupMessageListener();
      const sendResponse = vi.fn();
      onMessageCallback!({ type: 'toggleAutoTranslate' }, {}, sendResponse);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockStorageSyncSet).toHaveBeenCalledWith({
        autoTranslateSites: { 'example.com': true },
      });
    });

    it('uses sender.tab.id instead of active tab for content script messages', async () => {
      setupMessageListener();
      const sendResponse = vi.fn();

      // Start translate from tab 42 (via sender.tab.id)
      onMessageCallback!({ type: 'translate' }, { tab: { id: 42 } }, sendResponse);
      await new Promise((r) => setTimeout(r, 10));
      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: 'translate' }),
      );
    });

    it('tracks translateComplete state using sender tab, not active tab', async () => {
      setupMessageListener();
      const sr1 = vi.fn();
      const sr2 = vi.fn();
      const sr3 = vi.fn();

      // Tab 42 starts translating
      onMessageCallback!({ type: 'translate' }, { tab: { id: 42 } }, sr1);
      await new Promise((r) => setTimeout(r, 10));

      // Tab 42 completes (sender.tab.id = 42)
      onMessageCallback!({ type: 'translateComplete' }, { tab: { id: 42 } }, sr2);
      await new Promise((r) => setTimeout(r, 10));

      // Query state for tab 42 — should be 'done', not 'loading'
      onMessageCallback!({ type: 'getTranslateState', tabId: 42 }, {}, sr3);
      await new Promise((r) => setTimeout(r, 10));
      expect(sr3).toHaveBeenCalledWith(
        expect.objectContaining({ translating: true, loading: false }),
      );
    });

    it('does not mix up tab states when multiple tabs translate', async () => {
      setupMessageListener();
      const sr1 = vi.fn();
      const sr2 = vi.fn();
      const sr3 = vi.fn();
      const sr4 = vi.fn();

      // Tab 1 starts translating
      onMessageCallback!({ type: 'translate' }, { tab: { id: 1 } }, sr1);
      await new Promise((r) => setTimeout(r, 10));

      // Tab 42 starts translating
      onMessageCallback!({ type: 'translate' }, { tab: { id: 42 } }, sr2);
      await new Promise((r) => setTimeout(r, 10));

      // Tab 42 completes, but tab 1 is still loading
      onMessageCallback!({ type: 'translateComplete' }, { tab: { id: 42 } }, sr3);
      await new Promise((r) => setTimeout(r, 10));

      // Check tab 1 state — should still be loading
      onMessageCallback!({ type: 'getTranslateState', tabId: 1 }, {}, sr4);
      await new Promise((r) => setTimeout(r, 10));
      expect(sr4).toHaveBeenCalledWith(
        expect.objectContaining({ translating: true, loading: true }),
      );
    });
  });

  describe('tab updated listener', () => {
    it('registers onUpdated listener', () => {
      setupTabListener();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });

    it('auto-translates when domain is in auto-translate list', async () => {
      mockStorageSyncGet.mockResolvedValue({
        autoTranslateSites: { 'example.com': true },
      });
      setupTabListener();
      await onUpdatedCallback!(1, { status: 'complete' }, { url: 'https://example.com/page' });
      expect(mockTabsSendMessage).toHaveBeenCalledWith(1, { type: 'translate' });
    });

    it('does not translate when domain is not in auto-translate list', async () => {
      mockStorageSyncGet.mockResolvedValue({ autoTranslateSites: {} });
      setupTabListener();
      await onUpdatedCallback!(1, { status: 'complete' }, { url: 'https://other.com/page' });
      expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    it('ignores non-complete status changes', async () => {
      setupTabListener();
      await onUpdatedCallback!(1, { status: 'loading' }, { url: 'https://example.com' });
      expect(mockStorageSyncGet).not.toHaveBeenCalled();
    });

    it('ignores tabs without URL', async () => {
      setupTabListener();
      await onUpdatedCallback!(1, { status: 'complete' }, {});
      expect(mockStorageSyncGet).not.toHaveBeenCalled();
    });
  });
});

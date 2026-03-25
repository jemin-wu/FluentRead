import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal popup DOM fixture (only elements that main.ts queries)
function setupPopupDOM() {
  document.body.innerHTML = `
    <span id="target-lang-text">简体中文</span>
    <select id="target-lang"><option value="zh-CN" selected>简体中文</option></select>
    <button id="mode-toggle" title="mode"></button>
    <button id="translate-btn">翻译 (⌥A)</button>
    <input type="checkbox" id="toggle-auto" />
    <input type="checkbox" id="toggle-selection" />
  `;
}

// Mock chrome APIs
const mockSendMessage = vi.fn().mockResolvedValue({});
const mockStorageGet = vi.fn().mockImplementation((_keys: any, cb?: any) => {
  if (cb) cb({});
  return Promise.resolve({});
});
const mockStorageSet = vi.fn().mockResolvedValue(undefined);

(globalThis as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: { get: mockStorageGet, set: mockStorageSet },
  },
};

describe('popup loading timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupPopupDOM();
    mockSendMessage.mockReset().mockResolvedValue({});
    mockStorageGet.mockReset().mockImplementation((_keys: any, cb?: any) => {
      if (cb) cb({});
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('recovers from loading state after 30s timeout', async () => {
    // Import triggers module evaluation; DOMContentLoaded listener is registered
    // We need to fire the event manually
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const btn = document.getElementById('translate-btn')!;

    // Click translate → goes to loading
    btn.click();
    expect(btn.textContent).toBe('翻译中...');
    expect(btn.style.pointerEvents).toBe('none');

    // Advance 30s → should recover to idle
    await vi.advanceTimersByTimeAsync(30_000);

    expect(btn.textContent).toBe('翻译 (⌥A)');
    expect(btn.style.pointerEvents).toBe('');
  });

  it('clears timeout when transitioning to done before 30s', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const btn = document.getElementById('translate-btn')!;

    // Click translate → loading
    btn.click();
    expect(btn.textContent).toBe('翻译中...');

    // Simulate translateComplete arriving after 5s
    await vi.advanceTimersByTimeAsync(5_000);
    const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0];
    listener({ type: 'translateComplete' });
    expect(btn.textContent).toBe('显示原文');

    // Advance past 30s — should NOT revert to idle
    await vi.advanceTimersByTimeAsync(30_000);
    expect(btn.textContent).toBe('显示原文');
  });
});

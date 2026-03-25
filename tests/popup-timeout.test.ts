import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal popup DOM fixture (only elements that main.ts queries)
function setupPopupDOM() {
  document.body.innerHTML = `
    <div class="lang-pill">
      <span id="target-lang-text">简体中文</span>
      <select id="target-lang">
        <option value="zh-CN" selected>简体中文</option>
        <option value="ja">日本語</option>
      </select>
    </div>
    <button id="mode-toggle" title="mode"></button>
    <button id="translate-btn">翻译</button>
    <input type="checkbox" id="toggle-auto" />
    <input type="checkbox" id="toggle-selection" />
  `;
}

// Track DOMContentLoaded listeners so we can remove them between tests
const domContentLoadedListeners: EventListener[] = [];
const origAddEventListener = document.addEventListener.bind(document);
document.addEventListener = ((type: string, listener: any, ...args: any[]) => {
  if (type === 'DOMContentLoaded') {
    domContentLoadedListeners.push(listener);
  }
  return origAddEventListener(type, listener, ...args);
}) as typeof document.addEventListener;

function cleanupDOMContentLoadedListeners() {
  for (const listener of domContentLoadedListeners) {
    document.removeEventListener('DOMContentLoaded', listener);
  }
  domContentLoadedListeners.length = 0;
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
    vi.resetModules();
    vi.useFakeTimers();
    setupPopupDOM();
    mockSendMessage.mockReset().mockResolvedValue({});
    mockStorageGet.mockReset().mockImplementation((_keys: any, cb?: any) => {
      if (cb) cb({});
      return Promise.resolve({});
    });
    (chrome.runtime.onMessage.addListener as any).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupDOMContentLoadedListeners();
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

    expect(btn.textContent).toBe('翻译');
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

describe('mode button lock during translation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setupPopupDOM();
    mockSendMessage.mockReset().mockResolvedValue({});
    mockStorageGet.mockReset().mockImplementation((_keys: any, cb?: any) => {
      if (cb) cb({});
      return Promise.resolve({});
    });
    (chrome.runtime.onMessage.addListener as any).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupDOMContentLoadedListeners();
    document.body.innerHTML = '';
  });

  it('disables mode button when entering loading state', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;

    // Click translate → loading
    translateBtn.click();

    expect(modeBtn.style.pointerEvents).toBe('none');
    expect(modeBtn.classList.contains('disabled')).toBe(true);
  });

  it('re-enables mode button when translation completes (done)', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;

    // Click translate → loading
    translateBtn.click();
    expect(modeBtn.style.pointerEvents).toBe('none');

    // Simulate translateComplete
    const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0];
    listener({ type: 'translateComplete' });

    expect(modeBtn.style.pointerEvents).toBe('');
    expect(modeBtn.classList.contains('disabled')).toBe(false);
  });

  it('re-enables mode button on timeout recovery (idle)', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;

    // Click translate → loading
    translateBtn.click();
    expect(modeBtn.style.pointerEvents).toBe('none');

    // Advance 30s → timeout recovery to idle
    await vi.advanceTimersByTimeAsync(30_000);

    expect(modeBtn.style.pointerEvents).toBe('');
    expect(modeBtn.classList.contains('disabled')).toBe(false);
  });

  it('blocks mode toggle click via JS guard during loading', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;

    // Click translate → loading
    translateBtn.click();

    // Try to click mode toggle — should be blocked by JS guard
    modeBtn.click();

    // switchMode should NOT have been sent (only translate was sent)
    const switchModeCalls = mockSendMessage.mock.calls.filter(
      (call: any[]) => call[0]?.type === 'switchMode',
    );
    expect(switchModeCalls).toHaveLength(0);
  });

  it('allows mode toggle click when not loading', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;

    // Translate → loading → done
    translateBtn.click();
    const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0];
    listener({ type: 'translateComplete' });

    // Now click mode toggle — should work
    modeBtn.click();

    const switchModeCalls = mockSendMessage.mock.calls.filter(
      (call: any[]) => call[0]?.type === 'switchMode',
    );
    expect(switchModeCalls).toHaveLength(1);
  });

  it('mode button starts disabled when popup opens mid-translation', async () => {
    // Mock getTranslateState to return loading state
    mockSendMessage.mockReset().mockImplementation((msg: any) => {
      if (msg.type === 'getTranslateState') {
        return Promise.resolve({ translating: true, loading: true });
      }
      return Promise.resolve({});
    });

    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Allow loadTranslateState to resolve
    await vi.advanceTimersByTimeAsync(0);

    const modeBtn = document.getElementById('mode-toggle')!;
    expect(modeBtn.style.pointerEvents).toBe('none');
    expect(modeBtn.classList.contains('disabled')).toBe(true);
  });

  it('mode button starts enabled when popup opens after translation done', async () => {
    // Mock getTranslateState to return done state
    mockSendMessage.mockReset().mockImplementation((msg: any) => {
      if (msg.type === 'getTranslateState') {
        return Promise.resolve({ translating: true, loading: false });
      }
      return Promise.resolve({});
    });

    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Allow loadTranslateState to resolve
    await vi.advanceTimersByTimeAsync(0);

    const modeBtn = document.getElementById('mode-toggle')!;
    expect(modeBtn.style.pointerEvents).toBe('');
    expect(modeBtn.classList.contains('disabled')).toBe(false);
  });

  it('mode button re-locks when language change triggers re-translation', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Flush async loadTranslateState
    await vi.advanceTimersByTimeAsync(0);

    const translateBtn = document.getElementById('translate-btn')!;
    const modeBtn = document.getElementById('mode-toggle')!;
    const langSelect = document.getElementById('target-lang') as HTMLSelectElement;

    // Translate → loading → done
    translateBtn.click();
    const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0];
    listener({ type: 'translateComplete' });

    // Mode button should be enabled in done state
    expect(modeBtn.style.pointerEvents).toBe('');

    // Change language while in done state → triggers re-translation
    langSelect.value = 'ja';
    langSelect.dispatchEvent(new Event('change'));

    // Mode button should be locked again (loading)
    expect(modeBtn.style.pointerEvents).toBe('none');
    expect(modeBtn.classList.contains('disabled')).toBe(true);
  });

  it('disables language selector during loading', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const langSelect = document.getElementById('target-lang')!;
    const langPill = langSelect.parentElement!;

    // Before translate — lang pill should be enabled
    expect(langPill.style.pointerEvents).toBe('');

    // Click translate → loading
    translateBtn.click();

    // Lang pill should be disabled
    expect(langPill.style.pointerEvents).toBe('none');
    expect(langPill.classList.contains('disabled')).toBe(true);
  });

  it('re-enables language selector when translation completes', async () => {
    await import('../src/entrypoints/popup/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const translateBtn = document.getElementById('translate-btn')!;
    const langSelect = document.getElementById('target-lang')!;
    const langPill = langSelect.parentElement!;

    // Translate → loading → done
    translateBtn.click();
    expect(langPill.style.pointerEvents).toBe('none');

    const listener = (chrome.runtime.onMessage.addListener as any).mock.calls[0][0];
    listener({ type: 'translateComplete' });

    expect(langPill.style.pointerEvents).toBe('');
    expect(langPill.classList.contains('disabled')).toBe(false);
  });
});

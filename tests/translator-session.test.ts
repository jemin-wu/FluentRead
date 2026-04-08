import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  translatePage,
  translateElements,
  isSessionActive,
  cancelTranslation,
} from '../src/entrypoints/content/translator';

// Mock dependencies
vi.mock('../src/services/translate', () => ({
  translateText: vi.fn().mockResolvedValue('translated'),
}));

vi.mock('../src/utils/storage', () => ({
  getFromCache: vi.fn().mockReturnValue(null),
  saveToCache: vi.fn(),
}));

vi.mock('../src/entrypoints/content/renderer', () => ({
  renderTranslation: vi.fn(),
  renderLoading: vi.fn(),
  renderError: vi.fn(),
  removeTranslation: vi.fn(),
}));

// IntersectionObserver polyfill for jsdom
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Immediately report all as visible
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// innerText polyfill for jsdom
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
    configurable: true,
  });
});

describe('translator session management', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    cancelTranslation();
  });

  describe('isSessionActive', () => {
    it('returns false when no translation has been started', () => {
      expect(isSessionActive()).toBe(false);
    });

    it('returns true after translatePage is called', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      const promise = translatePage('zh-CN');
      // Session should be active during translation
      expect(isSessionActive()).toBe(true);
      await promise;
    });

    it('returns true after translatePage completes (session stays active)', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      await translatePage('zh-CN');
      expect(isSessionActive()).toBe(true);
    });

    it('returns false after cancelTranslation', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      await translatePage('zh-CN');
      cancelTranslation();
      expect(isSessionActive()).toBe(false);
    });
  });

  describe('translateElements', () => {
    it('does nothing when session is null', async () => {
      const el = document.createElement('div');
      el.textContent = 'This should not be translated without a session';
      document.body.appendChild(el);
      // No translatePage called, session is null
      await translateElements([el], 'zh-CN');
      // Should not throw
    });

    it('does nothing when session is cancelled', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      await translatePage('zh-CN');
      cancelTranslation();
      const el = document.createElement('div');
      el.textContent = 'This should not be translated after cancel';
      document.body.appendChild(el);
      await translateElements([el], 'zh-CN');
      // Should not throw
    });

    it('translates elements when session is active', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      await translatePage('zh-CN');

      const el = document.createElement('div');
      el.textContent = 'New element to translate that is long enough';
      document.body.appendChild(el);
      await translateElements([el], 'zh-CN');
      // Should complete without error (actual translation is mocked)
    });
  });

  describe('translatePage output verification', () => {
    it('calls renderTranslation for each translatable element', async () => {
      const { renderTranslation } = await import('../src/entrypoints/content/renderer');
      (renderTranslation as ReturnType<typeof vi.fn>).mockClear();

      document.body.innerHTML = `
        <p>First paragraph with enough text for translation.</p>
        <p>Second paragraph with enough text for translation.</p>
      `;
      await translatePage('zh-CN');

      expect(renderTranslation).toHaveBeenCalledTimes(2);
      expect(renderTranslation).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        'translated',
        'zh-CN',
        null,
      );
    });

    it('calls renderLoading before translateText resolves', async () => {
      const { renderLoading } = await import('../src/entrypoints/content/renderer');
      (renderLoading as ReturnType<typeof vi.fn>).mockClear();

      document.body.innerHTML = '<p>A paragraph with enough text for translation.</p>';
      await translatePage('zh-CN');

      expect(renderLoading).toHaveBeenCalledTimes(1);
    });
  });

  describe('translatePage with adapter', () => {
    it('uses adapter selectors when provided', async () => {
      document.body.innerHTML = `
        <div data-testid="tweetText">This is a tweet with enough text to translate.</div>
        <p>This paragraph should be ignored when using adapter.</p>
      `;
      const adapter = {
        selectors: ['[data-testid="tweetText"]'],
      };
      await translatePage('zh-CN', adapter);
      expect(isSessionActive()).toBe(true);
    });

    it('creates new session on re-translate, cancelling old one', async () => {
      document.body.innerHTML = '<p>This is a long enough English sentence for translation.</p>';
      await translatePage('zh-CN');
      expect(isSessionActive()).toBe(true);
      // Re-translate should cancel old session and create new one
      await translatePage('zh-CN');
      expect(isSessionActive()).toBe(true);
    });
  });
});

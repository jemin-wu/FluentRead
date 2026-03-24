import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/translate', () => ({
  translateText: vi.fn(),
}));

import { initSelection, destroySelection } from '../src/entrypoints/content/selection';
import { translateText } from '../src/services/translate';

const mockTranslateText = translateText as ReturnType<typeof vi.fn>;

describe('selection (划词翻译)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p>Hello world for testing</p>';
    vi.useFakeTimers();
    mockTranslateText.mockReset();
  });

  afterEach(() => {
    destroySelection();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('initSelection / destroySelection', () => {
    it('creates and removes tooltip on init/destroy cycle', () => {
      initSelection('zh-CN');
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();

      destroySelection();
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
    });

    it('does not fail when calling destroySelection without init', () => {
      expect(() => destroySelection()).not.toThrow();
    });

    it('re-initializes cleanly when called twice', () => {
      initSelection('zh-CN');
      initSelection('en');
      destroySelection();
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
    });
  });

  describe('tooltip display', () => {
    it('shows tooltip with translation on text selection', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.fluentread-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toBe('你好世界');
      expect(mockTranslateText).toHaveBeenCalledWith('Hello world', 'zh-CN');
    });

    it('shows loading state while translating', async () => {
      let resolveTranslation: (v: string) => void;
      mockTranslateText.mockImplementation(
        () =>
          new Promise((r) => {
            resolveTranslation = r;
          }),
      );
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.fluentread-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toBe('...');

      resolveTranslation!('你好');
      await vi.advanceTimersByTimeAsync(0);
      expect(tooltip!.textContent).toBe('你好');
    });

    it('shows error message on translation failure', async () => {
      mockTranslateText.mockRejectedValue(new Error('Network error'));
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.fluentread-tooltip');
      expect(tooltip!.textContent).toBe('翻译失败');
    });

    it('ignores short selections (< 2 chars)', async () => {
      initSelection('zh-CN');

      mockSelection('H', { left: 10, top: 10, bottom: 30, right: 20 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
      expect(mockTranslateText).not.toHaveBeenCalled();
    });

    it('ignores empty selection', async () => {
      initSelection('zh-CN');

      mockSelection('', { left: 0, top: 0, bottom: 0, right: 0 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      expect(mockTranslateText).not.toHaveBeenCalled();
    });
  });

  describe('tooltip hiding', () => {
    it('hides tooltip on outside click', async () => {
      mockTranslateText.mockResolvedValue('你好');
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip.style.display).toBe('block');

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(tooltip.style.display).toBe('none');
    });

    it('hides tooltip on Escape key', async () => {
      mockTranslateText.mockResolvedValue('你好');
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(300);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip.style.display).toBe('block');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(tooltip.style.display).toBe('none');
    });
  });

  describe('debounce', () => {
    it('debounces rapid mouseup events (300ms)', async () => {
      mockTranslateText.mockResolvedValue('你好');
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(100);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(100);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      await vi.advanceTimersByTimeAsync(300);

      expect(mockTranslateText).toHaveBeenCalledTimes(1);
    });
  });
});

function mockSelection(
  text: string,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  const mockRange = {
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    }),
  };

  window.getSelection = vi.fn(() => ({
    toString: () => text,
    getRangeAt: () => mockRange,
    rangeCount: text ? 1 : 0,
  })) as any;
}

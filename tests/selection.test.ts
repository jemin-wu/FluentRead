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
    it('creates and removes elements on init/destroy cycle', () => {
      initSelection('zh-CN');
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
      expect(document.querySelector('.fluentread-dot-trigger')).toBeNull();

      destroySelection();
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
      expect(document.querySelector('.fluentread-dot-trigger')).toBeNull();
    });

    it('does not fail when calling destroySelection without init', () => {
      expect(() => destroySelection()).not.toThrow();
    });

    it('re-initializes cleanly when called twice', () => {
      initSelection('zh-CN');
      initSelection('en');
      destroySelection();
      expect(document.querySelector('.fluentread-tooltip')).toBeNull();
      expect(document.querySelector('.fluentread-dot-trigger')).toBeNull();
    });
  });

  describe('dot trigger', () => {
    it('shows dot on text selection', async () => {
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      expect(dot).not.toBeNull();
      expect(dot.style.display).toBe('block');
    });

    it('does not show dot for short selections', async () => {
      initSelection('zh-CN');

      mockSelection('H', { left: 10, top: 10, bottom: 30, right: 20 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger');
      expect(dot).toBeNull();
    });

    it('hides dot on outside click', async () => {
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      expect(dot.style.display).toBe('block');

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(dot.style.display).toBe('none');
    });

    it('hides dot on Escape key', async () => {
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      expect(dot.style.display).toBe('block');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(dot.style.display).toBe('none');
    });
  });

  describe('tooltip via dot click', () => {
    it('shows tooltip after clicking dot', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip!.querySelector('.fluentread-tooltip-word')!.textContent).toBe('Hello world');
      expect(tooltip!.querySelector('.fluentread-tooltip-result')!.textContent).toBe('你好世界');
      expect(mockTranslateText).toHaveBeenCalledWith('Hello world', 'zh-CN');
    });

    it('shows error on translation failure', async () => {
      mockTranslateText.mockRejectedValue(new Error('fail'));
      initSelection('zh-CN');

      mockSelection('Hello', { left: 10, top: 10, bottom: 30, right: 100 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip');
      expect(tooltip!.querySelector('.fluentread-tooltip-result')!.textContent).toBe('翻译失败');
    });
  });

  describe('tooltip drag / long-press', () => {
    it('does not dismiss tooltip when mousedown inside card and mouseup outside', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      expect(tooltip.style.display).toBe('block');

      // Simulate mousedown inside tooltip (long press start)
      tooltip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      // Then click fires on document body (mouseup was outside tooltip)
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Tooltip should still be visible — not dismissed
      expect(tooltip.style.display).toBe('block');
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

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

  describe('rangeCount guard', () => {
    it('does not crash when selection has text but rangeCount is 0', async () => {
      initSelection('zh-CN');

      // Mock selection with text but rangeCount = 0
      window.getSelection = vi.fn(() => ({
        toString: () => 'Hello world',
        getRangeAt: () => {
          throw new Error('IndexSizeError');
        },
        rangeCount: 0,
      })) as any;

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      // Should not crash, dot should not appear
      const dot = document.querySelector('.fluentread-dot-trigger');
      expect(dot).toBeNull();
    });
  });

  describe('tooltip viewport clamping', () => {
    it('clamps tooltip to left edge when positioned off-screen left', async () => {
      mockTranslateText.mockResolvedValue('翻译');
      initSelection('zh-CN');

      // Selection near left edge — tooltip x would be negative
      mockSelection('Hello world', { left: -50, top: 50, bottom: 70, right: 10 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      // Left should be clamped to at least padding (8px)
      expect(parseInt(tooltip.style.left)).toBeGreaterThanOrEqual(0);
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

  describe('tooltip position refresh after async translate', () => {
    // jsdom's getBoundingClientRect returns all zeros, which triggers positionTooltip's
    // viewport clamping (0 < 8 → left = 8px). Mock it to reflect inline style values
    // so clamping doesn't interfere with position assertions.
    const origGetBCR = HTMLElement.prototype.getBoundingClientRect;
    beforeEach(() => {
      HTMLElement.prototype.getBoundingClientRect = function () {
        const left = parseInt(this.style.left) || 0;
        const top = parseInt(this.style.top) || 0;
        return {
          left,
          top,
          right: left + 200,
          bottom: top + 100,
          width: 200,
          height: 100,
          x: left,
          y: top,
          toJSON() {},
        } as DOMRect;
      };
    });
    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = origGetBCR;
    });

    it('uses fresh coordinates when selection is still valid after translate', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      // Initial selection at (100, 70)
      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;

      // Change selection mock to fresh coordinates BEFORE the click resolves
      mockSelection('Hello world', { left: 300, top: 400, bottom: 420, right: 500 });

      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      // Should use the fresh coordinates (300, 420+10=430), not original (100, 80)
      expect(tooltip.style.left).toBe('300px');
      expect(tooltip.style.top).toBe('430px');
    });

    it('falls back to original coordinates when selection is cleared during translate', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      // Initial selection at (100, 70)
      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;

      // Clear selection (rangeCount=0) before translate resolves
      window.getSelection = vi.fn(() => ({
        toString: () => '',
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
          }),
        }),
        rangeCount: 0,
      })) as any;

      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      // Should fall back to original coordinates (100, 70+10=80)
      expect(tooltip.style.left).toBe('100px');
      expect(tooltip.style.top).toBe('80px');
    });

    it('falls back to original coordinates when selection has zero-size rect', async () => {
      mockTranslateText.mockResolvedValue('你好世界');
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 150, top: 60, bottom: 80, right: 250 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;

      // Selection still has rangeCount=1 but rect is zero (collapsed selection)
      window.getSelection = vi.fn(() => ({
        toString: () => 'Hello world',
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
          }),
        }),
        rangeCount: 1,
      })) as any;

      dot.click();
      await vi.advanceTimersByTimeAsync(0);

      const tooltip = document.querySelector('.fluentread-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      // Should fall back to original coordinates (150, 80+10=90)
      expect(tooltip.style.left).toBe('150px');
      expect(tooltip.style.top).toBe('90px');
    });
  });

  describe('dot residual on short re-selection', () => {
    it('hides dot when re-selecting text shorter than 2 chars', async () => {
      initSelection('zh-CN');

      // First: select long text → dot shows
      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      expect(dot).not.toBeNull();
      expect(dot.style.display).toBe('block');

      // Second: select single char → dot should be hidden
      mockSelection('H', { left: 10, top: 10, bottom: 30, right: 20 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      expect(dot.style.display).toBe('none');
    });

    it('hides dot when selection is empty', async () => {
      initSelection('zh-CN');

      mockSelection('Hello world', { left: 100, top: 50, bottom: 70, right: 200 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const dot = document.querySelector('.fluentread-dot-trigger') as HTMLElement;
      expect(dot.style.display).toBe('block');

      mockSelection('', { left: 0, top: 0, bottom: 0, right: 0 });
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      expect(dot.style.display).toBe('none');
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

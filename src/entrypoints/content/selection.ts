/**
 * 划词翻译 — 呼吸光点 + 毛玻璃可拖拽翻译卡片
 */

import { translateText } from '@/services/translate';
import { createLoadingDots } from './renderer';

class SelectionTranslator {
  private dot: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private targetLang = 'zh-CN';
  private active = false;

  /* Drag state */
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private mousedownInsideTooltip = false;

  /* AbortController for dot click — replaces cloneNode anti-pattern */
  private dotClickAC: AbortController | null = null;

  /* Bound event handlers (stable references for add/removeEventListener) */
  private readonly handleMouseUp = () => this.onMouseUp();
  private readonly handleMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private readonly handleClick = (e: MouseEvent) => this.onDocumentClick(e);
  private readonly handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly handleDragMove = (e: MouseEvent) => this.onDragMove(e);
  private readonly handleDragEnd = () => this.onDragEnd();
  private readonly handleDragStart = (e: MouseEvent) => this.onDragStart(e);

  /* ── Dot ── */

  private getDot(): HTMLDivElement {
    if (!this.dot) {
      this.dot = document.createElement('div');
      this.dot.className = 'fluentread-dot-trigger';
      document.body.appendChild(this.dot);
    }
    return this.dot;
  }

  private showDot(x: number, y: number) {
    const el = this.getDot();
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  }

  private hideDot() {
    if (this.dot) this.dot.style.display = 'none';
  }

  /* ── Tooltip card ── */

  private getTooltip(): HTMLDivElement {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'fluentread-tooltip';
      document.body.appendChild(this.tooltip);
    }
    return this.tooltip;
  }

  private buildCard(word: string): { el: HTMLDivElement; body: HTMLDivElement } {
    const el = this.getTooltip();
    el.innerHTML = '';
    el.classList.remove('fr-dragging');

    const handle = document.createElement('div');
    handle.className = 'fluentread-tooltip-handle';
    handle.addEventListener('mousedown', this.handleDragStart);
    el.appendChild(handle);

    const body = document.createElement('div');
    body.className = 'fluentread-tooltip-body';

    const wordEl = document.createElement('div');
    wordEl.className = 'fluentread-tooltip-word';
    wordEl.textContent = word;
    body.appendChild(wordEl);

    el.appendChild(body);
    return { el, body };
  }

  private showLoading(word: string, x: number, y: number) {
    const { el, body } = this.buildCard(word);

    const loading = document.createElement('div');
    loading.className = 'fluentread-tooltip-loading';
    createLoadingDots(loading);
    body.appendChild(loading);

    this.positionTooltip(el, x, y);
  }

  private showResult(word: string, translation: string, x: number, y: number) {
    const { el, body } = this.buildCard(word);

    const result = document.createElement('div');
    result.className = 'fluentread-tooltip-result';
    result.textContent = translation;
    body.appendChild(result);

    const actions = document.createElement('div');
    actions.className = 'fluentread-tooltip-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'fluentread-tooltip-btn';
    copyBtn.title = '复制翻译';
    copyBtn.innerHTML = copyIcon();
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(translation);
        copyBtn.innerHTML = checkIcon();
        setTimeout(() => {
          copyBtn.innerHTML = copyIcon();
        }, 1500);
      } catch {
        // Clipboard write failed
      }
    });
    actions.appendChild(copyBtn);

    el.appendChild(actions);
    this.positionTooltip(el, x, y);
  }

  private positionTooltip(el: HTMLElement, x: number, y: number) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = 'block';

    // Clamp to viewport
    const rect = el.getBoundingClientRect();
    const pad = 8;
    if (rect.right > window.innerWidth - pad) {
      el.style.left = `${window.innerWidth - rect.width - pad}px`;
    }
    if (rect.left < pad) {
      el.style.left = `${pad}px`;
    }
    if (rect.bottom > window.innerHeight - pad) {
      el.style.top = `${y - rect.height - 20}px`;
    }

    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  }

  private hideTooltip() {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  /* ── Drag ── */

  private onDragStart(e: MouseEvent) {
    if (!this.tooltip) return;
    e.preventDefault();
    this.dragging = true;
    this.tooltip.classList.add('fr-dragging');
    document.body.style.cursor = 'grabbing';
    this.dragOffsetX = e.clientX - this.tooltip.offsetLeft;
    this.dragOffsetY = e.clientY - this.tooltip.offsetTop;
    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
  }

  private onDragMove(e: MouseEvent) {
    if (!this.dragging || !this.tooltip) return;
    this.tooltip.style.left = `${e.clientX - this.dragOffsetX}px`;
    this.tooltip.style.top = `${e.clientY - this.dragOffsetY}px`;
  }

  private onDragEnd() {
    if (this.tooltip) this.tooltip.classList.remove('fr-dragging');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
    requestAnimationFrame(() => {
      this.dragging = false;
    });
  }

  /* ── Events ── */

  private onMouseUp() {
    if (this.dragging) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 2) {
        this.hideDot();
        return;
      }

      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      this.showDot(rect.right + 4, rect.bottom - 2);

      // Abort previous dot click listener, attach a fresh one
      this.dotClickAC?.abort();
      this.dotClickAC = new AbortController();

      this.getDot().addEventListener(
        'click',
        async () => {
          this.dotClickAC?.abort();
          this.hideDot();

          const x = rect.left;
          const y = rect.bottom + 10;

          this.showLoading(text, x, y);

          try {
            const translation = await translateText(text, this.targetLang);
            this.showResult(text, translation, x, y);
          } catch {
            this.showResult(text, '翻译失败', x, y);
          }
        },
        { signal: this.dotClickAC.signal },
      );
    }, 200);
  }

  private onMouseDown(e: MouseEvent) {
    const target = e.target as Node;
    this.mousedownInsideTooltip = !!(this.tooltip && this.tooltip.contains(target));
  }

  private onDocumentClick(e: MouseEvent) {
    if (this.dragging) return;

    if (this.mousedownInsideTooltip) {
      this.mousedownInsideTooltip = false;
      return;
    }

    const target = e.target as Node;
    if (this.dot && !this.dot.contains(target)) this.hideDot();
    if (
      this.tooltip &&
      !this.tooltip.contains(target) &&
      (!this.dot || !this.dot.contains(target))
    ) {
      this.hideTooltip();
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.hideDot();
      this.hideTooltip();
    }
  }

  /* ── Public API ── */

  init(lang: string) {
    if (this.active) this.destroy();
    this.targetLang = lang || 'zh-CN';
    this.active = true;
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  destroy() {
    this.active = false;
    this.dragging = false;
    this.mousedownInsideTooltip = false;
    this.dotClickAC?.abort();
    this.dotClickAC = null;
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.dot) {
      this.dot.remove();
      this.dot = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }
}

/* ── Icons ── */

function copyIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
}

function checkIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
}

/* ── Singleton + backward-compatible exports ── */

const instance = new SelectionTranslator();

export function initSelection(lang: string) {
  instance.init(lang);
}

export function destroySelection() {
  instance.destroy();
}

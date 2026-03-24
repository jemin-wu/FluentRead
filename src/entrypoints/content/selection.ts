/**
 * 划词翻译 — mouseup 获取选中文本，弹出 tooltip 显示翻译
 */

import { translateText } from '@/services/translate';

let tooltip: HTMLDivElement | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let targetLang = 'zh-CN';
let isActive = false;

function getTooltip(): HTMLDivElement {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'fluentread-tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function showTooltip(text: string, x: number, y: number) {
  const el = getTooltip();
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetHeight; // force reflow
  el.style.animation = '';
}

function hideTooltip() {
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function onMouseUp(_e: MouseEvent) {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) return;

    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 8;

    showTooltip('...', x, y);

    try {
      const translation = await translateText(text, targetLang);
      showTooltip(translation, x, y);
    } catch {
      showTooltip('翻译失败', x, y);
    }
  }, 300);
}

function onDocumentClick(e: MouseEvent) {
  if (tooltip && !tooltip.contains(e.target as Node)) {
    hideTooltip();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideTooltip();
  }
}

export function initSelection(lang: string) {
  if (isActive) destroySelection();
  targetLang = lang || 'zh-CN';
  isActive = true;
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
}

export function destroySelection() {
  isActive = false;
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeyDown);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

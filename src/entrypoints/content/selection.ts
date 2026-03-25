/**
 * 划词翻译 — 呼吸光点 + 毛玻璃可拖拽翻译卡片
 */

import { translateText } from '@/services/translate';
import { createLoadingDots } from './renderer';

let dot: HTMLDivElement | null = null;
let tooltip: HTMLDivElement | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let targetLang = 'zh-CN';
let isActive = false;

/* ── Drag state ── */
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
/** Tracks whether mousedown started inside the tooltip to prevent false dismiss */
const mousedownOrigin = { insideTooltip: false };

/* ── Dot ── */

function getDot(): HTMLDivElement {
  if (!dot) {
    dot = document.createElement('div');
    dot.className = 'fluentread-dot-trigger';
    document.body.appendChild(dot);
  }
  return dot;
}

function showDot(x: number, y: number) {
  const el = getDot();
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = '';
}

function hideDot() {
  if (dot) dot.style.display = 'none';
}

/* ── Tooltip card ── */

function getTooltip(): HTMLDivElement {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'fluentread-tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function buildCard(word: string): { el: HTMLDivElement; body: HTMLDivElement } {
  const el = getTooltip();
  el.innerHTML = '';
  el.classList.remove('fr-dragging');

  // Drag handle
  const handle = document.createElement('div');
  handle.className = 'fluentread-tooltip-handle';
  handle.addEventListener('mousedown', onDragStart);
  el.appendChild(handle);

  // Body
  const body = document.createElement('div');
  body.className = 'fluentread-tooltip-body';

  const wordEl = document.createElement('div');
  wordEl.className = 'fluentread-tooltip-word';
  wordEl.textContent = word;
  body.appendChild(wordEl);

  el.appendChild(body);
  return { el, body };
}

function showLoading(word: string, x: number, y: number) {
  const { el, body } = buildCard(word);

  const loading = document.createElement('div');
  loading.className = 'fluentread-tooltip-loading';
  createLoadingDots(loading);
  body.appendChild(loading);

  positionTooltip(el, x, y);
}

function showResult(word: string, translation: string, x: number, y: number) {
  const { el, body } = buildCard(word);

  const result = document.createElement('div');
  result.className = 'fluentread-tooltip-result';
  result.textContent = translation;
  body.appendChild(result);

  // Actions
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
      // Clipboard write failed (permission denied or focus lost)
    }
  });
  actions.appendChild(copyBtn);

  el.appendChild(actions);
  positionTooltip(el, x, y);
}

function positionTooltip(el: HTMLElement, x: number, y: number) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.display = 'block';
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = '';
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = 'none';
}

/* ── Drag ── */

function onDragStart(e: MouseEvent) {
  if (!tooltip) return;
  e.preventDefault();
  isDragging = true;
  tooltip.classList.add('fr-dragging');
  document.body.style.cursor = 'grabbing';
  dragOffsetX = e.clientX - tooltip.offsetLeft;
  dragOffsetY = e.clientY - tooltip.offsetTop;
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e: MouseEvent) {
  if (!isDragging || !tooltip) return;
  tooltip.style.left = `${e.clientX - dragOffsetX}px`;
  tooltip.style.top = `${e.clientY - dragOffsetY}px`;
}

function onDragEnd() {
  if (tooltip) tooltip.classList.remove('fr-dragging');
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  // 延迟重置，防止 mouseup→click 冒泡时误触 hideTooltip
  requestAnimationFrame(() => {
    isDragging = false;
  });
}

/* ── Events ── */

function onMouseUp(_e: MouseEvent) {
  if (isDragging) return;
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) return;

    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    showDot(rect.right + 4, rect.bottom - 2);

    const dotEl = getDot();
    const handler = async () => {
      dotEl.removeEventListener('click', handler);
      hideDot();

      const x = rect.left;
      const y = rect.bottom + 10;

      showLoading(text, x, y);

      try {
        const translation = await translateText(text, targetLang);
        showResult(text, translation, x, y);
      } catch {
        showResult(text, '翻译失败', x, y);
      }
    };

    const clone = dotEl.cloneNode(true) as HTMLDivElement;
    dotEl.replaceWith(clone);
    dot = clone;
    dot.addEventListener('click', handler);
  }, 200);
}

function onMouseDown(e: MouseEvent) {
  const target = e.target as Node;
  mousedownOrigin.insideTooltip = !!(tooltip && tooltip.contains(target));
}

function onDocumentClick(e: MouseEvent) {
  if (isDragging) return;

  // If mousedown started inside tooltip, don't dismiss on this click
  // (prevents card disappearing when user presses on card body and releases outside)
  if (mousedownOrigin.insideTooltip) {
    mousedownOrigin.insideTooltip = false;
    return;
  }

  const target = e.target as Node;
  if (dot && !dot.contains(target)) hideDot();
  if (tooltip && !tooltip.contains(target) && (!dot || !dot.contains(target))) {
    hideTooltip();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    hideDot();
    hideTooltip();
  }
}

/* ── Icons ── */

function copyIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
}

function checkIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
}

/* ── Public API ── */

export function initSelection(lang: string) {
  if (isActive) destroySelection();
  targetLang = lang || 'zh-CN';
  isActive = true;
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
}

export function destroySelection() {
  isActive = false;
  isDragging = false;
  mousedownOrigin.insideTooltip = false;
  document.removeEventListener('mousedown', onMouseDown);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (dot) {
    dot.remove();
    dot = null;
  }
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

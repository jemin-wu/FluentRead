/**
 * 翻译控制器 — DOM 遍历 + IntersectionObserver 可见区优先 + 并发控制
 */

import { translateText } from '@/services/translate';
import { getTranslatableElements } from '@/utils/dom-utils';
import type { SiteAdapter } from '@/utils/site-adapters';
import { getFromCache, saveToCache } from '@/utils/storage';
import { renderTranslation, renderLoading, renderError, removeTranslation } from './renderer';

const MAX_CONCURRENT = 3;
const REQUEST_INTERVAL_MS = 100;
const OBSERVER_TIMEOUT_MS = 2000;

interface TranslationSession {
  cancelled: boolean;
  activeRequests: number;
  queue: Array<() => void>;
  observer: IntersectionObserver | null;
  queuedElements: Set<HTMLElement>;
}

let session: TranslationSession | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** 完全占位保留的内联标签（内容不翻译） */
const PRESERVE_SELECTOR = 'code, sup, sub';

export interface Placeholder {
  tag: string;
  content: string;
}

/** 链接信息（文字参与翻译，href 保留） */
export interface LinkInfo {
  attrs: string;
}

export interface Extracted {
  text: string;
  placeholders: Placeholder[];
  links: LinkInfo[];
}

export function extractPlaceholders(el: HTMLElement): Extracted {
  const placeholders: Placeholder[] = [];
  const links: LinkInfo[] = [];

  // Fast path: skip cloneNode for plain-text elements
  if (!el.querySelector('a[href], code, sup, sub')) {
    return { text: el.innerText?.trim() || '', placeholders: [], links: [] };
  }

  const clone = el.cloneNode(true) as HTMLElement;

  // 1. code/sup/sub：完全占位，内容不翻译（先于链接处理，保留嵌套在 <a> 内的标签）
  const preserved = clone.querySelectorAll(PRESERVE_SELECTOR);
  preserved.forEach((c, i) => {
    // 保留 outerHTML，还原时直接使用（保持原始 class 和内部结构）
    placeholders.push({ tag: c.tagName.toLowerCase(), content: c.outerHTML });
    c.replaceWith(`__TAG_${i}__`);
  });

  // 2. 链接：用边界标记包裹文字，让文字参与翻译
  const linkEls = clone.querySelectorAll('a[href]');
  linkEls.forEach((a, i) => {
    const href = (a as HTMLAnchorElement).getAttribute('href') || '';
    const target = (a as HTMLAnchorElement).getAttribute('target');
    links.push({
      attrs: `href="${escapeAttr(href)}"${target ? ` target="${escapeAttr(target)}"` : ''}`,
    });
    a.replaceWith(`__LS${i}__${a.textContent || ''}__LE${i}__`);
  });

  const text = clone.innerText?.trim() || '';
  if (placeholders.length === 0 && links.length === 0) {
    return { text: el.innerText?.trim() || '', placeholders: [], links: [] };
  }

  return { text, placeholders, links };
}

export function restorePlaceholders(
  translation: string,
  placeholders: Placeholder[],
  links: LinkInfo[],
): string | null {
  if (placeholders.length === 0 && links.length === 0) return null;

  let html = escapeHtml(translation);

  // 还原 code/sup/sub（content 是原始 outerHTML，直接插入保留原始属性和结构）
  placeholders.forEach(({ content }, i) => {
    html = html.replace(new RegExp(`__TAG_${i}__`, 'g'), content);
  });

  // 还原链接边界标记 → <a> 标签（标记丢失则优雅降级为纯文本）
  links.forEach(({ attrs }, i) => {
    const re = new RegExp(`__LS${i}__(.*?)__LE${i}__`, 'g');
    html = html.replace(re, `<a ${attrs}>$1</a>`);
  });

  // 清理未匹配的残留标记
  html = html.replace(/__L[SE]\d+__/g, '');

  return html;
}

async function translateElement(s: TranslationSession, el: HTMLElement, targetLang: string) {
  if (s.cancelled) return;

  const { text, placeholders, links } = extractPlaceholders(el);
  if (!text) return;

  const cached = getFromCache(text, targetLang);
  if (cached) {
    const html = restorePlaceholders(cached, placeholders, links);
    renderTranslation(el, cached, targetLang, html);
    return;
  }

  renderLoading(el);

  try {
    const translation = await translateText(text, targetLang);
    if (s.cancelled) {
      removeTranslation(el); // 清理 renderLoading 留下的加载指示器
      return;
    }
    saveToCache(text, targetLang, translation);
    const html = restorePlaceholders(translation, placeholders, links);
    renderTranslation(el, translation, targetLang, html);
  } catch {
    if (s.cancelled) {
      removeTranslation(el);
      return;
    }
    renderError(el, () => translateElement(s, el, targetLang));
  }
}

function enqueue(s: TranslationSession, el: HTMLElement, targetLang: string): Promise<void> {
  if (s.queuedElements.has(el)) return Promise.resolve();
  s.queuedElements.add(el);
  return new Promise((resolve) => {
    const run = async () => {
      s.activeRequests++;
      await translateElement(s, el, targetLang);
      s.queuedElements.delete(el);
      await delay(REQUEST_INTERVAL_MS);
      s.activeRequests--;
      resolve();
      dequeue(s);
    };

    if (s.activeRequests < MAX_CONCURRENT) {
      run();
    } else {
      s.queue.push(run);
    }
  });
}

function dequeue(s: TranslationSession) {
  if (s.cancelled) return;
  if (s.queue.length > 0 && s.activeRequests < MAX_CONCURRENT) {
    const next = s.queue.shift()!;
    next();
  }
}

export async function translatePage(targetLang: string, adapter?: SiteAdapter | null) {
  if (session) {
    session.cancelled = true;
    session.queue = [];
    if (session.observer) {
      session.observer.disconnect();
    }
  }

  const s: TranslationSession = {
    cancelled: false,
    activeRequests: 0,
    queue: [],
    observer: null,
    queuedElements: new Set(),
  };
  session = s;

  const elements = getTranslatableElements(document, adapter);
  if (elements.length === 0) return;

  const visible: HTMLElement[] = [];
  const offscreen: HTMLElement[] = [];

  await new Promise<void>((resolve) => {
    let observed = 0;
    const fallbackTimeout = setTimeout(() => {
      if (s.observer) {
        s.observer.disconnect();
        s.observer = null;
      }
      resolve();
    }, OBSERVER_TIMEOUT_MS);

    s.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.push(entry.target as HTMLElement);
          } else {
            offscreen.push(entry.target as HTMLElement);
          }
          s.observer!.unobserve(entry.target);
          observed++;
        }
        if (observed >= elements.length) {
          clearTimeout(fallbackTimeout);
          s.observer!.disconnect();
          s.observer = null;
          resolve();
        }
      },
      { threshold: 0 },
    );

    for (const el of elements) {
      s.observer.observe(el);
    }
  });

  if (s.cancelled) return;

  const orderedElements = [...visible, ...offscreen];
  const promises = orderedElements.map((el) => enqueue(s, el, targetLang));
  await Promise.all(promises);
}

/** 将新发现的元素加入当前翻译 session 的队列 */
export async function translateElements(
  elements: HTMLElement[],
  targetLang: string,
): Promise<void> {
  if (!session || session.cancelled) return;
  const promises = elements.map((el) => enqueue(session!, el, targetLang));
  await Promise.all(promises);
}

/** 当前是否有活跃的翻译 session（用于 MutationObserver 守卫） */
export function isSessionActive(): boolean {
  return !!session && !session.cancelled;
}

export function cancelTranslation() {
  if (session) {
    session.cancelled = true;
    session.queue = [];
    if (session.observer) {
      session.observer.disconnect();
      session.observer = null;
    }
  }
}

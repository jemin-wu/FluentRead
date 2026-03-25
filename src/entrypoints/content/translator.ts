/**
 * 翻译控制器 — DOM 遍历 + IntersectionObserver 可见区优先 + 并发控制
 */

import { translateText } from '@/services/translate';
import { getTranslatableElements } from '@/utils/dom-utils';
import { getFromCache, saveToCache } from '@/utils/storage';
import { renderTranslation, renderLoading, renderError } from './renderer';

const MAX_CONCURRENT = 3;
const REQUEST_INTERVAL_MS = 100;
const OBSERVER_TIMEOUT_MS = 2000;

interface TranslationSession {
  cancelled: boolean;
  activeRequests: number;
  queue: Array<() => void>;
  observer: IntersectionObserver | null;
}

let session: TranslationSession | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 完全占位保留的内联标签（内容不翻译） */
const PRESERVE_SELECTOR = 'code, sup, sub';

interface Placeholder {
  tag: string;
  content: string;
}

/** 链接信息（文字参与翻译，href 保留） */
interface LinkInfo {
  attrs: string;
}

interface Extracted {
  text: string;
  placeholders: Placeholder[];
  links: LinkInfo[];
}

function extractPlaceholders(el: HTMLElement): Extracted {
  const placeholders: Placeholder[] = [];
  const links: LinkInfo[] = [];

  // Fast path: skip cloneNode for plain-text elements
  if (!el.querySelector('a[href], code, sup, sub')) {
    return { text: el.innerText?.trim() || '', placeholders: [], links: [] };
  }

  const clone = el.cloneNode(true) as HTMLElement;

  // 1. 链接：用边界标记包裹文字，让文字参与翻译
  const linkEls = clone.querySelectorAll('a[href]');
  linkEls.forEach((a, i) => {
    const href = (a as HTMLAnchorElement).getAttribute('href') || '';
    const target = (a as HTMLAnchorElement).getAttribute('target');
    links.push({
      attrs: `href="${href}"${target ? ` target="${target}"` : ''}`,
    });
    a.replaceWith(`__LS${i}__${a.textContent || ''}__LE${i}__`);
  });

  // 2. code/sup/sub：完全占位，内容不翻译
  const preserved = clone.querySelectorAll(PRESERVE_SELECTOR);
  preserved.forEach((c, i) => {
    placeholders.push({ tag: c.tagName.toLowerCase(), content: c.textContent || '' });
    c.replaceWith(`__TAG_${i}__`);
  });

  const text = clone.innerText?.trim() || '';
  if (placeholders.length === 0 && links.length === 0) {
    return { text: el.innerText?.trim() || '', placeholders: [], links: [] };
  }

  return { text, placeholders, links };
}

function restorePlaceholders(
  translation: string,
  placeholders: Placeholder[],
  links: LinkInfo[],
): string | null {
  if (placeholders.length === 0 && links.length === 0) return null;

  let html = escapeHtml(translation);

  // 还原 code/sup/sub
  placeholders.forEach(({ tag, content }, i) => {
    const escaped = escapeHtml(content);
    const cls = tag === 'code' ? ' class="fluentread-code"' : '';
    html = html.replace(`__TAG_${i}__`, `<${tag}${cls}>${escaped}</${tag}>`);
  });

  // 还原链接边界标记 → <a> 标签（标记丢失则优雅降级为纯文本）
  links.forEach(({ attrs }, i) => {
    const re = new RegExp(`__LS${i}__(.+?)__LE${i}__`);
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
    if (s.cancelled) return;
    saveToCache(text, targetLang, translation);
    const html = restorePlaceholders(translation, placeholders, links);
    renderTranslation(el, translation, targetLang, html);
  } catch {
    if (s.cancelled) return;
    renderError(el, () => translateElement(s, el, targetLang));
  }
}

function enqueue(s: TranslationSession, el: HTMLElement, targetLang: string): Promise<void> {
  return new Promise((resolve) => {
    const run = async () => {
      s.activeRequests++;
      await translateElement(s, el, targetLang);
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

export async function translatePage(targetLang: string) {
  if (session) {
    session.cancelled = true;
    session.queue = [];
    if (session.observer) {
      session.observer.disconnect();
    }
  }

  const s: TranslationSession = { cancelled: false, activeRequests: 0, queue: [], observer: null };
  session = s;

  const elements = getTranslatableElements();
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

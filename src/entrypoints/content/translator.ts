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

function extractCodePlaceholders(el: HTMLElement): { text: string; codes: string[] } {
  const codes: string[] = [];
  const codeEls = el.querySelectorAll('code');

  if (codeEls.length === 0) {
    return { text: (el as HTMLElement).innerText?.trim() || '', codes: [] };
  }

  const clone = el.cloneNode(true) as HTMLElement;
  const cloneCodes = clone.querySelectorAll('code');
  cloneCodes.forEach((c, i) => {
    codes.push(c.textContent || '');
    c.replaceWith(`__CODE_${i}__`);
  });

  return { text: clone.innerText?.trim() || '', codes };
}

function restoreCodeTags(translation: string, codes: string[]): string | null {
  if (codes.length === 0) return null;

  let html = translation.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  codes.forEach((code, i) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(`__CODE_${i}__`, `<code class="fluentread-code">${escaped}</code>`);
  });

  return html;
}

async function translateElement(s: TranslationSession, el: HTMLElement, targetLang: string) {
  if (s.cancelled) return;

  const { text, codes } = extractCodePlaceholders(el);
  if (!text) return;

  const cached = getFromCache(text, targetLang);
  if (cached) {
    const html = restoreCodeTags(cached, codes);
    renderTranslation(el, cached, targetLang, html);
    return;
  }

  renderLoading(el);

  try {
    const translation = await translateText(text, targetLang);
    if (s.cancelled) return;
    saveToCache(text, targetLang, translation);
    const html = restoreCodeTags(translation, codes);
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

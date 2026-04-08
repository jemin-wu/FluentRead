/**
 * DOM utility functions for selecting and filtering translatable elements.
 */

import type { SiteAdapter } from './site-adapters';

const TRANSLATABLE_TAGS = new Set([
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'TD',
  'TH',
  'FIGCAPTION',
  'DT',
  'DD',
]);

const EXCLUDED_SELECTORS = [
  'nav',
  'footer',
  'header',
  'aside',
  'code',
  'pre',
  'script',
  'style',
  'noscript',
  'svg',
  '.fluentread-translation',
  'kbd',
  'samp',
  'var',
  '[contenteditable]',
  '[role="code"]',
];

const CODE_HOST_ALLOWED_CONTAINERS = [
  '.markdown-body',
  '.comment-body',
  '.js-comment-body',
  '.edit-comment-hide',
  '.TimelineItem-body',
  '.wiki-body',
  '.release-body',
  '.blog-post-body',
];

const MIN_TEXT_LENGTH = 5;

const CJK_REGEX =
  /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;

function isCodeHostingSite(): boolean {
  const host = location.hostname;
  return (
    host === 'github.com' ||
    host === 'gitlab.com' ||
    host === 'gitee.com' ||
    host === 'bitbucket.org' ||
    host === 'codeberg.org' ||
    host.endsWith('.github.io') ||
    host.endsWith('.gitlab.io') ||
    host.endsWith('.gitee.com') ||
    host.endsWith('.bitbucket.io')
  );
}

function looksLikeCode(text: string): boolean {
  if (!text || text.length < 10) return false;
  const codeChars = text.match(/[{}();[\]=<>/\\|@#$`~^]/g);
  if (!codeChars) return false;
  const ratio = codeChars.length / text.length;
  return ratio > 0.15;
}

export function isCJKDominant(text: string): boolean {
  if (!text) return false;
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return false;
  const matches = stripped.match(CJK_REGEX);
  const cjkCount = matches ? matches.length : 0;
  return cjkCount / stripped.length > 0.5;
}

export function shouldSkipElement(el: Element, skipContainerCheck = false): boolean {
  if (!el || !el.tagName) return true;

  if (!skipContainerCheck) {
    for (const selector of EXCLUDED_SELECTORS) {
      if (el.closest(selector)) return true;
    }

    if (isCodeHostingSite()) {
      const inAllowed = CODE_HOST_ALLOWED_CONTAINERS.some((sel) => el.closest(sel));
      if (!inAllowed) return true;
    }
  }

  const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();

  if (text.length < MIN_TEXT_LENGTH) return true;
  if (isCJKDominant(text)) return true;
  if (looksLikeCode(text)) return true;

  return false;
}

/** Remove parent elements when a child also appears in the list (avoids double-translation). */
export function deduplicateContained(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
}

export function getTranslatableElements(
  root: Document | HTMLElement = document,
  adapter?: SiteAdapter | null,
): HTMLElement[] {
  const useAdapter = adapter?.selectors?.length;
  const selector = useAdapter
    ? adapter.selectors.join(',')
    : Array.from(TRANSLATABLE_TAGS)
        .map((t) => t.toLowerCase())
        .join(',');
  const candidates = root.querySelectorAll<HTMLElement>(selector);
  const filtered: HTMLElement[] = [];

  for (const el of candidates) {
    if (!shouldSkipElement(el, !!useAdapter)) {
      filtered.push(el);
    }
  }

  return deduplicateContained(filtered);
}

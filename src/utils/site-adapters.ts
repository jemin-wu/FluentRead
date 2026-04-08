/**
 * 站点适配器 — 为特定网站提供自定义元素选择器和样式修复
 */

export interface SiteAdapter {
  /** 覆盖默认标签选择器的自定义 CSS 选择器 */
  selectors: string[];
  /** 注入到页面的额外 CSS（修复站点特定的样式问题） */
  extraCss?: string;
}

const twitterAdapter: SiteAdapter = {
  selectors: [
    '[data-testid="tweetText"]',
    '[data-testid="card.layoutSmall.detail"]',
    '[data-testid="card.layoutLarge.detail"]',
    '[data-testid="UserDescription"]',
  ],
  extraCss: `
    [data-testid="tweetText"]:has(.fluentread-translation),
    [data-testid="card.layoutSmall.detail"]:has(.fluentread-translation),
    [data-testid="card.layoutLarge.detail"]:has(.fluentread-translation),
    [data-testid="UserDescription"]:has(.fluentread-translation) {
      -webkit-line-clamp: unset !important;
      overflow: visible !important;
      max-height: none !important;
    }
  `,
};

const ADAPTERS: Record<string, SiteAdapter> = {
  'twitter.com': twitterAdapter,
  'x.com': twitterAdapter,
};

let injectedCss = false;

export function getSiteAdapter(): SiteAdapter | null {
  return ADAPTERS[location.hostname] ?? null;
}

export function injectAdapterCss(adapter: SiteAdapter): void {
  if (injectedCss || !adapter.extraCss) return;
  const style = document.createElement('style');
  style.textContent = adapter.extraCss;
  document.head.appendChild(style);
  injectedCss = true;
}

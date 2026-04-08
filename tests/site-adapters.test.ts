import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSiteAdapter, injectAdapterCss } from '../src/utils/site-adapters';

describe('site-adapters', () => {
  describe('getSiteAdapter', () => {
    it('returns twitter adapter for twitter.com', () => {
      vi.stubGlobal('location', { hostname: 'twitter.com' });
      const adapter = getSiteAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter!.selectors).toContain('[data-testid="tweetText"]');
    });

    it('returns twitter adapter for x.com', () => {
      vi.stubGlobal('location', { hostname: 'x.com' });
      const adapter = getSiteAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter!.selectors).toContain('[data-testid="tweetText"]');
    });

    it('returns same adapter object for twitter.com and x.com', () => {
      vi.stubGlobal('location', { hostname: 'twitter.com' });
      const twitter = getSiteAdapter();
      vi.stubGlobal('location', { hostname: 'x.com' });
      const x = getSiteAdapter();
      expect(twitter).toBe(x);
    });

    it('returns null for unknown hostname', () => {
      vi.stubGlobal('location', { hostname: 'example.com' });
      expect(getSiteAdapter()).toBeNull();
    });

    it('returns null for github.com', () => {
      vi.stubGlobal('location', { hostname: 'github.com' });
      expect(getSiteAdapter()).toBeNull();
    });

    it('twitter adapter includes card layout selectors', () => {
      vi.stubGlobal('location', { hostname: 'x.com' });
      const adapter = getSiteAdapter();
      expect(adapter!.selectors).toContain('[data-testid="card.layoutSmall.detail"]');
      expect(adapter!.selectors).toContain('[data-testid="card.layoutLarge.detail"]');
    });

    it('twitter adapter includes UserDescription selector', () => {
      vi.stubGlobal('location', { hostname: 'x.com' });
      const adapter = getSiteAdapter();
      expect(adapter!.selectors).toContain('[data-testid="UserDescription"]');
    });

    it('twitter adapter has extraCss', () => {
      vi.stubGlobal('location', { hostname: 'x.com' });
      const adapter = getSiteAdapter();
      expect(adapter!.extraCss).toBeDefined();
      expect(adapter!.extraCss).toContain('-webkit-line-clamp');
    });
  });

  describe('injectAdapterCss', () => {
    beforeEach(() => {
      document.head.innerHTML = '';
    });

    it('injects style element with adapter CSS', () => {
      const adapter = { selectors: [], extraCss: '.test { color: red; }' };
      // Reset injected state by reimporting (module state resets per test file)
      injectAdapterCss(adapter);
      const styles = document.head.querySelectorAll('style');
      expect(styles.length).toBeGreaterThanOrEqual(1);
      const lastStyle = styles[styles.length - 1];
      expect(lastStyle.textContent).toContain('.test');
    });

    it('does not inject when extraCss is undefined', () => {
      const adapter = { selectors: [] };
      const before = document.head.querySelectorAll('style').length;
      injectAdapterCss(adapter);
      expect(document.head.querySelectorAll('style').length).toBe(before);
    });

    it('injects CSS for multiple different adapters', () => {
      const adapterA = { selectors: [], extraCss: '.a { color: red; }' };
      const adapterB = { selectors: [], extraCss: '.b { color: blue; }' };
      const before = document.head.querySelectorAll('style').length;
      injectAdapterCss(adapterA);
      injectAdapterCss(adapterB);
      const styles = document.head.querySelectorAll('style');
      expect(styles.length).toBe(before + 2);
      expect(styles[styles.length - 2].textContent).toContain('.a');
      expect(styles[styles.length - 1].textContent).toContain('.b');
    });
  });
});
